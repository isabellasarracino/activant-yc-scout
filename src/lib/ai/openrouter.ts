import OpenAI from "openai";

/**
 * Switched from calling Anthropic directly to OpenRouter's OpenAI-compatible
 * endpoint, per explicit product decision (not a sandbox workaround this
 * time — a real, deliberate choice to reduce dependence on a single
 * provider's credit balance running out). This is the primary, most
 * heavily-documented way to reach Claude (and other models) through
 * OpenRouter — distinct from the narrower "Anthropic Messages API
 * passthrough" some CLI tools use, which exists mainly to support tools
 * built specifically against Anthropic's wire format.
 *
 * The tradeoff this forced: Anthropic's server-side `web_search` tool
 * (used by the old deep-dive scorer) has no equivalent here. Rather than
 * building custom search-API plumbing to replicate it, deep-dive scoring
 * dropped web search entirely — see scoreDeepDive in deepDive.ts and
 * docs/ARCHITECTURE.md#model-provider.
 *
 * Model slugs are env-overridable. OpenRouter's exact current slug for a
 * given Claude version can shift as new versions ship — defaults below
 * matched what was confirmed available on OpenRouter at the time this was
 * written. If a request 404s with "model not found," check
 * https://openrouter.ai/models and override via the env vars.
 */
let _client: OpenAI | null = null;
export function openrouterClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _client;
}

export const MODELS = {
  /** Evaluative tasks — triage and deep-dive scoring. */
  scoring: process.env.OPENROUTER_SCORING_MODEL ?? "anthropic/claude-sonnet-5",
  /** Structuring, not evaluative — founder extraction. Small/fast is enough. */
  extraction: process.env.OPENROUTER_EXTRACTION_MODEL ?? "anthropic/claude-haiku-4.5",
  /** Chat/Q&A. */
  chat: process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-5",
};

/**
 * A tool definition, provider-agnostic. `input_schema` is a JSON Schema
 * object — exactly what OpenAI/OpenRouter call `parameters`, so this maps
 * onto their tool format with no restructuring, just a rename.
 */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function toOpenAiTool(tool: ToolDef): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

export interface ForcedToolCallParams {
  model: string;
  maxTokens: number;
  userContent: string;
  tool: ToolDef;
}

export interface ForcedToolCallResult {
  input: unknown;
  /** OpenAI-style finish reason — "length" means the response was cut off before finishing. */
  finishReason: string | null;
}

/**
 * Single-shot "call exactly this tool, nothing else" pattern — shared by
 * triage scoring, deep-dive scoring, and founder extraction. All three
 * want one forced, structured response, no multi-turn loop. (The chat
 * feature's multi-turn tool loop is its own thing, in
 * src/lib/chat/answer.ts, since it genuinely needs multiple round trips.)
 */
export async function callForcedTool({ model, maxTokens, userContent, tool }: ForcedToolCallParams): Promise<ForcedToolCallResult> {
  const res = await openrouterClient().chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userContent }],
    tools: [toOpenAiTool(tool)],
    tool_choice: { type: "function", function: { name: tool.name } },
  });

  const choice = res.choices[0];
  const call = choice?.message?.tool_calls?.find((c) => c.type === "function");
  if (!call) {
    throw new Error(`Model did not return a "${tool.name}" tool call.`);
  }

  let input: unknown;
  try {
    input = JSON.parse(call.function.arguments);
  } catch {
    throw new Error(`Model's "${tool.name}" tool call had invalid JSON arguments: ${call.function.arguments}`);
  }

  return { input, finishReason: choice?.finish_reason ?? null };
}

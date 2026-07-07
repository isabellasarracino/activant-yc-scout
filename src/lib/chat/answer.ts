import type OpenAI from "openai";
import { openrouterClient, toOpenAiTool, MODELS } from "../ai/openrouter";
import type { PrismaLike } from "../db/prismaLike";
import { CHAT_TOOLS, dispatchChatTool } from "./tools";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "../scoring/rubric";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * Caps *tool-calling* round trips, not total conversation turns — most
 * questions resolve in 1-2 (e.g. search_companies then get_company).
 * Generous enough for a multi-step question ("find the strongest fintech
 * company, then tell me about its founders") without letting a confused
 * loop run away. If this is ever hit in practice, the loop still returns
 * a real answer (see the forced-final-turn fallback below) rather than
 * failing the request outright — a stale-but-real answer beats an error
 * for a chat feature.
 */
const MAX_TOOL_TURNS = 6;

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a research assistant for Activant Capital, a growth-equity firm, helping a team member explore Y Combinator batches that have been ingested and scored by this system.

Every company has been scored 0-10 on two independent rubrics:
1. Team & General Interest — ${TEAM_GENERAL_RUBRIC.dimensions.map((d) => d.label).join(", ")}.
2. Activant Thesis Fit — ${THESIS_FIT_RUBRIC.dimensions.map((d) => d.label).join(", ")}.

Every scored company gets exactly one primary category (whichever axis is stronger) — "secondaryTag: true" means it also genuinely clears a bar on the other axis, without being double-listed. "pass" is "triage" (metadata-only scoring) or "deep_dive" (also checked the company's own website) — deep_dive scores rest on more evidence.

You have tools to query the stored data — use them rather than guessing:
- list_batches to resolve a batch name to an id, or see what's available
- search_companies to find a company from a vague description, or list ones matching a theme
- list_top_companies for "best/top/most highly ranked" questions
- get_company for full detail (founders, rubric breakdown with rationales) once you know the slug

Call tools until you have enough to answer confidently, then answer in plain, natural prose — no need to dump raw JSON or restate every field. Cite specific evidence (scores, rationale, founder background) rather than vague praise. If a question is ambiguous (e.g. it's unclear which batch or which of two similarly-named companies), use search_companies/list_batches to try to resolve it yourself before asking the person to clarify. If the data genuinely doesn't contain something (e.g. asking about a company that hasn't been ingested), say so plainly rather than guessing.`;

/**
 * Answers a chat question by giving Claude read-only query tools over the
 * stored data and letting it decide what to look up (a RAG pattern over
 * our own database, not live web research) — see
 * docs/ARCHITECTURE.md#chat--qa for why this needs no separate
 * "historical batch" mode: querying an old batch works identically to a
 * new one once it's ingested.
 */
export async function answerChatQuestion(
  db: PrismaLike,
  question: string,
  history: ChatMessageInput[] = []
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h): ChatMessage => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];

  const tools = CHAT_TOOLS.map(toOpenAiTool);

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await openrouterClient().chat.completions.create({
      model: MODELS.chat,
      max_tokens: 1500,
      messages,
      tools,
    });

    const message = res.choices[0]?.message;
    const toolCalls = message?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return extractText(message?.content);
    }

    messages.push(message as ChatMessage);
    for (const call of toolCalls) {
      if (call.type !== "function") continue; // custom (non-function) tool calls aren't a shape we ever send
      const input = parseToolArguments(call.function.arguments);
      const result = await dispatchChatTool(db, call.function.name, input);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Hit the turn cap while still wanting to call tools — force a plain-text
  // answer from whatever's already been gathered rather than erroring out.
  // No `tools` passed here, deliberately, so the model can't keep looping.
  const finalRes = await openrouterClient().chat.completions.create({
    model: MODELS.chat,
    max_tokens: 1500,
    messages: [
      ...messages,
      { role: "user", content: "Answer now in plain text using what you've already found — don't call any more tools." },
    ],
  });
  return extractText(finalRes.choices[0]?.message?.content);
}

function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractText(content: string | null | undefined): string {
  const text = (content ?? "").trim();
  return text || "I wasn't able to find a clear answer to that from the stored data.";
}

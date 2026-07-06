import Anthropic from "@anthropic-ai/sdk";
import type { PrismaLike } from "../db/prismaLike";
import { CHAT_TOOLS, dispatchChatTool } from "./tools";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "../scoring/rubric";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const CHAT_MODEL = "claude-sonnet-5";

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

Every scored company gets exactly one primary category (whichever axis is stronger relative to a qualifying bar) — "secondaryTag: true" means it also genuinely clears the bar on the other axis, without being double-listed. Companies below the bar on both axes have primaryCategory: null and are unranked, but are still stored and searchable. "pass" is "triage" (metadata-only scoring) or "deep_dive" (also checked the company's website and did live web research) — deep_dive scores rest on more evidence.

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
 *
 * Not yet live-tested against a real API call (no key in the environment
 * this was built in) — unit-tested here against a mocked Anthropic
 * client, same pattern as scoreDeepDive. Watch, on the first real run,
 * whether MAX_TOOL_TURNS is generous/stingy enough in practice and
 * whether the forced-final-turn fallback ever actually triggers.
 */
export async function answerChatQuestion(
  db: PrismaLike,
  question: string,
  history: ChatMessageInput[] = []
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h): Anthropic.MessageParam => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const msg = await client().messages.create({
      model: CHAT_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: CHAT_TOOLS,
      messages,
    });

    const toolCalls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolCalls.length === 0) {
      return extractText(msg.content);
    }

    messages.push({ role: "assistant", content: msg.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolCalls.map(async (call) => ({
        type: "tool_result" as const,
        tool_use_id: call.id,
        content: JSON.stringify(await dispatchChatTool(db, call.name, call.input)),
      }))
    );
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the turn cap while still wanting to call tools — force a plain-text
  // answer from whatever's already been gathered rather than erroring out.
  const finalMsg = await client().messages.create({
    model: CHAT_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      ...messages,
      { role: "user", content: "Answer now in plain text using what you've already found — don't call any more tools." },
    ],
  });
  return extractText(finalMsg.content);
}

function extractText(content: Anthropic.ContentBlock[]): string {
  const text = content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "I wasn't able to find a clear answer to that from the stored data.";
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../lib/db/client";
import { answerChatQuestion } from "../../../lib/chat/answer";

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

/**
 * The chat/RAG endpoint — see docs/ARCHITECTURE.md#chat--qa. Takes a
 * question (plus optional prior turns, so a future frontend chat UI can
 * carry conversation context) and returns Claude's answer after it's
 * queried whatever stored data it needed via the tools in
 * src/lib/chat/tools.ts.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  try {
    const db = getDb();
    const answer = await answerChatQuestion(db, parsed.data.message, parsed.data.history);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

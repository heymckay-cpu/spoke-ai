import { Router, type IRouter } from "express";
import { db, qaConversationsTable, qaMessagesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  CreateQaConversationBody,
  GetQaConversationParams,
  SendQaMessageBody,
} from "@workspace/api-zod";
import { runQaAgent, QaUnavailableError, type QaAttachment, type QaHistoryMessage } from "../lib/qa/agent";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SerialisedMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  attachments: QaAttachment[];
  createdAt: string;
}

function serialiseMessage(row: typeof qaMessagesTable.$inferSelect): SerialisedMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    attachments: Array.isArray(row.attachments) ? (row.attachments as QaAttachment[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

router.post("/qa/conversations", async (req, res): Promise<void> => {
  const parsed = CreateQaConversationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const title = parsed.data.title?.trim() || "New conversation";
  const [row] = await db
    .insert(qaConversationsTable)
    .values({ title })
    .returning();
  if (!row) {
    res.status(500).json({ error: "Failed to create conversation" });
    return;
  }
  res.json({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString() });
});

router.get("/qa/conversations/:id", async (req, res): Promise<void> => {
  const params = GetQaConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const [conv] = await db
    .select()
    .from(qaConversationsTable)
    .where(eq(qaConversationsTable.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await db
    .select()
    .from(qaMessagesTable)
    .where(eq(qaMessagesTable.conversationId, id))
    .orderBy(asc(qaMessagesTable.createdAt), asc(qaMessagesTable.id));
  res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt.toISOString(),
    messages: messages.map(serialiseMessage),
  });
});

router.post("/qa/messages", async (req, res): Promise<void> => {
  const parsed = SendQaMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { conversationId, content } = parsed.data;
  const [conv] = await db
    .select()
    .from(qaConversationsTable)
    .where(eq(qaConversationsTable.id, conversationId));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Persist the user message immediately so it shows up in history even if
  // the LLM call fails — the UI will surface the failure separately.
  const [userRow] = await db
    .insert(qaMessagesTable)
    .values({ conversationId, role: "user", content })
    .returning();
  if (!userRow) {
    res.status(500).json({ error: "Failed to persist message" });
    return;
  }

  const priorMessages = await db
    .select()
    .from(qaMessagesTable)
    .where(eq(qaMessagesTable.conversationId, conversationId))
    .orderBy(asc(qaMessagesTable.createdAt), asc(qaMessagesTable.id));

  // Build history that excludes the just-inserted user row (it's passed
  // separately to the agent) and any past attachments — Claude doesn't need
  // the rendered tables, only the prose so it can keep context.
  const history: QaHistoryMessage[] = priorMessages
    .filter((m) => m.id !== userRow.id)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  try {
    const result = await runQaAgent(history, content);
    const [assistantRow] = await db
      .insert(qaMessagesTable)
      .values({
        conversationId,
        role: "assistant",
        content: result.text,
        attachments: result.attachments,
      })
      .returning();
    if (!assistantRow) {
      res.status(500).json({ error: "Failed to persist assistant reply" });
      return;
    }
    res.json({
      userMessage: serialiseMessage(userRow),
      assistantMessage: serialiseMessage(assistantRow),
    });
  } catch (err) {
    if (err instanceof QaUnavailableError) {
      logger.warn({ code: err.code, msg: err.message }, "QA agent unavailable");
      res.status(503).json({
        error: err.message || "AI is currently unavailable",
        code: err.code,
      });
      return;
    }
    logger.error({ err }, "QA agent failed");
    res.status(503).json({
      error: err instanceof Error ? err.message : "AI is currently unavailable",
      code: "unknown",
    });
  }
});

export default router;

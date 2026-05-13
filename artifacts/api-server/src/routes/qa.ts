import { Router, type IRouter } from "express";
import { db, qaConversationsTable, qaMessagesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import {
  CreateQaConversationBody,
  GetQaConversationParams,
  SendQaMessageBody,
} from "@workspace/api-zod";
import {
  runQaAgent,
  runQaAgentStreaming,
  QaUnavailableError,
  type QaAttachment,
  type QaHistoryMessage,
} from "../lib/qa/agent";
import { logger } from "../lib/logger";
import { getUserId } from "../middlewares/auth";

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
  const userId = getUserId(req);
  const parsed = CreateQaConversationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const title = parsed.data.title?.trim() || "New conversation";
  const [row] = await db
    .insert(qaConversationsTable)
    .values({ userId, title })
    .returning();
  if (!row) {
    res.status(500).json({ error: "Failed to create conversation" });
    return;
  }
  res.json({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString() });
});

router.get("/qa/conversations/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetQaConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const [conv] = await db
    .select()
    .from(qaConversationsTable)
    .where(and(eq(qaConversationsTable.id, id), eq(qaConversationsTable.userId, userId)));
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
  const userId = getUserId(req);
  const parsed = SendQaMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { conversationId, content } = parsed.data;
  const [conv] = await db
    .select()
    .from(qaConversationsTable)
    .where(and(eq(qaConversationsTable.id, conversationId), eq(qaConversationsTable.userId, userId)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

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

router.post("/qa/messages/stream", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = SendQaMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { conversationId, content } = parsed.data;
  const [conv] = await db
    .select()
    .from(qaConversationsTable)
    .where(and(eq(qaConversationsTable.id, conversationId), eq(qaConversationsTable.userId, userId)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

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

  const history: QaHistoryMessage[] = priorMessages
    .filter((m) => m.id !== userRow.id)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const send = (payload: Record<string, unknown>): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ type: "user_message", message: serialiseMessage(userRow) });

  try {
    const result = await runQaAgentStreaming(history, content, (event) => {
      send(event as unknown as Record<string, unknown>);
    });
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
      send({ type: "error", code: "unknown", error: "Failed to persist assistant reply" });
    } else {
      send({ type: "done", message: serialiseMessage(assistantRow) });
    }
  } catch (err) {
    if (err instanceof QaUnavailableError) {
      logger.warn({ code: err.code, msg: err.message }, "QA agent unavailable");
      send({ type: "error", code: err.code, error: err.message || "AI is currently unavailable" });
    } else {
      logger.error({ err }, "QA agent failed");
      send({
        type: "error",
        code: "unknown",
        error: err instanceof Error ? err.message : "AI is currently unavailable",
      });
    }
  } finally {
    res.end();
  }
});

export default router;

import { Router, type IRouter } from "express";
import { db, qaConversationsTable, qaMessagesTable } from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  CreateQaConversationBody,
  DeleteQaConversationParams,
  GetQaConversationParams,
  ListQaConversationsQueryParams,
  RenameQaConversationBody,
  RenameQaConversationParams,
  SendQaMessageBody,
} from "@workspace/api-zod";
import {
  runQaAgent,
  runQaAgentStreaming,
  QaUnavailableError,
  summariseTitle,
  type QaAttachment,
  type QaHistoryMessage,
} from "../lib/qa/agent";
import { logger } from "../lib/logger";
import { getUserId } from "../middlewares/auth";
import { requireCapability } from "../middlewares/tier";

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

function previewOf(text: string, max = 140): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

router.get("/qa/conversations", async (req, res): Promise<void> => {
  const parsed = ListQaConversationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { limit, offset } = parsed.data;

  // Pull one extra row so we can compute hasMore without a second count query.
  const rows = await db
    .select()
    .from(qaConversationsTable)
    .orderBy(desc(qaConversationsTable.createdAt), desc(qaConversationsTable.id));

  // Aggregate per-conversation last message + count in one pass over the
  // messages table. Cheaper than N round-trips and the message table stays
  // small in practice.
  const messages = await db
    .select()
    .from(qaMessagesTable)
    .orderBy(asc(qaMessagesTable.createdAt), asc(qaMessagesTable.id));
  const stats = new Map<number, { count: number; last: typeof messages[number] | null }>();
  for (const m of messages) {
    const cur = stats.get(m.conversationId) ?? { count: 0, last: null };
    cur.count += 1;
    cur.last = m; // last in chronological order
    stats.set(m.conversationId, cur);
  }

  const enriched = rows.map((c) => {
    const s = stats.get(c.id);
    const last = s?.last ?? null;
    const lastAt = last ? last.createdAt : c.createdAt;
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      lastMessageAt: last ? last.createdAt.toISOString() : null,
      lastMessagePreview: last ? previewOf(last.content) : null,
      messageCount: s?.count ?? 0,
      _sortAt: lastAt.getTime(),
    };
  });
  enriched.sort((a, b) => b._sortAt - a._sortAt);

  const window = enriched.slice(offset, offset + limit);
  const hasMore = enriched.length > offset + limit;

  res.json({
    conversations: window.map(({ _sortAt: _ignored, ...rest }) => {
      void _ignored;
      return rest;
    }),
    hasMore,
  });
});

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

router.patch("/qa/conversations/:id", async (req, res): Promise<void> => {
  const params = RenameQaConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RenameQaConversationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const id = params.data.id;
  const title = body.data.title.trim();
  if (!title) {
    res.status(400).json({ error: "Title cannot be empty" });
    return;
  }
  const [updated] = await db
    .update(qaConversationsTable)
    .set({ title })
    .where(eq(qaConversationsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({ id: updated.id, title: updated.title, createdAt: updated.createdAt.toISOString() });
});

router.delete("/qa/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteQaConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const deleted = await db
    .delete(qaConversationsTable)
    .where(eq(qaConversationsTable.id, id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/qa/messages", requireCapability("ai.qa"), async (req, res): Promise<void> => {
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

  // Detect first message — needed for auto-titling. We always re-fetch
  // priorMessages a few lines down anyway, but doing it before the insert
  // gives us the "is this the first?" signal without race conditions.
  const existing = await db
    .select()
    .from(qaMessagesTable)
    .where(eq(qaMessagesTable.conversationId, conversationId))
    .orderBy(asc(qaMessagesTable.createdAt), asc(qaMessagesTable.id));
  const existingCount = existing.length;

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

  // Auto-title from the first user message when the conversation still has
  // its placeholder title. Done synchronously so the rail reflects the new
  // name immediately on the next list refresh.
  if (existingCount === 0 && isPlaceholderTitle(conv.title)) {
    const newTitle = summariseTitle(content);
    if (newTitle && newTitle !== conv.title) {
      await db
        .update(qaConversationsTable)
        .set({ title: newTitle })
        .where(eq(qaConversationsTable.id, conversationId))
        .returning();
    }
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

router.post("/qa/messages/stream", requireCapability("ai.qa"), async (req, res): Promise<void> => {
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

  // Detect first message for auto-titling, mirroring the non-streaming endpoint.
  const existingStream = await db
    .select()
    .from(qaMessagesTable)
    .where(eq(qaMessagesTable.conversationId, conversationId))
    .orderBy(asc(qaMessagesTable.createdAt), asc(qaMessagesTable.id));
  const existingCountStream = existingStream.length;

  const [userRow] = await db
    .insert(qaMessagesTable)
    .values({ conversationId, role: "user", content })
    .returning();
  if (!userRow) {
    res.status(500).json({ error: "Failed to persist message" });
    return;
  }

  if (existingCountStream === 0 && isPlaceholderTitle(conv.title)) {
    const newTitle = summariseTitle(content);
    if (newTitle && newTitle !== conv.title) {
      await db
        .update(qaConversationsTable)
        .set({ title: newTitle })
        .where(eq(qaConversationsTable.id, conversationId))
        .returning();
    }
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

// Conversations created via the lazy "first send" flow on the web client land
// with the placeholder "Portfolio Q&A" or "New conversation" title. Anything
// else (including a user-renamed title that happens to match a prompt) is
// preserved as-is.
function isPlaceholderTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === "" || t === "new conversation" || t === "portfolio q&a";
}

export default router;

import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ConvRow { id: number; userId: string; title: string; createdAt: Date }
interface MsgRow {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  attachments: unknown;
  createdAt: Date;
}

const stores: {
  conversations: ConvRow[];
  messages: MsgRow[];
  nextConvId: number;
  nextMsgId: number;
} = {
  conversations: [],
  messages: [],
  nextConvId: 1,
  nextMsgId: 1,
};

vi.mock("@workspace/db", () => {
  const proxy = (name: string) =>
    new Proxy({ __t: name } as Record<string, unknown>, {
      get(t, prop: string) {
        if (prop === "__t") return t.__t;
        return { __c: prop };
      },
    });
  const conversationsT = proxy("conversations");
  const messagesT = proxy("messages");

  type Pred = (r: Record<string, unknown>) => boolean;

  const tableRows = (t: { __t: string }): Array<Record<string, unknown>> =>
    (t.__t === "conversations"
      ? (stores.conversations as unknown as Array<Record<string, unknown>>)
      : (stores.messages as unknown as Array<Record<string, unknown>>));

  const db = {
    insert: (table: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (table.__t === "conversations") {
            const row: ConvRow = {
              id: stores.nextConvId++,
              userId: (vals.userId as string) ?? "test-user",
              title: (vals.title as string) ?? "New",
              createdAt: new Date(),
            };
            stores.conversations.push(row);
            return [row];
          }
          const row: MsgRow = {
            id: stores.nextMsgId++,
            conversationId: vals.conversationId as number,
            role: vals.role as "user" | "assistant",
            content: vals.content as string,
            attachments: vals.attachments ?? [],
            createdAt: new Date(),
          };
          stores.messages.push(row);
          return [row];
        },
      }),
    }),
    update: (table: { __t: string }) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (predicate: Pred) => ({
          returning: async () => {
            const rows = tableRows(table);
            const updated: Array<Record<string, unknown>> = [];
            for (const r of rows) {
              if (predicate(r)) {
                Object.assign(r, patch);
                updated.push(r);
              }
            }
            return updated;
          },
        }),
      }),
    }),
    delete: (table: { __t: string }) => ({
      where: (predicate: Pred) => ({
        returning: async () => {
          const rows = tableRows(table);
          const removed: Array<Record<string, unknown>> = [];
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const r = rows[i];
            if (predicate(r)) {
              removed.push(r);
              rows.splice(i, 1);
            }
          }
          // Cascade delete messages when removing a conversation.
          if (table.__t === "conversations") {
            const removedIds = new Set(removed.map((r) => r.id as number));
            for (let i = stores.messages.length - 1; i >= 0; i -= 1) {
              if (removedIds.has(stores.messages[i].conversationId)) {
                stores.messages.splice(i, 1);
              }
            }
          }
          return removed.reverse();
        },
      }),
    }),
    select: () => {
      let table: { __t: string } = { __t: "" };
      let predicate: Pred | null = null;
      const exec = async () => {
        const rows = tableRows(table);
        return predicate ? rows.filter(predicate as (r: unknown) => boolean) : [...rows];
      };
      const chain: Record<string, unknown> = {};
      chain.from = (t: { __t: string }) => {
        table = t;
        return chain;
      };
      chain.where = (p?: Pred) => {
        if (typeof p === "function") predicate = p;
        return chain;
      };
      chain.orderBy = () => chain;
      chain.then = (
        resolve: (rows: unknown[]) => unknown,
        reject?: (e: unknown) => unknown,
      ) => exec().then(resolve, reject);
      return chain;
    },
  };

  return { db, qaConversationsTable: conversationsT, qaMessagesTable: messagesT };
});

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  and: (...predicates: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) => predicates.every((p) => p(r)),
  inArray: (col: { __c?: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__c ?? ""]),
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
}));

const tierMock = vi.fn();
vi.mock("../lib/tierStore", () => ({
  getCurrentTierForUser: () => tierMock(),
  setUserTier: vi.fn(),
  defaultTier: () => "free",
}));

const runAgentMock = vi.fn();
const runStreamingAgentMock = vi.fn();
vi.mock("../lib/qa/agent", () => {
  class QaUnavailableError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "QaUnavailableError";
    }
  }
  // Re-implement summariseTitle here so the route's auto-title logic exercises
  // a deterministic stub without dragging in tools.ts (which pulls drizzle's
  // `sql` helper that the drizzle mock above doesn't expose).
  const summariseTitle = (content: string): string => {
    const c = content.replace(/\s+/g, " ").trim();
    if (!c) return "New conversation";
    const max = 60;
    return c.length <= max ? c : c.slice(0, max) + "…";
  };
  return {
    runQaAgent: (...args: unknown[]) => runAgentMock(...args),
    runQaAgentStreaming: (...args: unknown[]) => runStreamingAgentMock(...args),
    summariseTitle,
    QaUnavailableError,
  };
});

let app: Express;

beforeEach(async () => {
  stores.conversations = [];
  stores.messages = [];
  stores.nextConvId = 1;
  stores.nextMsgId = 1;
  runAgentMock.mockReset();
  runStreamingAgentMock.mockReset();
  tierMock.mockReset();
  tierMock.mockResolvedValue("ultra");
  vi.resetModules();
  app = express();
  app.use(express.json());
  const router = (await import("./qa")).default;
  app.use("/api", router);
}, 30000);

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/qa/conversations", () => {
  it("creates a conversation with a default title", async () => {
    const r = await request(app).post("/api/qa/conversations").send({});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 1, title: "New conversation" });
    expect(stores.conversations).toHaveLength(1);
  });

  it("uses the supplied title when provided", async () => {
    const r = await request(app)
      .post("/api/qa/conversations")
      .send({ title: "PLTR analysis" });
    expect(r.body.title).toBe("PLTR analysis");
  });
});

describe("GET /api/qa/conversations", () => {
  it("returns an empty list when no conversations exist", async () => {
    const r = await request(app).get("/api/qa/conversations");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ conversations: [], hasMore: false });
  });

  it("orders by most-recent activity and includes preview + count", async () => {
    stores.conversations.push(
      { id: 1, userId: "test-user", title: "older", createdAt: new Date("2026-01-01") },
      { id: 2, userId: "test-user", title: "newer", createdAt: new Date("2026-02-01") },
    );
    stores.nextConvId = 3;
    stores.messages.push(
      {
        id: 1, conversationId: 1, role: "user", content: "hello there",
        attachments: [], createdAt: new Date("2026-05-10"),
      },
      {
        id: 2, conversationId: 1, role: "assistant", content: "hi",
        attachments: [], createdAt: new Date("2026-05-11"),
      },
      {
        id: 3, conversationId: 2, role: "user", content: "older convo last activity",
        attachments: [], createdAt: new Date("2026-03-01"),
      },
    );
    const r = await request(app).get("/api/qa/conversations");
    expect(r.status).toBe(200);
    expect(r.body.conversations.map((c: { id: number }) => c.id)).toEqual([1, 2]);
    expect(r.body.conversations[0]).toMatchObject({
      id: 1,
      title: "older",
      messageCount: 2,
      lastMessagePreview: "hi",
    });
    expect(r.body.hasMore).toBe(false);
  });

  it("paginates with limit + offset and reports hasMore", async () => {
    for (let i = 1; i <= 5; i += 1) {
      stores.conversations.push({
        id: i,
        userId: "test-user",
        title: `c${i}`,
        createdAt: new Date(`2026-01-0${i}`),
      });
    }
    stores.nextConvId = 6;
    const r = await request(app).get("/api/qa/conversations?limit=2&offset=0");
    expect(r.body.conversations).toHaveLength(2);
    expect(r.body.hasMore).toBe(true);
    const r2 = await request(app).get("/api/qa/conversations?limit=10&offset=4");
    expect(r2.body.conversations).toHaveLength(1);
    expect(r2.body.hasMore).toBe(false);
  });

  it("never lists another user's conversations or previews", async () => {
    stores.conversations.push(
      { id: 1, userId: "test-user", title: "mine", createdAt: new Date("2026-01-01") },
      { id: 2, userId: "someone-else", title: "theirs", createdAt: new Date("2026-02-01") },
    );
    stores.nextConvId = 3;
    stores.messages.push({
      id: 1, conversationId: 2, role: "user", content: "private message from another user",
      attachments: [], createdAt: new Date("2026-05-10"),
    });
    stores.nextMsgId = 2;
    const r = await request(app).get("/api/qa/conversations");
    expect(r.status).toBe(200);
    expect(r.body.conversations.map((c: { id: number }) => c.id)).toEqual([1]);
    expect(JSON.stringify(r.body)).not.toContain("private message");
  });
});

describe("PATCH /api/qa/conversations/:id", () => {
  it("refuses to rename another user's conversation", async () => {
    stores.conversations.push({ id: 1, userId: "someone-else", title: "theirs", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app)
      .patch("/api/qa/conversations/1")
      .send({ title: "hijacked" });
    expect(r.status).toBe(404);
    expect(stores.conversations[0].title).toBe("theirs");
  });

  it("renames an existing conversation", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "old", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app)
      .patch("/api/qa/conversations/1")
      .send({ title: "Brand new name" });
    expect(r.status).toBe(200);
    expect(r.body.title).toBe("Brand new name");
    expect(stores.conversations[0].title).toBe("Brand new name");
  });

  it("rejects empty titles", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "old", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app)
      .patch("/api/qa/conversations/1")
      .send({ title: "   " });
    expect(r.status).toBe(400);
  });

  it("returns 404 when the conversation is missing", async () => {
    const r = await request(app)
      .patch("/api/qa/conversations/999")
      .send({ title: "anything" });
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/qa/conversations/:id", () => {
  it("refuses to delete another user's conversation", async () => {
    stores.conversations.push({ id: 1, userId: "someone-else", title: "theirs", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app).delete("/api/qa/conversations/1");
    expect(r.status).toBe(404);
    expect(stores.conversations).toHaveLength(1);
  });

  it("removes the conversation and its messages", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    stores.messages.push({
      id: 1, conversationId: 1, role: "user", content: "hi",
      attachments: [], createdAt: new Date(),
    });
    stores.nextMsgId = 2;
    const r = await request(app).delete("/api/qa/conversations/1");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(stores.conversations).toHaveLength(0);
    expect(stores.messages).toHaveLength(0);
  });

  it("returns 404 when the conversation is missing", async () => {
    const r = await request(app).delete("/api/qa/conversations/999");
    expect(r.status).toBe(404);
  });
});

describe("GET /api/qa/conversations/:id", () => {
  it("returns 404 for a missing conversation", async () => {
    const r = await request(app).get("/api/qa/conversations/999");
    expect(r.status).toBe(404);
  });

  it("returns the conversation with serialised messages in order", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date("2026-05-01") });
    stores.nextConvId = 2;
    stores.messages.push(
      {
        id: 1, conversationId: 1, role: "user", content: "hi",
        attachments: [], createdAt: new Date("2026-05-02"),
      },
      {
        id: 2, conversationId: 1, role: "assistant", content: "hello",
        attachments: [{ type: "table", title: "x", columns: [], rows: [] }],
        createdAt: new Date("2026-05-03"),
      },
    );
    const r = await request(app).get("/api/qa/conversations/1");
    expect(r.status).toBe(200);
    expect(r.body.messages).toHaveLength(2);
    expect(r.body.messages[0].role).toBe("user");
    expect(r.body.messages[1].attachments[0].title).toBe("x");
  });
});

describe("POST /api/qa/messages", () => {
  it("returns 403 with a tier_required payload when the user lacks ai.qa", async () => {
    tierMock.mockResolvedValue("pro");
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 1, content: "hi" });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      code: "tier_required",
      capability: "ai.qa",
      required: "ultra",
      current: "pro",
    });
    // Importantly the agent should never have been called.
    expect(runAgentMock).not.toHaveBeenCalled();
    // And no message rows should have been written.
    expect(stores.messages).toHaveLength(0);
  });

  it("returns 404 when the conversation does not exist", async () => {
    const r = await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 999, content: "hi" });
    expect(r.status).toBe(404);
  });

  it("persists user + assistant messages on success", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    runAgentMock.mockResolvedValue({
      text: "Sure, here's the answer.",
      attachments: [{ type: "table", title: "T", columns: [], rows: [] }],
      toolCalls: [],
    });
    const r = await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 1, content: "what's my pnl?" });
    expect(r.status).toBe(200);
    expect(r.body.userMessage.content).toBe("what's my pnl?");
    expect(r.body.assistantMessage.content).toBe("Sure, here's the answer.");
    expect(r.body.assistantMessage.attachments).toHaveLength(1);
    expect(stores.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("auto-titles the conversation from the first user message", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "New conversation", createdAt: new Date() });
    stores.nextConvId = 2;
    runAgentMock.mockResolvedValue({ text: "ok", attachments: [], toolCalls: [] });
    await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 1, content: "Show me my worst-performing wheels this quarter please" });
    expect(stores.conversations[0].title).toContain("Show me my worst-performing wheels");
  });

  it("preserves a user-set title across follow-up messages", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "My PLTR research", createdAt: new Date() });
    stores.nextConvId = 2;
    stores.messages.push({
      id: 1, conversationId: 1, role: "user", content: "first",
      attachments: [], createdAt: new Date("2026-01-01"),
    });
    stores.nextMsgId = 2;
    runAgentMock.mockResolvedValue({ text: "ok", attachments: [], toolCalls: [] });
    await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 1, content: "another question" });
    expect(stores.conversations[0].title).toBe("My PLTR research");
  });

  it("returns 503 with a code when the agent reports the AI is unavailable", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    const { QaUnavailableError } = await import("../lib/qa/agent");
    runAgentMock.mockRejectedValue(new QaUnavailableError("rate_limit", "slow down"));
    const r = await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 1, content: "hello" });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "rate_limit" });
    expect(stores.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(stores.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });
});

describe("POST /api/qa/messages/stream", () => {
  it("returns 403 with a tier_required payload when the user lacks ai.qa", async () => {
    tierMock.mockResolvedValue("pro");
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    const r = await request(app)
      .post("/api/qa/messages/stream")
      .send({ conversationId: 1, content: "hi" });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      code: "tier_required",
      capability: "ai.qa",
      required: "ultra",
      current: "pro",
    });
    // The streaming agent should never have been called.
    expect(runStreamingAgentMock).not.toHaveBeenCalled();
    // And no message rows should have been written.
    expect(stores.messages).toHaveLength(0);
  });

  it("returns 404 when the conversation does not exist", async () => {
    const r = await request(app)
      .post("/api/qa/messages/stream")
      .send({ conversationId: 999, content: "hi" });
    expect(r.status).toBe(404);
  });

  it("streams text + tool events as SSE frames and persists both messages", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    runStreamingAgentMock.mockImplementation(
      async (_history: unknown, _msg: unknown, _userId: unknown, emit: (e: unknown) => void) => {
        emit({ type: "tool_start", name: "listPositions", label: "Looking up your positions…" });
        emit({ type: "tool_end", name: "listPositions" });
        emit({ type: "text", delta: "Here is " });
        emit({ type: "text", delta: "your answer." });
        return { text: "Here is your answer.", attachments: [], toolCalls: [] };
      },
    );

    const r = await request(app)
      .post("/api/qa/messages/stream")
      .send({ conversationId: 1, content: "what's my pnl?" });

    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/event-stream");
    const frames = r.text
      .split("\n\n")
      .filter((f) => f.startsWith("data:"))
      .map((f) => JSON.parse(f.replace(/^data:\s*/, "")));
    const types = frames.map((f) => f.type);
    expect(types).toEqual([
      "user_message",
      "tool_start",
      "tool_end",
      "text",
      "text",
      "done",
    ]);
    const done = frames.find((f) => f.type === "done");
    expect(done.message.content).toBe("Here is your answer.");
    expect(done.message.role).toBe("assistant");
    expect(stores.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("emits an error frame and skips the assistant write when the agent fails", async () => {
    stores.conversations.push({ id: 1, userId: "test-user", title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    const { QaUnavailableError } = await import("../lib/qa/agent");
    runStreamingAgentMock.mockRejectedValue(
      new QaUnavailableError("rate_limit", "slow down"),
    );

    const r = await request(app)
      .post("/api/qa/messages/stream")
      .send({ conversationId: 1, content: "hi" });

    expect(r.status).toBe(200);
    const frames = r.text
      .split("\n\n")
      .filter((f) => f.startsWith("data:"))
      .map((f) => JSON.parse(f.replace(/^data:\s*/, "")));
    const err = frames.find((f) => f.type === "error");
    expect(err).toMatchObject({ code: "rate_limit" });
    expect(stores.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(stores.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });
});

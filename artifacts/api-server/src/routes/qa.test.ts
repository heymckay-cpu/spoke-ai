import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ConvRow { id: number; title: string; createdAt: Date }
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

  const db = {
    insert: (table: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (table.__t === "conversations") {
            const row: ConvRow = {
              id: stores.nextConvId++,
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
    select: () => {
      let table: { __t: string } = { __t: "" };
      let predicate: ((r: Record<string, unknown>) => boolean) | null = null;
      const exec = async () => {
        const rows =
          table.__t === "conversations"
            ? stores.conversations
            : stores.messages;
        return predicate ? rows.filter(predicate as (r: unknown) => boolean) : [...rows];
      };
      const chain: Record<string, unknown> = {};
      chain.from = (t: { __t: string }) => {
        table = t;
        return chain;
      };
      chain.where = (p?: (r: Record<string, unknown>) => boolean) => {
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

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
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
  return {
    runQaAgent: (...args: unknown[]) => runAgentMock(...args),
    runQaAgentStreaming: (...args: unknown[]) => runStreamingAgentMock(...args),
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
  vi.resetModules();
  app = express();
  app.use(express.json());
  const router = (await import("./qa")).default;
  app.use("/api", router);
});

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

describe("GET /api/qa/conversations/:id", () => {
  it("returns 404 for a missing conversation", async () => {
    const r = await request(app).get("/api/qa/conversations/999");
    expect(r.status).toBe(404);
  });

  it("returns the conversation with serialised messages in order", async () => {
    stores.conversations.push({ id: 1, title: "x", createdAt: new Date("2026-05-01") });
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
  it("returns 404 when the conversation does not exist", async () => {
    const r = await request(app)
      .post("/api/qa/messages")
      .send({ conversationId: 999, content: "hi" });
    expect(r.status).toBe(404);
  });

  it("persists user + assistant messages on success", async () => {
    stores.conversations.push({ id: 1, title: "x", createdAt: new Date() });
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

  it("returns 503 with a code when the agent reports the AI is unavailable", async () => {
    stores.conversations.push({ id: 1, title: "x", createdAt: new Date() });
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
  it("returns 404 when the conversation does not exist", async () => {
    const r = await request(app)
      .post("/api/qa/messages/stream")
      .send({ conversationId: 999, content: "hi" });
    expect(r.status).toBe(404);
  });

  it("streams text + tool events as SSE frames and persists both messages", async () => {
    stores.conversations.push({ id: 1, title: "x", createdAt: new Date() });
    stores.nextConvId = 2;
    runStreamingAgentMock.mockImplementation(
      async (_history: unknown, _msg: unknown, emit: (e: unknown) => void) => {
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
    stores.conversations.push({ id: 1, title: "x", createdAt: new Date() });
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

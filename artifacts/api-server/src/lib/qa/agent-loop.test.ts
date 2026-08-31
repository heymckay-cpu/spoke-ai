import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We mock the Anthropic SDK at the integration layer so we can drive the
// tool-use loop deterministically. The mock's `messages.create` returns a
// queued list of pre-canned responses, so a test can simulate "model asks
// for a tool, then answers in prose".

const createMock = vi.fn();

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: createMock } },
  AnthropicNotConfiguredError: class extends Error {},
}));

const handlersForUser = vi.fn();

vi.mock("./tools", () => ({
  TOOL_DEFINITIONS: [
    { name: "listPositions", description: "", input_schema: { type: "object", properties: {} } },
  ],
  createToolHandlers: (userId: string) => {
    handlersForUser(userId);
    return {
      listPositions: vi.fn(async (input: unknown) => ({
        total: 1,
        positions: [{ id: 1, ticker: (input as { ticker?: string })?.ticker ?? "AAPL", status: "open" }],
      })),
    };
  },
}));

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runQaAgent loop", () => {
  it("executes a tool_use → tool_result roundtrip and returns the final prose", async () => {
    createMock
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_1", name: "listPositions", input: { ticker: "AAPL" } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "You have 1 open AAPL position." }],
      });

    const { runQaAgent } = await import("./agent");
    const result = await runQaAgent([], "How many open AAPL positions do I have?", "user-1");

    expect(result.text).toBe("You have 1 open AAPL position.");
    expect(result.toolCalls).toEqual([
      { name: "listPositions", input: { ticker: "AAPL" } },
    ]);
    // Two model calls: initial + post-tool follow-up
    expect(createMock).toHaveBeenCalledTimes(2);
    // Second call's messages must include a tool_result block referencing
    // the right id. The messages array is mutated by the loop after this
    // call (the final assistant text gets appended), so we hunt for the
    // tool_result block instead of relying on its index.
    const secondCall = createMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolResultMsg = secondCall.messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>)[0]?.type === "tool_result",
    );
    expect(toolResultMsg).toBeDefined();
    const blocks = toolResultMsg!.content as Array<{ type: string; tool_use_id?: string }>;
    expect(blocks[0].tool_use_id).toBe("toolu_1");
  });

  it("rejects unknown tool names with an is_error tool_result instead of crashing", async () => {
    createMock
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "toolu_2", name: "deletePosition", input: {} }],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "I can't do that." }],
      });
    const { runQaAgent } = await import("./agent");
    const result = await runQaAgent([], "delete position 1", "user-1");
    expect(result.text).toBe("I can't do that.");
    const secondCall = createMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolResultMsg = secondCall.messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>)[0]?.type === "tool_result",
    );
    const blocks = toolResultMsg!.content as Array<{ is_error?: boolean; content: string }>;
    expect(blocks[0].is_error).toBe(true);
    expect(blocks[0].content).toContain("not in the read-only allowlist");
  });

  it("wraps SDK errors as QaUnavailableError with a classified code", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const { runQaAgent, QaUnavailableError } = await import("./agent");
    let caught: unknown = null;
    try {
      await runQaAgent([], "anything", "user-1");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QaUnavailableError);
    expect((caught as { code: string }).code).toBe("rate_limit");
  });

  it("parses fenced attachments out of the final answer", async () => {
    const att = JSON.stringify({
      type: "table",
      title: "Open positions",
      columns: [{ key: "ticker", label: "Ticker" }],
      rows: [{ ticker: "AAPL" }],
    });
    createMock.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: `Here it is:\n\n\`\`\`attachment\n${att}\n\`\`\`` }],
    });
    const { runQaAgent } = await import("./agent");
    const result = await runQaAgent([], "open positions", "user-1");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].title).toBe("Open positions");
    expect(result.text).toContain("Here it is:");
    expect(result.text).not.toContain("```attachment");
  });
});

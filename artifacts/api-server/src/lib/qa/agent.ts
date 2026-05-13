import { anthropic, AnthropicNotConfiguredError } from "@workspace/integrations-anthropic-ai";
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from "./tools";

// Run a tool-use loop with Claude until it stops calling tools (or we hit a
// max-iteration safety cap). Returns the final assistant text plus any
// structured attachments parsed out of the answer (rendered tables, etc).

export type QaRole = "user" | "assistant";

export interface QaHistoryMessage {
  role: QaRole;
  content: string;
}

export interface QaAttachment {
  type: "table";
  title: string;
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, unknown>>;
  deepLinkColumn?: string | null;
}

export interface QaAgentResult {
  text: string;
  attachments: QaAttachment[];
  toolCalls: Array<{ name: string; input: unknown }>;
}

export type QaErrorCode =
  | "unavailable"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "unknown";

export class QaUnavailableError extends Error {
  code: QaErrorCode;
  constructor(code: QaErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "QaUnavailableError";
  }
}

const SYSTEM_PROMPT = `You are the in-app analyst for a wheel-strategy options dashboard. \
The user will ask plain-English questions about THEIR portfolio — open and closed sold puts, \
realized P/L, scan candidates, holdings. Answer ONLY using data returned from the provided tools. \
Never invent positions, prices, or stats. If a tool returns no data, say so plainly.

When tabular data would help the answer (a list of trades, a per-ticker breakdown, ranked \
candidates), include it as a fenced code block with the language tag \`attachment\`. The block \
body must be a single JSON object of shape:

\`\`\`attachment
{
  "type": "table",
  "title": "Worst-performing wheels (last 90d)",
  "columns": [
    {"key":"ticker","label":"Ticker"},
    {"key":"realizedPnl","label":"Realized P/L","align":"right"}
  ],
  "rows": [{"ticker":"PLTR","realizedPnl":-432.10}],
  "deepLinkColumn": "ticker"
}
\`\`\`

When you set \`deepLinkColumn\`, every row in that column will become an in-app link to the \
relevant page (positions for position rows, /chain/<TICKER> for ticker rows, etc.). Keep prose \
short — let the table do the heavy lifting. Never describe what you are about to do; just answer.

You are READ-ONLY. Never claim to have closed, opened, rolled, or modified anything.`;

const MAX_ITERATIONS = 6;

interface AnthropicTextBlock { type: "text"; text: string }
interface AnthropicToolUseBlock { type: "tool_use"; id: string; name: string; input: unknown }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string; [k: string]: unknown };

interface AnthropicMessage {
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

function classifyError(err: unknown): QaErrorCode {
  if (err instanceof AnthropicNotConfiguredError) return "unavailable";
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { status?: number; error?: { type?: string }; name?: string };
  if (e.status === 401 || e.status === 403) return "auth";
  if (e.status === 429) return "rate_limit";
  if (e.status === 408 || e.name === "AbortError") return "timeout";
  if (e.error?.type === "rate_limit_error") return "rate_limit";
  if (e.error?.type === "authentication_error") return "auth";
  if (e.error?.type === "overloaded_error") return "unavailable";
  if (e.status && e.status >= 500) return "unavailable";
  return "unknown";
}

export function parseAttachments(text: string): { stripped: string; attachments: QaAttachment[] } {
  // Pull out ```attachment\n{...}\n``` fenced blocks. Anything that fails to
  // parse is left in the text so the user still sees it (better than a
  // silent dropped section).
  const attachments: QaAttachment[] = [];
  const fence = /```attachment\s*\n([\s\S]*?)```/g;
  const stripped = text.replace(fence, (_match, body: string) => {
    try {
      const parsed = JSON.parse(body) as QaAttachment;
      if (parsed && parsed.type === "table" && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        attachments.push(parsed);
        return "";
      }
    } catch {
      /* fall through — keep the raw block */
    }
    return _match;
  });
  return { stripped: stripped.replace(/\n{3,}/g, "\n\n").trim(), attachments };
}

export async function runQaAgent(
  history: QaHistoryMessage[],
  userMessage: string,
): Promise<QaAgentResult> {
  // Anthropic message-format chat history. Tool-use turns get appended on
  // each iteration; we keep going until the model returns end_turn (or we
  // hit MAX_ITERATIONS as a safety net).
  type LoopMessage = { role: "user" | "assistant"; content: unknown };
  const messages: LoopMessage[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: userMessage },
  ];

  const toolCalls: Array<{ name: string; input: unknown }> = [];
  let finalText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: AnthropicMessage;
    try {
      response = (await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as unknown as Parameters<typeof anthropic.messages.create>[0]["tools"],
        messages: messages as Parameters<typeof anthropic.messages.create>[0]["messages"],
      })) as unknown as AnthropicMessage;
    } catch (err) {
      const code = classifyError(err);
      throw new QaUnavailableError(code, err instanceof Error ? err.message : String(err));
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      // Concatenate any text blocks into the final answer.
      finalText = response.content
        .filter((b): b is AnthropicTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n")
        .trim();
      break;
    }

    // Execute every tool_use block in the response and feed results back as
    // a single user message of tool_result blocks.
    const toolUses = response.content.filter(
      (b): b is AnthropicToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const use of toolUses) {
      toolCalls.push({ name: use.name, input: use.input });
      const handler = TOOL_HANDLERS[use.name];
      if (!handler) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify({ error: `tool '${use.name}' is not in the read-only allowlist` }),
          is_error: true,
        });
        continue;
      }
      try {
        const result = await handler(use.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result).slice(0, 60_000),
        });
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) finalText = "I couldn't put together an answer. Try rephrasing the question.";
  const { stripped, attachments } = parseAttachments(finalText);
  return { text: stripped, attachments, toolCalls };
}

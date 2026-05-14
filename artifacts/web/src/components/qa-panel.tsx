import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  useCreateQaConversation,
  useGetQaConversation,
  getGetQaConversationQueryKey,
  getListQaConversationsQueryKey,
  type QaMessage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { QaMessageBubble } from "@/components/qa-message";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "Show me my worst-performing wheels this quarter",
  "Which open positions have earnings inside the DTE window?",
  "What's my realized premium on PLTR all-time?",
  "Top wheel candidates today, excluding earnings",
  "Annualized yield by ticker on closed trades",
  "Open positions sorted by assignment risk",
];

interface QaPanelProps {
  className?: string;
  /** Active conversation id from the route, or null when starting fresh. */
  conversationId: number | null;
  /**
   * Called when a brand-new conversation is created lazily (the user typed a
   * first message on `/ask`). The parent should sync the URL to `/ask/<id>`.
   */
  onConversationCreated: (id: number) => void;
}

interface QaErrorPayload {
  error: string;
  code?: string;
}

function describeError(payload: QaErrorPayload | null | undefined): { title: string; body: string } {
  const code = payload?.code ?? "unavailable";
  switch (code) {
    case "rate_limit":
      return {
        title: "AI rate limit reached",
        body: "Too many requests just now. Wait a minute and try again.",
      };
    case "auth":
      return {
        title: "AI auth failed",
        body: "The AI provider rejected the request. The key may have rotated — try again in a moment.",
      };
    case "unauthenticated":
      return {
        title: "Sign in required",
        body: payload?.error ?? "You need to be signed in to use the AI assistant.",
      };
    case "timeout":
      return {
        title: "AI timed out",
        body: "The model took too long to respond. Try a simpler question or retry.",
      };
    case "unavailable":
      return {
        title: "AI features unavailable",
        body: payload?.error ?? "The AI provider isn't responding right now. Try again in a few minutes.",
      };
    default:
      return {
        title: "AI features unavailable",
        body: payload?.error ?? "Something went wrong. Try again.",
      };
  }
}

export function QaPanel({ className, conversationId, onConversationCreated }: QaPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [errorPayload, setErrorPayload] = useState<QaErrorPayload | null>(null);
  const [optimisticUser, setOptimisticUser] = useState<QaMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset transient state whenever the route conversation id changes — stale
  // optimistic bubbles or error banners from another conversation would be
  // confusing.
  useEffect(() => {
    setOptimisticUser(null);
    setErrorPayload(null);
  }, [conversationId]);

  const conversationQuery = useGetQaConversation(conversationId ?? 0, {
    query: {
      enabled: conversationId != null,
      queryKey: getGetQaConversationQueryKey(conversationId ?? 0),
    },
  });

  const createMutation = useCreateQaConversation();
  const { session } = useClerk();
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const messages: QaMessage[] = conversationQuery.data?.messages ?? [];
  const showOptimistic =
    optimisticUser && !messages.some((m) => m.id === optimisticUser.id);

  // Auto-scroll to the bottom whenever new messages land.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming, streamingText, toolStatus, errorPayload]);

  async function ensureConversationId(): Promise<number> {
    if (conversationId != null) return conversationId;
    const created = await createMutation.mutateAsync({ data: {} });
    onConversationCreated(created.id);
    return created.id;
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setErrorPayload(null);
    setDraft("");
    setStreamingText("");
    setToolStatus(null);
    let cid: number;
    try {
      cid = await ensureConversationId();
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI features unavailable";
      setErrorPayload({ error: message });
      return;
    }

    setOptimisticUser({
      id: -Date.now(),
      conversationId: cid,
      role: "user",
      content: trimmed,
      attachments: [],
      createdAt: new Date().toISOString(),
    });
    setIsStreaming(true);

    const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
    const url = `${apiBase}/api/qa/messages/stream`;
    let streamErrored = false;
    try {
      const token = session ? await session.getToken() : null;
      if (!token) {
        streamErrored = true;
        setErrorPayload({ error: "You need to be signed in to use the AI assistant.", code: "unauthenticated" });
        return;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId: cid, content: trimmed }),
      });
      if (!res.ok || !res.body) {
        let payload: QaErrorPayload = { error: `AI request failed (${res.status})` };
        try {
          payload = (await res.json()) as QaErrorPayload;
        } catch {
          /* leave default */
        }
        setErrorPayload(payload);
        streamErrored = true;
      } else {
        await consumeStream(res.body, {
          onText: (delta) => setStreamingText((prev) => prev + delta),
          onToolStart: (label) => setToolStatus(label),
          onToolEnd: () => setToolStatus(null),
          onError: (payload) => {
            streamErrored = true;
            setErrorPayload(payload);
          },
        });
      }
    } catch (err) {
      streamErrored = true;
      setErrorPayload({ error: err instanceof Error ? err.message : "AI features unavailable" });
    } finally {
      setIsStreaming(false);
      setStreamingText("");
      setToolStatus(null);
      // Always refetch — on success it picks up the persisted assistant
      // row; on error it at least shows the persisted user message.
      await queryClient.invalidateQueries({ queryKey: getGetQaConversationQueryKey(cid) });
      // The rail's preview / order needs to reflect the new traffic too.
      await queryClient.invalidateQueries({
        queryKey: getListQaConversationsQueryKey({ limit: 50, offset: 0 }),
      });
      setOptimisticUser(null);
      if (streamErrored) {
        // Surface a generic failure if the stream died without sending an
        // explicit error frame.
        setErrorPayload((cur) => cur ?? { error: "AI features unavailable" });
      }
    }
  }

  const isLoadingConv = conversationQuery.isLoading && conversationId != null;
  const errorView = errorPayload ? describeError(errorPayload) : null;

  return (
    <div className={cn("flex h-full flex-col", className)} data-testid="qa-panel">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {messages.length === 0 && !showOptimistic && !isLoadingConv && (
          <div className="mx-auto max-w-2xl space-y-4 py-6 text-center" data-testid="qa-empty-state">
            <div className="flex justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Ask your portfolio anything</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Plain-English questions over your real positions, scans and holdings.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-card/70"
                  data-testid="qa-suggested-prompt"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoadingConv && (
          <div className="flex h-32 items-center justify-center">
            <SpokeSpinner />
          </div>
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((m) => (
            <QaMessageBubble key={m.id} message={m} />
          ))}
          {showOptimistic && optimisticUser && (
            <QaMessageBubble message={optimisticUser} />
          )}
          {isStreaming && (streamingText.length > 0 || toolStatus) && (
            <div data-testid="qa-streaming">
              <QaMessageBubble
                message={{
                  id: -1,
                  conversationId: conversationId ?? 0,
                  role: "assistant",
                  content:
                    streamingText.length > 0
                      ? streamingText
                      : toolStatus ?? "Thinking…",
                  attachments: [],
                  createdAt: new Date().toISOString(),
                }}
              />
              {toolStatus && (
                <div
                  className="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground"
                  data-testid="qa-tool-status"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {toolStatus}
                </div>
              )}
            </div>
          )}
          {isStreaming && streamingText.length === 0 && !toolStatus && (
            <div
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
              data-testid="qa-thinking"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          {errorView && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="qa-error"
              role="alert"
            >
              <div className="font-semibold">{errorView.title}</div>
              <div className="text-xs opacity-90">{errorView.body}</div>
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur md:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(draft);
              }
            }}
            placeholder="Ask about your positions, scans, or holdings…"
            rows={2}
            className="min-h-[56px] resize-none"
            data-testid="qa-input"
            disabled={isStreaming}
          />
          <Button
            type="submit"
            disabled={!draft.trim() || isStreaming}
            className="h-12"
            data-testid="qa-send"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface StreamHandlers {
  onText: (delta: string) => void;
  onToolStart: (label: string) => void;
  onToolEnd: (name: string) => void;
  onError: (payload: QaErrorPayload) => void;
}

// Read an SSE response body frame-by-frame and dispatch parsed events to
// the handlers. Stops when the upstream closes or an error frame arrives.
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        let parsed: { type?: string; [k: string]: unknown };
        try {
          parsed = JSON.parse(dataLines.join("\n")) as { type?: string };
        } catch {
          continue;
        }
        switch (parsed.type) {
          case "text":
            if (typeof parsed.delta === "string") handlers.onText(parsed.delta);
            break;
          case "tool_start":
            if (typeof parsed.label === "string") handlers.onToolStart(parsed.label);
            break;
          case "tool_end":
            if (typeof parsed.name === "string") handlers.onToolEnd(parsed.name);
            break;
          case "error":
            handlers.onError({
              error: typeof parsed.error === "string" ? parsed.error : "AI features unavailable",
              code: typeof parsed.code === "string" ? parsed.code : undefined,
            });
            break;
          // user_message / done are handled implicitly via the post-stream
          // refetch of the conversation.
          default:
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

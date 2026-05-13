import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  useCreateQaConversation,
  useGetQaConversation,
  useSendQaMessage,
  getGetQaConversationQueryKey,
  type QaMessage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { QaMessageBubble } from "@/components/qa-message";
import { cn } from "@/lib/utils";

// Conversation id is kept in sessionStorage so a page reload preserves
// scroll-back, but a fresh browser session starts clean. We keep this lazy —
// no conversation row exists until the user sends their first message.
const STORAGE_KEY = "wheel.qa.conversationId";

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

export function QaPanel({ className }: QaPanelProps) {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  });
  const [draft, setDraft] = useState("");
  const [errorPayload, setErrorPayload] = useState<QaErrorPayload | null>(null);
  const [optimisticUser, setOptimisticUser] = useState<QaMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationQuery = useGetQaConversation(conversationId ?? 0, {
    query: {
      enabled: conversationId != null,
      queryKey: getGetQaConversationQueryKey(conversationId ?? 0),
    },
  });

  const createMutation = useCreateQaConversation();
  const sendMutation = useSendQaMessage();

  const messages: QaMessage[] = conversationQuery.data?.messages ?? [];
  const showOptimistic =
    optimisticUser && !messages.some((m) => m.id === optimisticUser.id);

  // Auto-scroll to the bottom whenever new messages land.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sendMutation.isPending, errorPayload]);

  async function ensureConversationId(): Promise<number> {
    if (conversationId != null) return conversationId;
    const created = await createMutation.mutateAsync({ data: { title: "Portfolio Q&A" } });
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, String(created.id));
    }
    setConversationId(created.id);
    return created.id;
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    setErrorPayload(null);
    setDraft("");
    try {
      const cid = await ensureConversationId();
      setOptimisticUser({
        id: -Date.now(),
        conversationId: cid,
        role: "user",
        content: trimmed,
        attachments: [],
        createdAt: new Date().toISOString(),
      });
      await sendMutation.mutateAsync({
        data: { conversationId: cid, content: trimmed },
      });
      await queryClient.invalidateQueries({ queryKey: getGetQaConversationQueryKey(cid) });
      setOptimisticUser(null);
    } catch (err: unknown) {
      // Pull structured error payload off the failing fetch when possible.
      let payload: QaErrorPayload = { error: "AI features unavailable" };
      const e = err as { response?: Response; message?: string; data?: QaErrorPayload };
      if (e?.data && typeof e.data === "object") {
        payload = { error: e.data.error ?? "AI features unavailable", code: e.data.code };
      } else if (e?.response instanceof Response) {
        try {
          payload = (await e.response.clone().json()) as QaErrorPayload;
        } catch {
          /* ignore */
        }
      } else if (e?.message) {
        payload = { error: e.message };
      }
      setErrorPayload(payload);
      // Refetch so the persisted user message still shows up even if the
      // assistant reply failed.
      if (conversationId != null) {
        await queryClient.invalidateQueries({ queryKey: getGetQaConversationQueryKey(conversationId) });
      }
      setOptimisticUser(null);
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
          {sendMutation.isPending && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground" data-testid="qa-thinking">
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
            disabled={sendMutation.isPending}
          />
          <Button
            type="submit"
            disabled={!draft.trim() || sendMutation.isPending}
            className="h-12"
            data-testid="qa-send"
          >
            {sendMutation.isPending ? (
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

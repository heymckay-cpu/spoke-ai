import { useEffect } from "react";
import {
  useExplainCandidate,
  type Candidate,
  type CandidateExplanation,
  CandidateExplanationVerdict,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { cn } from "@/lib/utils";

type Verdict = (typeof CandidateExplanationVerdict)[keyof typeof CandidateExplanationVerdict];

const VERDICT_META: Record<
  Verdict,
  { label: string; classes: string; icon: typeof CheckCircle2 }
> = {
  good_fit: {
    label: "Good fit",
    classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  mixed: {
    label: "Mixed",
    classes: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: Sparkles,
  },
  avoid: {
    label: "Avoid",
    classes: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
    icon: AlertTriangle,
  },
};

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: Verdict;
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        meta.classes,
        className,
      )}
      data-testid={`verdict-badge-${verdict}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export interface AiCandidateExplanationProps {
  candidate: Candidate;
  variant?: "inline" | "full";
  /** Auto-fetch on mount instead of waiting for a click. */
  autoLoad?: boolean;
  className?: string;
}

export function AiCandidateExplanation({
  candidate,
  variant = "full",
  autoLoad = true,
  className,
}: AiCandidateExplanationProps) {
  const mutation = useExplainCandidate();
  const data: CandidateExplanation | undefined = mutation.data;

  const fetchExplain = (regenerate = false) => {
    mutation.mutate({
      data: {
        ticker: candidate.ticker,
        strike: candidate.strike,
        expiry: candidate.expiry,
        regenerate,
      },
    });
  };

  // Reset and refetch when the candidate identity changes.
  useEffect(() => {
    if (!autoLoad) return;
    mutation.reset();
    mutation.mutate({
      data: {
        ticker: candidate.ticker,
        strike: candidate.strike,
        expiry: candidate.expiry,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.ticker, candidate.strike, candidate.expiry, autoLoad]);

  if (mutation.isPending && !data) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          variant === "full" && "rounded-md border border-dashed border-border px-3 py-2.5",
          className,
        )}
        data-testid="ai-explain-loading"
      >
        <SpokeSpinner size={12} label="Asking Claude" />
        <span>Asking Claude…</span>
      </div>
    );
  }

  if (mutation.isError && !data) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400",
          className,
        )}
      >
        <span>Couldn't load explanation.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => fetchExplain()}
          data-testid="ai-explain-retry"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 text-xs leading-relaxed text-muted-foreground",
          className,
        )}
        data-testid="ai-explain-inline"
      >
        <VerdictBadge verdict={data.verdict} className="shrink-0" />
        <span className="text-foreground/90">{data.summary}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-lg border border-border bg-card/60 p-4", className)}
      data-testid="ai-explain-full"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            AI rationale
          </span>
          <VerdictBadge verdict={data.verdict} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => fetchExplain(true)}
          disabled={mutation.isPending}
          data-testid="ai-explain-regenerate"
        >
          <RefreshCw
            className={cn("mr-1 h-3 w-3", mutation.isPending && "animate-spin")}
          />
          Regenerate
        </Button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.summary}</p>
      {data.bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
          {data.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span data-testid="ai-explain-attribution">
          {data.source === "fallback"
            ? "Heuristic fallback — Claude is unavailable or this tier doesn't include AI explanations."
            : "Powered by Claude"}
          {data.source === "cache" && " · cached"}
        </span>
        <span className="tabular-nums">{data.model}</span>
      </div>
    </div>
  );
}

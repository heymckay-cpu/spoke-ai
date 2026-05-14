import { useEffect } from "react";
import {
  useExplainCandidate,
  type Candidate,
  type CandidateExplanation,
  CandidateExplanationVerdict,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Lock, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { useCapability } from "@/hooks/use-capability";
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
  /**
   * Auto-fetch on mount/candidate-change. Defaults to false so we don't
   * bill an LLM call on every drawer open — the user has to click "Explain
   * with Claude" first.
   */
  autoLoad?: boolean;
  className?: string;
}

const SPEND_HINT_FULL =
  "Uses one Claude call (~a few cents). Cached for repeat opens of the same contract.";
const SPEND_HINT_INLINE = "~1 Claude call · cached after";

export function AiCandidateExplanation({
  candidate,
  variant = "full",
  autoLoad = false,
  className,
}: AiCandidateExplanationProps) {
  const mutation = useExplainCandidate();
  const { allowed: aiAllowed, loading: tierLoading } = useCapability("ai.explainer");

  const candidateKey = `${candidate.ticker}|${candidate.strike}|${candidate.expiry}`;

  // Guard against a stale in-flight response landing on the wrong candidate:
  // even if a previous request resolves after the user switches contracts,
  // we ignore its payload at render time by matching on the response's own
  // ticker/strike/expiry rather than mutating shared mutation state.
  const rawData: CandidateExplanation | undefined = mutation.data;
  const data: CandidateExplanation | undefined =
    rawData &&
    rawData.ticker === candidate.ticker &&
    rawData.strike === candidate.strike &&
    rawData.expiry === candidate.expiry
      ? rawData
      : undefined;

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

  // When the candidate identity changes, drop the previous mutation result so
  // the CTA reappears, and — for entitled users with autoLoad — kick off a
  // single fresh fetch.
  useEffect(() => {
    mutation.reset();
    if (autoLoad && !tierLoading && aiAllowed) {
      fetchExplain();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey, autoLoad, tierLoading, aiAllowed]);

  // ---- Free tier: friendly upsell, no network call ---------------------
  if (!tierLoading && !aiAllowed) {
    if (variant === "inline") {
      return (
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground",
            className,
          )}
          data-testid="ai-explain-upsell-inline"
        >
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          <span>
            Claude explanations are a Pro feature.{" "}
            <a
              href="/dashboard/settings/plan"
              className="font-medium text-primary hover:underline"
            >
              Upgrade
            </a>
          </span>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4",
          className,
        )}
        data-testid="ai-explain-upsell"
      >
        <div className="rounded-md bg-accent/60 p-2 text-accent-foreground">
          <Lock className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-sm font-semibold tracking-tight">
            Unlock Claude's take on this trade
          </div>
          <p className="text-xs text-muted-foreground">
            Plain-English breakdown of why this contract is (or isn't) a good
            wheel candidate. Included with the Pro plan.
          </p>
        </div>
        <Button asChild size="sm" variant="default" className="shrink-0">
          <a href="/dashboard/settings/plan">Upgrade</a>
        </Button>
      </div>
    );
  }

  // ---- Loading state ---------------------------------------------------
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

  // ---- Error state -----------------------------------------------------
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

  // ---- Idle: render CTA so the LLM call is opt-in ----------------------
  if (!data) {
    if (variant === "inline") {
      return (
        <div
          className={cn(
            "flex items-center justify-between gap-2 text-xs",
            className,
          )}
          data-testid="ai-explain-cta-inline"
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => fetchExplain()}
            disabled={tierLoading}
            data-testid="ai-explain-generate"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            Explain with Claude
          </Button>
          <span className="text-[10px] text-muted-foreground">{SPEND_HINT_INLINE}</span>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex items-start justify-between gap-3 rounded-lg border border-dashed border-border bg-card/40 p-4",
          className,
        )}
        data-testid="ai-explain-cta"
      >
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-tight">
              AI rationale
            </div>
            <p className="text-xs text-muted-foreground">{SPEND_HINT_FULL}</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="shrink-0"
          onClick={() => fetchExplain()}
          disabled={tierLoading}
          data-testid="ai-explain-generate"
        >
          Explain with Claude
        </Button>
      </div>
    );
  }

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

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import {
  getGetPositionAdvisorQueryKey,
  useGetPositionAdvisor,
  type Position,
  type PositionAdvisor,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { RollPositionDialog } from "@/components/roll-position-dialog";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PositionAdvisorPanelProps {
  position: Position;
  onRolled: () => void;
}

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  roll: {
    label: "Roll",
    cls: "bg-primary/10 text-primary ring-primary/30",
  },
  assign: {
    label: "Take assignment",
    cls: "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  },
  close: {
    label: "Close out",
    cls: "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-400",
  },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const style = VERDICT_STYLE[verdict] ?? {
    label: verdict,
    cls: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset",
        style.cls,
      )}
      data-testid={`advisor-verdict-${verdict}`}
    >
      {style.label}
    </span>
  );
}

function RawNumbers({ ctx }: { ctx: PositionAdvisor["context"] }) {
  return (
    <dl
      className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums sm:grid-cols-3"
      data-testid="advisor-raw-numbers"
    >
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Cost basis / sh
        </dt>
        <dd>{fmtMoney(ctx.costBasisPerShare)}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Premium collected
        </dt>
        <dd>{fmtMoney(ctx.totalPremiumCollected)}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Spot
        </dt>
        <dd>{ctx.quote.spot != null ? fmtMoney(ctx.quote.spot) : "—"}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Intrinsic
        </dt>
        <dd>
          {ctx.quote.intrinsic != null ? fmtMoney(ctx.quote.intrinsic) : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Extrinsic
        </dt>
        <dd>
          {ctx.quote.extrinsic != null ? fmtMoney(ctx.quote.extrinsic) : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Assignment cost
        </dt>
        <dd>{fmtMoney(ctx.assignmentCostTotal)}</dd>
      </div>
    </dl>
  );
}

export function PositionAdvisorPanel({
  position,
  onRolled,
}: PositionAdvisorPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [rollOpen, setRollOpen] = useState(false);
  const advisor = useGetPositionAdvisor(position.id, {
    query: {
      enabled: expanded,
      // Quote-driven cache key already lives server-side; on the client we
      // just keep the response warm for a minute to avoid jitter when the
      // user collapses and re-expands the same row.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
      queryKey: getGetPositionAdvisorQueryKey(position.id),
    },
  });

  const data = advisor.data;
  const recommendedRoll = data?.verdict?.recommendedRoll;

  return (
    <div
      className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3"
      data-testid={`advisor-panel-${position.id}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        data-testid={`advisor-toggle-${position.id}`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Roll vs assign vs close
          </span>
          <span className="text-[11px] text-muted-foreground">
            {position.ticker} {fmtMoney(position.strike)}P {position.expiry}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div className="space-y-3 pt-1">
          {advisor.isLoading ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <SpokeSpinner size={12} label="Loading advisor" />
                <span>Asking the model…</span>
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : advisor.error ? (
            <div className="text-xs text-muted-foreground">
              Couldn't reach the advisor. Try again in a moment.
            </div>
          ) : data ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {data.available && data.verdict ? (
                    <VerdictBadge verdict={data.verdict.verdict} />
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-border"
                      data-testid="advisor-verdict-unavailable"
                    >
                      AI unavailable
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => advisor.refetch()}
                    className="h-7 gap-1 px-2 text-[11px]"
                    data-testid={`advisor-refresh-${position.id}`}
                    disabled={advisor.isFetching}
                  >
                    <RefreshCw
                      className={cn(
                        "h-3 w-3",
                        advisor.isFetching && "animate-spin",
                      )}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {data.available && data.verdict ? (
                <>
                  <p
                    className="text-sm leading-snug"
                    data-testid="advisor-summary"
                  >
                    {data.verdict.summary}
                  </p>
                  <ul
                    className="list-disc space-y-1 pl-5 text-xs text-muted-foreground"
                    data-testid="advisor-bullets"
                  >
                    {data.verdict.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="advisor-fallback-message"
                >
                  No verdict available — showing the raw decision numbers below.
                  {data.unavailableReason ? ` (${data.unavailableReason})` : ""}
                </p>
              )}

              <RawNumbers ctx={data.context} />

              {data.context.concentration.totalCar > 0 ? (
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  Concentration: {data.context.concentration.openPositionsInTicker}{" "}
                  open in {position.ticker} ·{" "}
                  ticker {fmtPct(data.context.concentration.tickerPct * 100, 1)} of CAR ·{" "}
                  {data.context.concentration.sector} sector{" "}
                  {fmtPct(data.context.concentration.sectorPct * 100, 1)}
                </div>
              ) : null}

              {recommendedRoll ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setRollOpen(true)}
                    data-testid={`advisor-open-roll-${position.id}`}
                  >
                    Open roll dialog with {fmtMoney(recommendedRoll.strike)}P{" "}
                    {recommendedRoll.expiry}
                  </Button>
                </div>
              ) : null}

              <RollPositionDialog
                position={position}
                onRolled={() => {
                  setRollOpen(false);
                  onRolled();
                }}
                open={rollOpen}
                onOpenChange={setRollOpen}
                initialStrike={recommendedRoll?.strike}
                initialExpiry={recommendedRoll?.expiry}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

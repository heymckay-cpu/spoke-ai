import { useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPositions,
  getListPositionsQueryKey,
  useListHoldings,
  getListHoldingsQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
  useCreateJournalEntry,
  getListJournalQueryKey,
  useGetQuiverSignals,
  getGetQuiverSignalsQueryKey,
} from "@workspace/api-client-react";
import type { Candidate, Holding, Position } from "@workspace/api-client-react";
import { DEFAULT_CONCENTRATION } from "@workspace/portfolio";
import { computeConcentration } from "@/components/concentration-chip";
import { useSectorMap } from "@/hooks/use-sector-map";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  Layers,
  Lightbulb,
  Shapes,
  TrendingUp,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { IvRankPill } from "@/components/iv-rank-pill";
import { IvHistorySparkline } from "@/components/iv-history-sparkline";
import { QuiverSignalsCard } from "@/components/quiver-signals-card";
import { CorrelationWarning } from "@/components/correlation-warning";
import { EarningsFlag } from "@/components/earnings-flag";
import { AddPositionDialog } from "@/components/add-position-dialog";
import { RollPositionDialog } from "@/components/roll-position-dialog";
import { AiCandidateExplanation } from "@/components/ai-candidate-explanation";
import {
  fmtCompactMoney,
  fmtDate,
  fmtFractionPct,
  fmtMoney,
  fmtNum,
  fmtPct,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tone = "success" | "warning" | "default" | "muted" | "danger";

interface Recommendation {
  title: string;
  detail: string;
  tone: Tone;
  ticket?: string;
}

function recommend(
  c: Candidate,
  openInTicker: Position[],
  holding: Holding | null,
): Recommendation {
  // If you already own >= 100 shares, the wheel-strategy answer is usually
  // "sell a covered call against those shares" rather than stacking another
  // short put. Surface that before any other recommendation.
  const ownedShares = holding?.shares ?? 0;
  if (ownedShares >= 100) {
    const ccStrike = Math.max(holding!.avgCost, c.spot) * 1.05;
    const contractsAvailable = Math.floor(ownedShares / 100);
    const stackingDetail =
      openInTicker.length > 0
        ? ` You also have ${openInTicker.length} open put leg${openInTicker.length === 1 ? "" : "s"} here — adding more would concentrate risk further.`
        : "";
    return {
      title: "You already own shares — sell a call instead",
      detail: `You hold ${ownedShares} shares of ${c.ticker} at an avg cost of ${fmtMoney(holding!.avgCost)}. Selling another put adds correlated downside. Consider a covered call ~${fmtMoney(ccStrike)} (above your basis and 5% OTM) on ${contractsAvailable} contract${contractsAvailable === 1 ? "" : "s"}.${stackingDetail} Run the covered-call screener on the Holdings tab for live strikes.`,
      tone: "warning",
    };
  }

  if (openInTicker.length === 0) {
    if (c.earningsInWindow) {
      return {
        title: "Wait — earnings inside the window",
        detail:
          "An earnings report lands before this expiry. Implied vol is rich for a reason; consider waiting until after the print or sizing down by half.",
        tone: "warning",
        ticket: `SELL -1 ${c.ticker} ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} @ ${fmtMoney(c.bid)}`,
      };
    }
    if (c.annualizedPct >= 30) {
      return {
        title: "Strong entry — sell to open",
        detail: `Annualized ${fmtPct(c.annualizedPct, 1)} on ${fmtPct(c.pctOtm, 1)} OTM cushion with ${c.dte}d for theta to work. POP from delta is roughly ${fmtFractionPct(1 - Math.abs(c.delta), 0)}.`,
        tone: "success",
        ticket: `SELL -1 ${c.ticker} ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} @ ${fmtMoney(c.bid)}`,
      };
    }
    if (c.annualizedPct >= 15) {
      return {
        title: "Solid wheel entry",
        detail: `Reasonable yield (${fmtPct(c.annualizedPct, 1)} ann.) with ${fmtPct(c.pctOtm, 1)} cushion. Standard wheel candidate — size to your usual risk.`,
        tone: "default",
        ticket: `SELL -1 ${c.ticker} ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} @ ${fmtMoney(c.bid)}`,
      };
    }
    return {
      title: "Yield is light",
      detail: `Annualized ${fmtPct(c.annualizedPct, 1)} is on the low end. Only worth selling if you actually want to own ${c.ticker} at ${fmtMoney(c.strike)}.`,
      tone: "muted",
      ticket: `SELL -1 ${c.ticker} ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} @ ${fmtMoney(c.bid)}`,
    };
  }

  const exact = openInTicker.find(
    (p) => p.strike === c.strike && p.expiry === c.expiry,
  );
  const focus =
    exact ?? [...openInTicker].sort((a, b) => a.dte - b.dte)[0]!;

  const itm = focus.spot != null && focus.spot < focus.strike;
  const dte = focus.dte;
  const profitPct =
    focus.currentBid != null && focus.premium > 0
      ? (focus.premium - focus.currentBid) / focus.premium
      : null;
  const ccTarget = focus.strike * 1.05;

  if (dte < 0) {
    return {
      title: "Reconcile expired position",
      detail: `Your ${focus.strike}P ${focus.expiry} expired ${Math.abs(dte)}d ago. Mark it assigned or closed in the Positions tab so the journal stays accurate.`,
      tone: "warning",
    };
  }
  if (itm && dte <= 3) {
    return {
      title: "Roll out or take assignment",
      detail: `${c.ticker} is ITM at ${focus.spot != null ? fmtMoney(focus.spot) : "spot"} with only ${dte}d left on your ${fmtMoney(focus.strike)}P. Either roll down/out for net credit or accept ${focus.contracts * 100} shares at ${fmtMoney(focus.strike)} and sell a covered call near ${fmtMoney(ccTarget)}.`,
      tone: "danger",
    };
  }
  if (itm) {
    return {
      title: "Watch closely — consider rolling",
      detail: `Spot (${focus.spot != null ? fmtMoney(focus.spot) : "n/a"}) is below your strike (${fmtMoney(focus.strike)}). With ${dte}d left, rolling to a later expiry usually collects additional credit and buys time for recovery.`,
      tone: "warning",
    };
  }
  if (profitPct != null && profitPct >= 0.5) {
    return {
      title: "Close early — locked in gains",
      detail: `You've captured ${fmtPct(profitPct, 0)} of max premium on this ${focus.strike}P. Closing now frees ${fmtCompactMoney(focus.strike * 100 * focus.contracts)} of collateral and removes tail risk for the remaining ${dte}d.`,
      tone: "success",
    };
  }
  if (dte <= 3) {
    return {
      title: "Let theta finish the job",
      detail: `OTM with ${dte}d left. Let it expire worthless — only buy-to-close if the credit drops under ~10% of original premium and you want to redeploy capital.`,
      tone: "default",
    };
  }
  if (exact) {
    return {
      title: "Hold — position is healthy",
      detail: `Comfortably OTM with ${dte}d to expiry. Theta is on your side. Re-check if spot drops within 5% of strike.`,
      tone: "default",
    };
  }
  // Open position exists in this ticker, but the clicked candidate is a different leg
  return {
    title: "You already have an open leg here",
    detail: `${c.ticker} ${fmtMoney(focus.strike)}P ${fmtDate(focus.expiry)} is open (${dte}d, ${focus.contracts} contract${focus.contracts === 1 ? "" : "s"}). Stacking this new ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} would add ${fmtCompactMoney(c.collateralPerContract)} of collateral — only do it if you're under-allocated to the name.`,
    tone: "default",
    ticket: `SELL -1 ${c.ticker} ${fmtMoney(c.strike)}P ${fmtDate(c.expiry)} @ ${fmtMoney(c.bid)}`,
  };
}

const TONE_STYLES: Record<Tone, { bg: string; text: string; icon: typeof Lightbulb }> = {
  success: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-500", icon: CheckCircle2 },
  warning: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-500", icon: AlertTriangle },
  danger: { bg: "bg-rose-500/10 border-rose-500/30", text: "text-rose-500", icon: AlertTriangle },
  default: { bg: "bg-primary/10 border-primary/30", text: "text-primary", icon: Lightbulb },
  muted: { bg: "bg-muted border-border", text: "text-muted-foreground", icon: Lightbulb },
};

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
}

function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export interface CandidateDetailDrawerProps {
  candidate: Candidate | null;
  onClose: () => void;
  contracts?: number;
  onContractsChange?: (n: number) => void;
}

const MAX_CONTRACTS = 999;

export function CandidateDetailDrawer({
  candidate,
  onClose,
  contracts,
  onContractsChange,
}: CandidateDetailDrawerProps) {
  const qc = useQueryClient();
  const positionsQuery = useListPositions({
    query: {
      queryKey: getListPositionsQueryKey(),
      enabled: candidate != null,
    },
  });
  const holdingsQuery = useListHoldings({
    query: {
      queryKey: getListHoldingsQueryKey(),
      enabled: candidate != null,
    },
  });
  const settingsQuery = useGetSettings({
    query: {
      queryKey: getGetSettingsQueryKey(),
      enabled: candidate != null,
    },
  });
  const concentration = settingsQuery.data?.concentration ?? DEFAULT_CONCENTRATION;
  const allPositions = positionsQuery.data?.positions ?? [];
  const sectorTickers = useMemo(() => {
    const set = new Set<string>();
    if (candidate) set.add(candidate.ticker);
    for (const p of allPositions) set.add(p.ticker);
    return Array.from(set);
  }, [candidate, allPositions]);
  const sectorMap = useSectorMap(sectorTickers);
  const qty = Math.max(1, Math.min(MAX_CONTRACTS, Math.floor(contracts ?? 1) || 1));
  const setQty = (n: number) => {
    const clamped = Math.max(1, Math.min(MAX_CONTRACTS, Math.floor(n) || 1));
    onContractsChange?.(clamped);
  };

  const risk = useMemo(() => {
    if (!candidate) return null;
    return computeConcentration(
      candidate.ticker,
      candidate.strike,
      qty,
      allPositions,
      concentration,
      sectorMap,
    );
  }, [candidate, qty, allPositions, concentration, sectorMap]);

  const openInTicker = useMemo<Position[]>(() => {
    if (!candidate) return [];
    return (positionsQuery.data?.positions ?? []).filter(
      (p) => p.status === "open" && p.ticker === candidate.ticker,
    );
  }, [candidate, positionsQuery.data]);

  // Sum across any duplicate ticker rows so the recommendation reflects total
  // exposure (rare, but the UI shouldn't ignore a second lot if one exists).
  const holdingForTicker = useMemo<Holding | null>(() => {
    if (!candidate) return null;
    const rows = (holdingsQuery.data?.holdings ?? []).filter(
      (h) => h.ticker === candidate.ticker,
    );
    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0]!;
    const totalShares = rows.reduce((s, h) => s + h.shares, 0);
    const totalCost = rows.reduce((s, h) => s + h.avgCost * h.shares, 0);
    return {
      ...rows[0]!,
      shares: totalShares,
      avgCost: totalShares > 0 ? totalCost / totalShares : 0,
    };
  }, [candidate, holdingsQuery.data]);

  const rec = candidate ? recommend(candidate, openInTicker, holdingForTicker) : null;
  const ToneIcon = rec ? TONE_STYLES[rec.tone].icon : Lightbulb;

  const invalidatePositions = () => {
    qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
  };

  // Journal wiring: both decisions on a candidate are recorded, so passed
  // recommendations become the control group for the forward test.
  const { toast } = useToast();
  const createJournalEntry = useCreateJournalEntry();
  // Shares the query cache with QuiverSignalsCard below; no extra fetch.
  const quiverQuery = useGetQuiverSignals(candidate?.ticker ?? "", {
    query: {
      // Canonical key so the cache is shared with QuiverSignalsCard below.
      queryKey: getGetQuiverSignalsQueryKey(candidate?.ticker ?? ""),
      enabled: candidate != null,
    },
  });

  const logDecision = (decision: "taken" | "passed", positionId?: number) => {
    if (!candidate) return;
    createJournalEntry.mutate(
      {
        data: {
          decision,
          ticker: candidate.ticker,
          strike: candidate.strike,
          expiry: candidate.expiry,
          bid: candidate.bid,
          annualizedPct: candidate.annualizedPct,
          delta: candidate.delta,
          ivRank: candidate.ivRank ?? null,
          quiverScore: quiverQuery.data?.score ?? null,
          snapshot: candidate as unknown as Record<string, unknown>,
          positionId: positionId ?? null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListJournalQueryKey() });
          if (decision === "passed") {
            toast({
              title: "Logged as passed",
              description: `${candidate.ticker} ${fmtMoney(candidate.strike)}P ${candidate.expiry} recorded in your journal as skipped.`,
            });
            onClose();
          }
        },
        onError: () => {
          // Journal logging is best-effort; never block the trade flow on it.
          if (decision === "passed") {
            toast({ variant: "destructive", title: "Failed to record pass" });
          }
        },
      },
    );
  };

  return (
    <Sheet open={candidate != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg lg:max-w-xl"
        data-testid="drawer-candidate-detail"
      >
        {candidate && rec && (
          <>
            <SheetHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <SheetTitle className="text-2xl font-semibold tracking-tight">
                  <Link
                    href={`/dashboard/chain/${candidate.ticker}`}
                    className="hover:text-primary"
                    onClick={onClose}
                  >
                    {candidate.ticker}
                    <ArrowUpRight className="ml-1 inline h-4 w-4 align-text-top text-muted-foreground" />
                  </Link>
                </SheetTitle>
                <div className="flex items-center gap-2">
                  <IvRankPill rank={candidate.ivRank ?? null} basis={candidate.ivRankBasis} />
                  <EarningsFlag
                    earningsDate={candidate.earningsDate}
                    inWindow={candidate.earningsInWindow}
                  />
                </div>
              </div>
              <SheetDescription className="flex items-center gap-3 text-sm">
                <span className="tabular-nums text-foreground">
                  Spot {fmtMoney(candidate.spot)}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="tabular-nums">
                  {fmtMoney(candidate.strike)}P · {fmtDate(candidate.expiry)} · {candidate.dte}d
                </span>
              </SheetDescription>
            </SheetHeader>

            {/* Recommendation card */}
            <div
              className={cn(
                "mt-5 rounded-lg border p-4",
                TONE_STYLES[rec.tone].bg,
              )}
              data-testid="recommendation-card"
            >
              <div className="flex items-start gap-3">
                <ToneIcon
                  className={cn("mt-0.5 h-5 w-5 shrink-0", TONE_STYLES[rec.tone].text)}
                />
                <div className="flex-1 space-y-1.5">
                  <div className={cn("text-sm font-semibold", TONE_STYLES[rec.tone].text)}>
                    {rec.title}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {rec.detail}
                  </p>
                  {rec.ticket && (
                    <div className="mt-2 rounded border border-border bg-background/60 px-3 py-2 font-mono text-xs tracking-tight">
                      {rec.ticket}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Concentration risk panel — mirrors the ticker-row tooltip so
                users who click into a flagged trade see the same warning
                front-and-center while reviewing it. Only renders when the
                trade trips a per-ticker / per-sector cap or overlaps an
                already-open leg in the same name. */}
            {risk &&
              (risk.overlap.openInTicker > 0 ||
                risk.assessment.tickerExceeds ||
                risk.assessment.sectorExceeds) && (() => {
                const { overlap, assessment } = risk;
                const tickerPct = (assessment.postTickerPct * 100).toFixed(0);
                const sectorPct = (assessment.postSectorPct * 100).toFixed(0);
                const limitTicker = (concentration.tickerPct * 100).toFixed(0);
                const limitSector = (concentration.sectorPct * 100).toFixed(0);
                return (
                  <div
                    className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
                    data-testid="risk-panel"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                            Concentration risk
                          </div>
                          {onContractsChange && (
                            <div
                              className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background"
                              data-testid="risk-contracts-stepper"
                            >
                              <button
                                type="button"
                                onClick={() => setQty(qty - 1)}
                                disabled={qty <= 1}
                                className="flex h-6 w-6 items-center justify-center rounded-l-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                                title="Decrease contracts"
                                data-testid="button-risk-contracts-decrement"
                              >
                                <span className="text-base leading-none">−</span>
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={MAX_CONTRACTS}
                                value={qty}
                                onChange={(e) => setQty(Number(e.target.value))}
                                className="h-6 w-10 border-none bg-transparent text-center text-xs tabular-nums focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                aria-label="Contracts"
                                data-testid="input-risk-contracts"
                              />
                              <button
                                type="button"
                                onClick={() => setQty(qty + 1)}
                                disabled={qty >= MAX_CONTRACTS}
                                className="flex h-6 w-6 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                                title="Increase contracts"
                                data-testid="button-risk-contracts-increment"
                              >
                                <span className="text-base leading-none">+</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <ul className="space-y-1.5 text-sm text-foreground/90">
                          {overlap.openInTicker > 0 && (
                            <li
                              className="flex items-start gap-2"
                              data-testid="risk-open-overlap"
                            >
                              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>
                                You already have {overlap.openInTicker} open{" "}
                                {overlap.openInTicker === 1 ? "position" : "positions"}{" "}
                                on {candidate.ticker} (
                                {fmtCompactMoney(overlap.tickerCar)} cash at risk).
                              </span>
                            </li>
                          )}
                          {assessment.tickerExceeds && (
                            <li
                              className="flex items-start gap-2"
                              data-testid="risk-ticker-exceeds"
                            >
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              <span>
                                Adding {qty} {qty === 1 ? "contract" : "contracts"} would
                                push {candidate.ticker} to{" "}
                                {fmtCompactMoney(assessment.postTickerCar)} ({tickerPct}%
                                of {fmtCompactMoney(assessment.postTotalCar)} total open
                                cash at risk), above your {limitTicker}% per-ticker limit.
                              </span>
                            </li>
                          )}
                          {assessment.sectorExceeds && (
                            <li
                              className="flex items-start gap-2"
                              data-testid="risk-sector-exceeds"
                            >
                              <Shapes className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              <span>
                                {overlap.sector} would reach{" "}
                                {fmtCompactMoney(assessment.postSectorCar)} ({sectorPct}%
                                of total open cash at risk), above your {limitSector}%
                                per-sector limit.
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Claude-generated long-form rationale */}
            <div className="mt-4">
              <AiCandidateExplanation candidate={candidate} variant="full" />
            </div>

            {/* Holdings (long stock) */}
            {holdingForTicker && (
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" />
                  Shares you own
                </div>
                <div
                  className="rounded-md border border-card-border bg-card px-3 py-2.5 text-sm"
                  data-testid={`holding-row-${candidate.ticker}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium tabular-nums">
                      {holdingForTicker.shares} sh @ {fmtMoney(holdingForTicker.avgCost)} avg
                    </div>
                    <div
                      className={cn(
                        "tabular-nums text-xs font-medium",
                        holdingForTicker.unrealizedPnl == null
                          ? "text-muted-foreground"
                          : holdingForTicker.unrealizedPnl >= 0
                            ? "text-emerald-500"
                            : "text-rose-500",
                      )}
                    >
                      {holdingForTicker.unrealizedPnl != null
                        ? `${fmtCompactMoney(holdingForTicker.unrealizedPnl)}${
                            holdingForTicker.unrealizedPnlPct != null
                              ? ` · ${fmtPct(holdingForTicker.unrealizedPnlPct * 100, 1)}`
                              : ""
                          }`
                        : "P/L —"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Cost basis {fmtCompactMoney(holdingForTicker.avgCost * holdingForTicker.shares)}
                    {holdingForTicker.marketValue != null &&
                      ` · Mkt value ${fmtCompactMoney(holdingForTicker.marketValue)}`}
                  </div>
                </div>
              </div>
            )}

            {/* Open put legs — hide entirely when there are none AND the user
                already owns shares, since the holdings panel above already
                describes their exposure. */}
            {(openInTicker.length > 0 || (!holdingForTicker && !positionsQuery.isLoading)) && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                Open put legs in {candidate.ticker}
              </div>
              {positionsQuery.isLoading ? (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  <SpokeSpinner size={14} label="Loading positions" />
                  <span aria-hidden="true">Loading positions…</span>
                </div>
              ) : openInTicker.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  No open puts on {candidate.ticker}. This would be a fresh entry.
                </div>
              ) : (
                <div className="space-y-2">
                  {openInTicker.map((p) => {
                    const itm = p.spot != null && p.spot < p.strike;
                    const profitPct =
                      p.currentBid != null && p.premium > 0
                        ? (p.premium - p.currentBid) / p.premium
                        : null;
                    return (
                      <div
                        key={p.id}
                        className="rounded-md border border-card-border bg-card px-3 py-2.5 text-sm"
                        data-testid={`open-position-${p.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium tabular-nums">
                            {p.contracts}× {fmtMoney(p.strike)}P {fmtDate(p.expiry)}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums",
                                itm
                                  ? "bg-rose-500/15 text-rose-500"
                                  : "bg-emerald-500/15 text-emerald-500",
                              )}
                            >
                              {itm ? "ITM" : "OTM"} · {p.dte}d
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
                          <span>Premium {fmtMoney(p.premium)}</span>
                          <span>
                            Bid {p.currentBid != null ? fmtMoney(p.currentBid) : "—"}
                          </span>
                          <span
                            className={cn(
                              profitPct != null && profitPct >= 0
                                ? "text-emerald-500"
                                : profitPct != null
                                  ? "text-rose-500"
                                  : "",
                            )}
                          >
                            {profitPct != null
                              ? `Captured ${fmtPct(profitPct, 0)}`
                              : "P/L —"}
                          </span>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <RollPositionDialog
                            position={p}
                            onRolled={invalidatePositions}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            <Separator className="my-5" />

            {/* Trade metrics */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Trade details
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric
                  label="Premium"
                  value={fmtMoney(candidate.premiumPerContract)}
                  hint={`${fmtMoney(candidate.bid)}/sh × 100`}
                />
                <Metric
                  label="Collateral"
                  value={fmtCompactMoney(candidate.collateralPerContract)}
                />
                <Metric
                  label="Static %"
                  value={fmtPct(candidate.staticReturnPct, 2)}
                />
                <Metric
                  label="Annualized"
                  value={fmtPct(candidate.annualizedPct, 1)}
                  hint={`${candidate.dte}d to expiry`}
                />
                <Metric
                  label="Breakeven"
                  value={fmtMoney(candidate.breakeven)}
                  hint={`${fmtPct(candidate.pctOtm, 1)} OTM`}
                />
                <Metric
                  label="Δ / IV"
                  value={`${fmtNum(candidate.delta, 2)} · ${fmtFractionPct(candidate.iv, 1)}`}
                  hint={`POP ~${fmtFractionPct(1 - Math.abs(candidate.delta), 0)}`}
                />
              </div>
            </div>

            {/* IV Percentile + 52-week IV sparkline (real history once enough snapshots accumulate). */}
            <div className="mt-4 space-y-2">
              {candidate.ivPercentile != null && (
                <div className="text-xs text-muted-foreground">
                  IV Percentile:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {Math.round(candidate.ivPercentile * 100)}
                  </span>{" "}
                  — share of the past 52 weeks where IV was at or below today's
                  {candidate.ivRankBasis === "provisional" && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      (provisional)
                    </span>
                  )}
                </div>
              )}
              <IvHistorySparkline ticker={candidate.ticker} />
            </div>

            {/* Quiver alternative-data signals (hidden when not configured). */}
            <QuiverSignalsCard ticker={candidate.ticker} />

            {/* Hidden-correlation-trap warning vs. open positions. */}
            <CorrelationWarning ticker={candidate.ticker} />

            {/* Market-wide binary events inside the expiry window. */}
            {candidate.macroEvent && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">Macro event in window:</span>{" "}
                  {candidate.macroEvent}. Market-wide moves around these dates
                  can swamp single-name analysis — size accordingly.
                </span>
              </div>
            )}

            {/* Risk callouts */}
            {(candidate.earningsInWindow || (candidate.ivRank != null && candidate.ivRank > 0.7)) && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Heads up
                </div>
                <ul className="space-y-1.5 text-sm">
                  {candidate.earningsInWindow && (
                    <li className="flex items-start gap-2">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span>
                        Earnings {candidate.earningsDate ? `on ${fmtDate(candidate.earningsDate)}` : "expected"} before expiry — IV is elevated for a reason.
                      </span>
                    </li>
                  )}
                  {candidate.ivRank != null && candidate.ivRank > 0.7 && (
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        IV Rank {Math.round(candidate.ivRank * 100)} — premium is rich vs. the past year. Good for sellers, but volatility tends to revert.
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline" onClick={onClose}>
                <Link href={`/dashboard/chain/${candidate.ticker}`}>View chain</Link>
              </Button>
              <Button
                variant="ghost"
                onClick={() => logDecision("passed")}
                disabled={createJournalEntry.isPending}
                data-testid="button-pass-from-drawer"
                title="Record that you deliberately skipped this recommendation — passed trades are your journal's control group"
              >
                Pass
              </Button>
              <AddPositionDialog
                defaultExpiry={candidate.expiry}
                initialValues={{
                  ticker: candidate.ticker,
                  strike: candidate.strike,
                  expiry: candidate.expiry,
                  premium: candidate.bid,
                  contracts: 1,
                }}
                onCreated={(created) => {
                  logDecision("taken", created?.id);
                  invalidatePositions();
                  onClose();
                }}
                trigger={
                  <Button data-testid="button-log-from-drawer">
                    Log this trade
                  </Button>
                }
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

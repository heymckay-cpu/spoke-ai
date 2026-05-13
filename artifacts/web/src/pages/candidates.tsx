import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  getGetLatestScanQueryKey,
  getGetScanSummaryQueryKey,
  getGetSettingsQueryKey,
  useGetLatestScan,
  useGetScanSummary,
  useGetSettings,
  useListPositions,
  getListPositionsQueryKey,
  useRunScan,
  useUpdateSettings,
  type Candidate,
} from "@workspace/api-client-react";
import { DEFAULT_CONCENTRATION } from "@workspace/portfolio";
import { ConcentrationChip } from "@/components/concentration-chip";
import { useSectorMap } from "@/hooks/use-sector-map";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Layers,
  Minus,
  Percent,
  Plus,
  PlusCircle,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { AddPositionDialog } from "@/components/add-position-dialog";
import { CandidateDetailDrawer } from "@/components/candidate-detail-drawer";
import { AiCandidateExplanation } from "@/components/ai-candidate-explanation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IvRankPill } from "@/components/iv-rank-pill";
import { EarningsFlag } from "@/components/earnings-flag";
import { RunScanButton } from "@/components/run-scan-button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  fmtCompactMoney,
  fmtFractionPct,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtInt,
  fmtDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey =
  | "ticker"
  | "spot"
  | "strike"
  | "expiry"
  | "dte"
  | "delta"
  | "iv"
  | "ivRank"
  | "ivPercentile"
  | "bid"
  | "premium"
  | "collateral"
  | "staticReturn"
  | "annualized"
  | "pctOtm"
  | "breakeven"
  | "openInterest";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function sortCandidates(rows: Candidate[], sort: SortState): Candidate[] {
  const { key, dir } = sort;
  const factor = dir === "asc" ? 1 : -1;
  const get = (c: Candidate): number | string => {
    switch (key) {
      case "ticker":
        return c.ticker;
      case "spot":
        return c.spot;
      case "strike":
        return c.strike;
      case "expiry":
        return c.expiry;
      case "dte":
        return c.dte;
      case "delta":
        return Math.abs(c.delta);
      case "iv":
        return c.iv;
      case "ivRank":
        return c.ivRank ?? -1;
      case "ivPercentile":
        return c.ivPercentile ?? -1;
      case "bid":
        return c.bid;
      case "premium":
        return c.premiumPerContract;
      case "collateral":
        return c.collateralPerContract;
      case "staticReturn":
        return c.staticReturnPct;
      case "annualized":
        return c.annualizedPct;
      case "pctOtm":
        return c.pctOtm;
      case "breakeven":
        return c.breakeven;
      case "openInterest":
        return c.openInterest;
    }
  };
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * factor;
    }
    return ((av as number) - (bv as number)) * factor;
  });
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Sparkles;
  accent?: "default" | "primary" | "success" | "warning";
}

function Kpi({ label, value, hint, icon: Icon, accent = "default" }: KpiProps) {
  const accentClasses = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    warning: "text-amber-500",
  }[accent];

  return (
    <Card className="overflow-hidden border-card-border">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={cn("h-4 w-4", accentClasses)} />
        </div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight" data-testid={`kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}>
          {value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

interface ColDef {
  key: SortKey;
  label: string;
  align?: "left" | "right";
  className?: string;
}

const COLUMNS: ColDef[] = [
  { key: "ticker", label: "Ticker", align: "left" },
  { key: "spot", label: "Spot", align: "right" },
  { key: "strike", label: "Strike", align: "right" },
  { key: "expiry", label: "Expiry", align: "left" },
  { key: "dte", label: "DTE", align: "right" },
  { key: "delta", label: "Δ", align: "right" },
  { key: "iv", label: "IV", align: "right" },
  { key: "ivRank", label: "IVR", align: "right" },
  { key: "ivPercentile", label: "IV%", align: "right" },
  { key: "bid", label: "Bid", align: "right" },
  { key: "premium", label: "Prem", align: "right" },
  { key: "collateral", label: "Collateral", align: "right" },
  { key: "staticReturn", label: "Static %", align: "right" },
  { key: "annualized", label: "Ann %", align: "right" },
  { key: "pctOtm", label: "OTM %", align: "right" },
  { key: "breakeven", label: "B/E", align: "right" },
  { key: "openInterest", label: "OI", align: "right" },
];

type EarningsMode = "hide" | "only" | "include";

const EARNINGS_OPTIONS: { value: EarningsMode; label: string; hint: string }[] = [
  { value: "hide", label: "Hide", hint: "Exclude candidates with earnings before expiry" },
  { value: "only", label: "Show only", hint: "Only show candidates with earnings before expiry" },
  { value: "include", label: "Include", hint: "Show all candidates regardless of earnings" },
];

export function CandidatesPage() {
  const qc = useQueryClient();
  const latest = useGetLatestScan();
  const summary = useGetScanSummary();
  const positionsQuery = useListPositions({
    query: { queryKey: getListPositionsQueryKey() },
  });
  const settingsQuery = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const positions = positionsQuery.data?.positions ?? [];
  const concentration = settingsQuery.data?.concentration ?? DEFAULT_CONCENTRATION;
  const candidatesData = latest.data?.candidates ?? [];
  const sectorTickers = useMemo(() => {
    const set = new Set<string>();
    for (const p of positions) set.add(p.ticker);
    for (const c of candidatesData) set.add(c.ticker);
    return Array.from(set);
  }, [positions, candidatesData]);
  const sectorMap = useSectorMap(sectorTickers);
  const settings = settingsQuery;
  const [sort, setSort] = useState<SortState>({ key: "annualized", dir: "desc" });
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [contractsByRow, setContractsByRow] = useState<Record<string, number>>({});
  const [explainOpen, setExplainOpen] = useState<Set<string>>(new Set());
  const toggleExplain = (key: string) => {
    setExplainOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // Mirror the persisted setting locally so the segmented control reflects
  // pending changes immediately even before the save round-trips. We only
  // overwrite from the server when the server value actually differs from
  // what's already loaded — that way we don't clobber the user's optimistic
  // toggle while the save / re-scan is still in flight.
  const [earningsMode, setEarningsMode] = useState<EarningsMode>("hide");
  useEffect(() => {
    if (settings.data?.earningsInWindow) {
      setEarningsMode(settings.data.earningsInWindow);
    }
  }, [settings.data?.earningsInWindow]);

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: (saved) => {
        qc.setQueryData(getGetSettingsQueryKey(), saved);
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
    },
  });
  const rescan = useRunScan({
    mutation: {
      onSuccess: (result) => {
        qc.setQueryData(getGetLatestScanQueryKey(), result);
        qc.invalidateQueries({ queryKey: getGetLatestScanQueryKey() });
        qc.invalidateQueries({ queryKey: getGetScanSummaryQueryKey() });
      },
    },
  });

  const onEarningsModeChange = (next: EarningsMode) => {
    if (next === earningsMode) return;
    setEarningsMode(next);
    setPage(0);
    // Re-run the scan with the new flag so totals and ranking are correct
    // server-side (the cache may have been built with a different filter).
    rescan.mutate({ data: { earningsInWindow: next, forceRefresh: false } });
    // Persist the user's choice alongside their other screener defaults.
    if (settings.data) {
      const { earningsInWindow: _ignored, ...rest } = settings.data;
      updateSettings.mutate({ data: { ...rest, earningsInWindow: next } });
    }
  };
  const PAGE_SIZE = 25;
  const MAX_CONTRACTS = 999;

  const rowKey = (c: Candidate) => `${c.ticker}-${c.expiry}-${c.strike}`;
  const getContracts = (c: Candidate) => contractsByRow[rowKey(c)] ?? 1;
  const setContracts = (c: Candidate, n: number) => {
    const clamped = Math.max(1, Math.min(MAX_CONTRACTS, Math.floor(n) || 1));
    setContractsByRow((prev) => ({ ...prev, [rowKey(c)]: clamped }));
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toUpperCase();
    const rows = f
      ? candidatesData.filter((c) => c.ticker.toUpperCase().includes(f))
      : candidatesData;
    return sortCandidates(rows, sort);
  }, [candidatesData, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const onSort = (key: SortKey) => {
    setPage(0);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ticker" || key === "expiry" ? "asc" : "desc" },
    );
  };

  const onFilter = (v: string) => {
    setFilter(v);
    setPage(0);
  };

  const isLoading = latest.isLoading;
  const isError = latest.isError || summary.isError;
  const errorMessage =
    latest.error instanceof Error
      ? latest.error.message
      : summary.error instanceof Error
        ? summary.error.message
        : "Could not load scan results.";
  const hasData = (latest.data?.candidates.length ?? 0) > 0;

  return (
    <AppShell title="McKay Barnes" breadcrumbs={[{ label: "Candidates" }]}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Avg Annualized"
            value={summary.data ? fmtPct(summary.data.avgAnnualizedPct) : "—"}
            hint={summary.data ? `Max ${fmtPct(summary.data.maxAnnualizedPct)}` : undefined}
            icon={TrendingUp}
            accent="primary"
          />
          <Kpi
            label="Candidates"
            value={summary.data ? fmtInt(summary.data.candidateCount) : "—"}
            hint={latest.data ? `from ${latest.data.tickersScanned} tickers` : undefined}
            icon={Layers}
          />
          <Kpi
            label="Total Premium"
            value={summary.data ? fmtCompactMoney(summary.data.totalPremium) : "—"}
            icon={CircleDollarSign}
            accent="success"
          />
          <Kpi
            label="Total Collateral"
            value={summary.data ? fmtCompactMoney(summary.data.totalCollateral) : "—"}
            icon={Percent}
          />
          <Kpi
            label="Earnings Flagged"
            value={summary.data ? fmtInt(summary.data.earningsFlaggedCount) : "—"}
            icon={CalendarClock}
            accent="warning"
          />
        </div>

        {/* Toolbar */}
        <Card className="border-card-border">
          <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => onFilter(e.target.value)}
                placeholder="Filter ticker…"
                className="pl-8"
                data-testid="input-filter-ticker"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div
                className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
                role="radiogroup"
                aria-label="Earnings in window filter"
                data-testid="filter-earnings"
              >
                <CalendarClock
                  className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                {EARNINGS_OPTIONS.map((opt) => {
                  const active = earningsMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onEarningsModeChange(opt.value)}
                      title={opt.hint}
                      disabled={rescan.isPending && !active}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      data-testid={`filter-earnings-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-500"
                title="Yahoo Finance quotes are typically delayed by ~15 minutes during market hours and reflect the prior close after hours."
                data-testid="badge-delayed-candidates"
              >
                <Clock className="h-3 w-3" /> Delayed ~15 min
              </span>
              {latest.data?.stale ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400"
                  title="These results are older than your cache TTL. Run a fresh scan to update."
                  data-testid="badge-stale-candidates"
                >
                  <Sparkles className="h-3 w-3" /> stale — re-scan
                </span>
              ) : (
                latest.data?.cached && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <Sparkles className="h-3 w-3" /> cached
                  </span>
                )
              )}
              <span>
                {filtered.length}{" "}
                {filtered.length === 1 ? "candidate" : "candidates"}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40 hover:bg-accent/40"
                    data-testid="button-page-prev"
                  >
                    Prev
                  </button>
                  <span className="tabular-nums px-1">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40 hover:bg-accent/40"
                    data-testid="button-page-next"
                  >
                    Next
                  </button>
                </div>
              )}
              <RunScanButton variant="outline" label="Refresh" />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden border-card-border">
          {isError ? (
            <Empty className="py-16" data-testid="state-candidates-error">
              <EmptyHeader>
                <EmptyTitle>Couldn't load candidates</EmptyTitle>
                <EmptyDescription>{errorMessage}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => {
                    void latest.refetch();
                    void summary.refetch();
                  }}
                  data-testid="button-retry-candidates"
                >
                  Retry
                </Button>
              </EmptyContent>
            </Empty>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !hasData ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>No scan results yet</EmptyTitle>
                <EmptyDescription>
                  Run the screener to find short-put candidates with high annualized yield.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <RunScanButton size="lg" label="Run Scan" />
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-candidates">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border">
                    {COLUMNS.map((col) => {
                      const active = sort.key === col.key;
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          className={cn(
                            "px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                            col.align === "right" ? "text-right" : "text-left",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSort(col.key)}
                            className={cn(
                              "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                              active && "text-foreground",
                              col.align === "right" && "flex-row-reverse",
                            )}
                            data-testid={`button-sort-${col.key}`}
                          >
                            {col.label}
                            {active ? (
                              sort.dir === "desc" ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUp className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                    <th className="w-8" />
                    <th className="px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground" scope="col">
                      Qty
                    </th>
                    <th className="w-10 px-2 py-2.5" scope="col">
                      <span className="sr-only">Log trade</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c, i) => {
                    const key = rowKey(c);
                    const isExplainOpen = explainOpen.has(key);
                    return (
                    <Fragment key={`${c.ticker}-${c.expiry}-${c.strike}-${i}`}>
                    <tr
                      onClick={() => setSelected(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(c);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${c.ticker} ${fmtMoney(c.strike)} put expiring ${c.expiry}`}
                      className={cn(
                        "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/30 focus:outline-none focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        i % 2 === 1 && "bg-muted/30",
                      )}
                      data-testid={`row-candidate-${c.ticker}-${i}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/chain/${c.ticker}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold tracking-tight text-foreground hover:text-primary"
                            data-testid={`link-ticker-${c.ticker}`}
                          >
                            {c.ticker}
                          </Link>
                          <ConcentrationChip
                            ticker={c.ticker}
                            strike={c.strike}
                            contracts={getContracts(c)}
                            positions={positions}
                            settings={concentration}
                            sectorMap={sectorMap}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.spot)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtMoney(c.strike)}
                      </td>
                      <td className="px-3 py-2 text-left tabular-nums text-muted-foreground">
                        {fmtDate(c.expiry)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.dte}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.delta, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtFractionPct(c.iv, 1)}</td>
                      <td
                        className="px-3 py-2 text-right"
                        title={
                          c.ivRankBasis === "real"
                            ? "Real IV Rank — current IV's percentile within the trailing 52-week ATM-IV history."
                            : "IV Rank (provisional) — approximated from realized volatility while we accumulate 20+ daily IV snapshots."
                        }
                      >
                        <IvRankPill rank={c.ivRank ?? null} basis={c.ivRankBasis} />
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular-nums"
                        data-testid={`cell-iv-percentile-${c.ticker}`}
                        title={
                          c.ivPercentile == null
                            ? "IV Percentile is shown once 20+ daily IV snapshots have accumulated."
                            : "Share of the trailing 52 weeks where IV was at or below today's."
                        }
                      >
                        {c.ivPercentile == null ? "—" : Math.round(c.ivPercentile * 100)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtMoney(c.bid)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtMoney(c.premiumPerContract)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCompactMoney(c.collateralPerContract)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(c.staticReturnPct, 2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-500">
                        {fmtPct(c.annualizedPct, 1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtPct(c.pctOtm, 1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.breakeven)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtInt(c.openInterest)}
                      </td>
                      <td className="px-2 py-2">
                        <EarningsFlag
                          earningsDate={c.earningsDate}
                          inWindow={c.earningsInWindow}
                        />
                      </td>
                      <td
                        className="px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
                          <button
                            type="button"
                            onClick={() => setContracts(c, getContracts(c) - 1)}
                            disabled={getContracts(c) <= 1}
                            className="flex h-6 w-6 items-center justify-center rounded-l-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                            title="Decrease contracts"
                            data-testid={`button-contracts-decrement-${c.ticker}-${i}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={MAX_CONTRACTS}
                            value={getContracts(c)}
                            onChange={(e) => setContracts(c, Number(e.target.value))}
                            className="h-6 w-10 border-none bg-transparent text-center text-xs tabular-nums focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label={`Contracts for ${c.ticker}`}
                            data-testid={`input-contracts-${c.ticker}-${i}`}
                          />
                          <button
                            type="button"
                            onClick={() => setContracts(c, getContracts(c) + 1)}
                            disabled={getContracts(c) >= MAX_CONTRACTS}
                            className="flex h-6 w-6 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                            title="Increase contracts"
                            data-testid={`button-contracts-increment-${c.ticker}-${i}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td
                        className="px-2 py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AddPositionDialog
                          defaultExpiry={c.expiry}
                          initialValues={{
                            ticker: c.ticker,
                            strike: c.strike,
                            expiry: c.expiry,
                            premium: c.bid,
                            contracts: getContracts(c),
                          }}
                          onCreated={() => {
                            qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
                          }}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title={`Log ${getContracts(c)} × ${c.ticker} ${c.strike}P ${c.expiry}`}
                              data-testid={`button-log-trade-${c.ticker}-${i}`}
                            >
                              <PlusCircle className="h-4 w-4" />
                              <span className="sr-only">Log this trade</span>
                            </Button>
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "ml-1 h-7 w-7 text-muted-foreground hover:text-primary",
                            isExplainOpen && "text-primary",
                          )}
                          title={isExplainOpen ? "Hide AI explanation" : "Explain with Claude"}
                          aria-expanded={isExplainOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExplain(key);
                          }}
                          data-testid={`button-explain-${c.ticker}-${i}`}
                        >
                          <Sparkles className="h-4 w-4" />
                          <span className="sr-only">Explain with Claude</span>
                        </Button>
                      </td>
                    </tr>
                    {isExplainOpen && (
                      <tr
                        className={cn(
                          "border-b border-border/60",
                          i % 2 === 1 && "bg-muted/30",
                        )}
                        data-testid={`row-explain-${c.ticker}-${i}`}
                      >
                        <td colSpan={20} className="px-3 py-2">
                          <AiCandidateExplanation candidate={c} variant="inline" />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {earningsMode === "hide" &&
          (latest.data?.hiddenByEarningsCount ?? 0) > 0 && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-hidden-by-earnings"
            >
              {latest.data!.hiddenByEarningsCount}{" "}
              {latest.data!.hiddenByEarningsCount === 1 ? "candidate" : "candidates"}{" "}
              hidden by earnings filter.{" "}
              <button
                type="button"
                onClick={() => onEarningsModeChange("include")}
                className="font-medium text-primary underline-offset-2 hover:underline"
                data-testid="button-show-hidden-earnings"
              >
                Show them
              </button>
            </p>
          )}
      </motion.div>
      <CandidateDetailDrawer
        candidate={selected}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}

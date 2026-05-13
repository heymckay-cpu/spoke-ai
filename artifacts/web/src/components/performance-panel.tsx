import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Award,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Layers,
  Skull,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  getGetPositionsStatsQueryKey,
  useGetPositionsStats,
  type PositionsStats,
  type RollChain,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { fmtCompactMoney, fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MiniKpiProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  accent?: "default" | "success" | "danger" | "primary";
}

function MiniKpi({ label, value, hint, icon: Icon, accent = "default" }: MiniKpiProps) {
  const accentClasses = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    danger: "text-rose-500",
  }[accent];

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("h-3.5 w-3.5", accentClasses)} />
      </div>
      <div
        className="text-lg font-semibold tabular-nums tracking-tight"
        data-testid={`perf-kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function fmtMonthLabel(month: string): string {
  // month is YYYY-MM
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function fmtTradeLabel(t: PositionsStats["summary"]["bestTrade"]): string {
  if (!t) return "—";
  return `${t.ticker} ${fmtMoney(t.strike, { digits: 0 })}P ${fmtDate(t.expiry)}`;
}

function PnlText({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        positive ? "text-emerald-500" : "text-rose-500",
      )}
    >
      {positive ? "+" : ""}
      {fmtMoney(value)}
    </span>
  );
}

function RollChainRow({ chain }: { chain: RollChain }) {
  const [open, setOpen] = useState(false);
  const pnlPositive = chain.totalRealizedPnl >= 0;
  return (
    <div
      className="rounded-md border border-border/60 bg-card/40"
      data-testid={`roll-chain-${chain.rootId}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
        data-testid={`roll-chain-toggle-${chain.rootId}`}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="text-sm font-semibold tracking-tight">
          {chain.ticker}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          <Layers className="h-3 w-3" />
          {chain.legCount} legs
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            chain.latestStatus === "open"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {chain.latestStatus === "open"
            ? `Open · exp ${fmtDate(chain.latestExpiry)}`
            : "Closed"}
        </span>
        <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="hidden md:inline">
            Opened {fmtDate(chain.openedAt)}
          </span>
          <span className="hidden sm:inline tabular-nums">
            {fmtCompactMoney(chain.totalPremiumCollected)} prem
          </span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              pnlPositive ? "text-emerald-500" : "text-rose-500",
            )}
            data-testid={`roll-chain-pnl-${chain.rootId}`}
          >
            {pnlPositive ? "+" : ""}
            {fmtCompactMoney(chain.totalRealizedPnl)}
          </span>
        </span>
      </button>
      {open && (
        <div
          className="border-t border-border/60 px-3 py-2"
          data-testid={`roll-chain-legs-${chain.rootId}`}
        >
          <ol className="space-y-1.5">
            {chain.legs.map((leg, i) => (
              <li
                key={leg.id}
                className="flex items-center gap-2 text-xs"
                data-testid={`roll-chain-leg-${leg.id}`}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="font-medium tracking-tight">
                  {leg.ticker} {fmtMoney(leg.strike)}P {fmtDate(leg.expiry)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  · {leg.contracts}c · {fmtMoney(leg.premium)}/sh
                </span>
                <span className="ml-auto flex items-center gap-3 text-muted-foreground">
                  <span className="tabular-nums">
                    {fmtDate(leg.openedAt)}
                    {leg.closedAt ? ` → ${fmtDate(leg.closedAt)}` : " → open"}
                  </span>
                  <span className="w-20 text-right">
                    {leg.realizedPnl != null ? (
                      <PnlText value={leg.realizedPnl} />
                    ) : (
                      <span className="text-muted-foreground">open</span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

type RollStatusFilter = "all" | "open" | "closed";
type RollSortOption = "recent" | "pnl" | "premium";

function chainRecency(c: RollChain): number {
  let max = 0;
  for (const leg of c.legs) {
    const opened = leg.openedAt ? new Date(leg.openedAt).getTime() : 0;
    const closed = leg.closedAt ? new Date(leg.closedAt).getTime() : 0;
    if (opened > max) max = opened;
    if (closed > max) max = closed;
  }
  if (max === 0 && c.openedAt) max = new Date(c.openedAt).getTime();
  return max;
}

function RollChainsSection({ chains }: { chains: RollChain[] }) {
  const [tickerFilter, setTickerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<RollStatusFilter>("all");
  const [sortBy, setSortBy] = useState<RollSortOption>("recent");

  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const c of chains) set.add(c.ticker);
    return Array.from(set).sort();
  }, [chains]);

  const filtered = useMemo(() => {
    const result = chains.filter((c) => {
      if (tickerFilter !== "all" && c.ticker !== tickerFilter) return false;
      if (statusFilter !== "all" && c.latestStatus !== statusFilter) return false;
      return true;
    });
    const sorted = [...result];
    if (sortBy === "recent") {
      sorted.sort((a, b) => chainRecency(b) - chainRecency(a));
    } else if (sortBy === "pnl") {
      sorted.sort((a, b) => b.totalRealizedPnl - a.totalRealizedPnl);
    } else if (sortBy === "premium") {
      sorted.sort((a, b) => b.totalPremiumCollected - a.totalPremiumCollected);
    }
    return sorted;
  }, [chains, tickerFilter, statusFilter, sortBy]);

  const statusOptions: { value: RollStatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
  ];

  const sortOptions: { value: RollSortOption; label: string }[] = [
    { value: "recent", label: "Most recent" },
    { value: "pnl", label: "Largest P/L" },
    { value: "premium", label: "Largest premium" },
  ];

  return (
    <div data-testid="roll-chains-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Roll chains
        </span>
        <span
          className="text-[11px] tabular-nums text-muted-foreground"
          data-testid="roll-chains-count"
        >
          {filtered.length} of {chains.length}{" "}
          {chains.length === 1 ? "chain" : "chains"}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Ticker
          <select
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            data-testid="roll-chains-filter-ticker"
            className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All</option>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div
          className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background p-0.5"
          role="group"
          aria-label="Status filter"
        >
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={statusFilter === opt.value ? "secondary" : "ghost"}
              onClick={() => setStatusFilter(opt.value)}
              aria-pressed={statusFilter === opt.value}
              data-testid={`roll-chains-filter-status-${opt.value}`}
              className="h-6 px-2 text-[11px]"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as RollSortOption)}
            data-testid="roll-chains-sort"
            className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-6 text-center text-xs text-muted-foreground"
          data-testid="roll-chains-empty"
        >
          No roll chains match these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <RollChainRow key={c.rootId} chain={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PerformancePanel() {
  const { data, isLoading, isError, error } = useGetPositionsStats({
    query: { refetchInterval: 60_000, queryKey: getGetPositionsStatsQueryKey() },
  });

  const cumulativeData = useMemo(
    () =>
      (data?.cumulativePnl ?? []).map((p, i) => ({
        idx: i + 1,
        date: p.date,
        cumulative: p.cumulative,
        pnl: p.pnl,
      })),
    [data?.cumulativePnl],
  );

  const monthlyData = useMemo(
    () =>
      (data?.premiumByMonth ?? []).map((p) => ({
        month: p.month,
        label: fmtMonthLabel(p.month),
        premium: p.premium,
        count: p.count,
      })),
    [data?.premiumByMonth],
  );

  if (isError) {
    return (
      <Card className="border-card-border" data-testid="performance-panel-error">
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyTitle>Couldn't load performance</EmptyTitle>
            <EmptyDescription>
              {error instanceof Error ? error.message : "Unknown error"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card className="border-card-border">
        <CardContent className="space-y-4 p-4">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const s = data.summary;
  const hasTrades = s.closedCount > 0;
  const rollChains = data.rollChains ?? [];

  if (!hasTrades && rollChains.length === 0) {
    return (
      <Card className="border-card-border" data-testid="performance-panel-empty">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyTitle>No closed trades yet</EmptyTitle>
            <EmptyDescription>
              Close a sold-put position to see your cumulative P/L, win rate, and
              premium-collected history.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }

  const pnlPositive = s.totalRealizedPnl >= 0;

  return (
    <Card className="border-card-border" data-testid="performance-panel">
      <CardContent className="space-y-5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Performance</h2>
            <p className="text-[11px] text-muted-foreground">
              {hasTrades
                ? `Realized results across ${s.closedCount} ${s.closedCount === 1 ? "closed trade" : "closed trades"}.`
                : "No closed trades yet — roll chains shown below."}
            </p>
          </div>
        </div>

        {hasTrades && (
        <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniKpi
            label="Win rate"
            value={`${Math.round(s.winRate * 100)}%`}
            hint={`${s.winCount}W · ${s.lossCount}L`}
            icon={Target}
            accent={s.winRate >= 0.5 ? "success" : "danger"}
          />
          <MiniKpi
            label="Realized P/L"
            value={fmtCompactMoney(s.totalRealizedPnl)}
            hint={`Avg ${fmtCompactMoney(s.totalRealizedPnl / s.closedCount)} / trade`}
            icon={pnlPositive ? TrendingUp : TrendingDown}
            accent={pnlPositive ? "success" : "danger"}
          />
          <MiniKpi
            label="Avg premium"
            value={fmtCompactMoney(s.avgPremiumPerTrade)}
            hint="Per closed trade"
            icon={CircleDollarSign}
            accent="primary"
          />
          <MiniKpi
            label="Avg days held"
            value={s.avgDaysHeld.toFixed(1)}
            hint="Open → close"
            icon={CalendarDays}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Award className="h-3.5 w-3.5" /> Best trade
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold tracking-tight" data-testid="best-trade-label">
                {fmtTradeLabel(s.bestTrade)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {s.bestTrade
                  ? `${s.bestTrade.realizedPnl >= 0 ? "+" : ""}${fmtMoney(s.bestTrade.realizedPnl)}`
                  : "—"}
              </span>
            </div>
            {s.bestTrade && (
              <div className="text-[10px] text-muted-foreground">
                Closed {fmtDate(s.bestTrade.closedAt)} · {s.bestTrade.contracts}c
              </div>
            )}
          </div>
          <div className="rounded-md border border-border/60 bg-rose-500/5 p-3">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
              <Skull className="h-3.5 w-3.5" /> Worst trade
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold tracking-tight" data-testid="worst-trade-label">
                {fmtTradeLabel(s.worstTrade)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {s.worstTrade ? fmtMoney(s.worstTrade.realizedPnl) : "—"}
              </span>
            </div>
            {s.worstTrade && (
              <div className="text-[10px] text-muted-foreground">
                Closed {fmtDate(s.worstTrade.closedAt)} · {s.worstTrade.contracts}c
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Cumulative realized P/L
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {cumulativeData.length} trades
              </span>
            </div>
            <div className="h-48" data-testid="chart-cumulative-pnl">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={cumulativeData}
                  margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="cumPnlPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtDate(d as string)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtCompactMoney(v as number)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <RechartsTooltip
                    cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.3 }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    labelFormatter={(l) => fmtDate(l as string)}
                    formatter={(value: number, name) => [
                      fmtMoney(value),
                      name === "cumulative" ? "Cumulative" : "Trade P/L",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.75}
                    fill="url(#cumPnlPos)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Premium collected by month
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {monthlyData.length} {monthlyData.length === 1 ? "month" : "months"}
              </span>
            </div>
            <div className="h-48" data-testid="chart-premium-by-month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtCompactMoney(v as number)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.4 }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={(value: number, _name, p) => [
                      `${fmtMoney(value)} (${p.payload.count} ${p.payload.count === 1 ? "trade" : "trades"})`,
                      "Premium",
                    ]}
                  />
                  <Bar
                    dataKey="premium"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </>
        )}

        {rollChains.length > 0 && (
          <RollChainsSection chains={rollChains} />
        )}
      </CardContent>
    </Card>
  );
}

import { useMemo } from "react";
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
  CircleDollarSign,
  Skull,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  getGetPositionsStatsQueryKey,
  useGetPositionsStats,
  type PositionsStats,
} from "@workspace/api-client-react";
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

  if (!hasTrades) {
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
              Realized results across {s.closedCount}{" "}
              {s.closedCount === 1 ? "closed trade" : "closed trades"}.
            </p>
          </div>
        </div>

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
      </CardContent>
    </Card>
  );
}

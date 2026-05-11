import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  getGetChainQueryKey,
  useGetChain,
  useGetChainExpirations,
  useGetQuote,
  type ChainRow,
} from "@workspace/api-client-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EarningsFlag } from "@/components/earnings-flag";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { fmtDate, fmtFractionPct, fmtInt, fmtMoney, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function findSpotInsertIndex(rows: ChainRow[], spot: number): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].strike >= spot) return i;
  }
  return rows.length;
}

interface ChainTableProps {
  side: "puts" | "calls";
  rows: ChainRow[];
  spot: number;
}

function ChainTable({ side, rows, spot }: ChainTableProps) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.strike - b.strike), [rows]);
  const spotIndex = findSpotInsertIndex(sorted, spot);
  const isPut = side === "puts";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid={`table-chain-${side}`}>
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b border-border">
            {[
              "Strike",
              "Bid",
              "Ask",
              "Last",
              "IV",
              "Δ",
              "Γ",
              "Θ",
              "Vega",
              "OI",
              "Vol",
            ].map((h) => (
              <th
                key={h}
                className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.flatMap((row, i) => {
            const itm = row.inTheMoney;
            const showSpot = i === spotIndex;
            const nodes = [];
            if (showSpot) {
              nodes.push(
                <tr key={`spot-${i}`} aria-hidden>
                  <td colSpan={11} className="px-2 py-0">
                    <div className="my-0.5 flex items-center gap-2">
                      <div className="h-px flex-1 bg-primary/40" />
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary tabular-nums">
                        Spot {fmtMoney(spot)}
                      </span>
                      <div className="h-px flex-1 bg-primary/40" />
                    </div>
                  </td>
                </tr>,
              );
            }
            nodes.push(
              <tr
                key={`${row.strike}-${i}`}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-accent/30",
                  itm && (isPut ? "bg-rose-500/5" : "bg-emerald-500/5"),
                )}
                data-testid={`row-chain-${side}-${row.strike}`}
              >
                <td className="px-2 py-1.5 text-left tabular-nums font-medium">
                  {fmtMoney(row.strike)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(row.bid)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtMoney(row.ask)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(row.lastPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtFractionPct(row.iv, 1)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(row.delta, 2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtNum(row.gamma, 3)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtNum(row.theta, 3)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtNum(row.vega, 3)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(row.openInterest)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtInt(row.volume)}
                </td>
              </tr>,
            );
            return nodes;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ChainPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const quote = useGetQuote(ticker);
  const expirations = useGetChainExpirations(ticker);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedExpiry && expirations.data?.expirations?.length) {
      setSelectedExpiry(expirations.data.expirations[0]);
    }
  }, [expirations.data, selectedExpiry]);

  const chain = useGetChain(ticker, selectedExpiry ?? "", {
    query: {
      enabled: !!ticker && !!selectedExpiry,
      queryKey: getGetChainQueryKey(ticker, selectedExpiry ?? ""),
    },
  });

  const dayChange = quote.data?.dayChange ?? null;
  const dayChangePct = quote.data?.dayChangePct ?? null;
  const isUp = (dayChange ?? 0) >= 0;

  const putDeltaSeries = useMemo(() => {
    if (!chain.data) return [];
    return [...chain.data.puts]
      .sort((a, b) => a.strike - b.strike)
      .map((p) => ({ strike: p.strike, delta: Math.abs(p.delta) }));
  }, [chain.data]);

  return (
    <AppShell
      title={ticker || "Chain"}
      breadcrumbs={[
        { label: "Candidates", href: "/" },
        { label: "Chain", href: "/chain" },
        { label: ticker || "—" },
      ]}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        {!ticker ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyTitle>Pick a ticker</EmptyTitle>
              <EmptyDescription>
                Open a candidate from the screener to inspect its options chain.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline">
                <Link href="/">Browse candidates</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <Card className="border-card-border">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-4">
                  <Button asChild variant="ghost" size="icon" className="md:hidden">
                    <Link href="/">
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-chain-ticker">
                        {ticker}
                      </h2>
                      <EarningsFlag
                        earningsDate={quote.data?.earningsDate}
                        inWindow={quote.data?.earningsInWindow ?? false}
                      />
                    </div>
                    {quote.data?.name && (
                      <div className="text-xs text-muted-foreground">{quote.data.name}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Spot
                    </div>
                    <div className="text-2xl font-semibold tabular-nums" data-testid="text-spot">
                      {quote.isLoading ? (
                        <Skeleton className="h-7 w-20" />
                      ) : (
                        fmtMoney(quote.data?.spot ?? 0)
                      )}
                    </div>
                  </div>
                  {dayChange != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Day Change
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-base font-medium tabular-nums",
                          isUp ? "text-emerald-500" : "text-rose-500",
                        )}
                        data-testid="text-day-change"
                      >
                        {isUp ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                        {fmtMoney(Math.abs(dayChange))}
                        {dayChangePct != null && (
                          <span className="text-xs opacity-80">
                            ({(dayChangePct * 100).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Expirations + Chart */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-card-border lg:col-span-2">
                <CardContent className="p-4">
                  {expirations.isLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : expirations.data?.expirations?.length ? (
                    <Tabs
                      value={selectedExpiry ?? ""}
                      onValueChange={(v) => setSelectedExpiry(v)}
                      className="w-full"
                    >
                      <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                        {expirations.data.expirations.map((exp) => (
                          <TabsTrigger
                            key={exp}
                            value={exp}
                            className="rounded-md border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary text-xs tabular-nums"
                            data-testid={`tab-expiry-${exp}`}
                          >
                            {fmtDate(exp)}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  ) : (
                    <div className="text-sm text-muted-foreground">No expirations available.</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-card-border">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Put |Δ| vs Strike
                    </span>
                    {chain.data && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {chain.data.dte} DTE
                      </span>
                    )}
                  </div>
                  <div className="h-24">
                    {putDeltaSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={putDeltaSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="putDelta" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="strike" hide />
                          <YAxis hide domain={[0, 1]} />
                          <RechartsTooltip
                            cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.3 }}
                            contentStyle={{
                              background: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                            formatter={(v: number) => v.toFixed(2)}
                            labelFormatter={(l) => `Strike ${fmtMoney(l as number)}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="delta"
                            stroke="hsl(var(--primary))"
                            strokeWidth={1.5}
                            fill="url(#putDelta)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <Skeleton className="h-full w-full" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chain tables */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden border-card-border">
                <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-500">
                  Calls
                </div>
                {chain.isLoading || !chain.data ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <ChainTable side="calls" rows={chain.data.calls} spot={chain.data.spot} />
                )}
              </Card>
              <Card className="overflow-hidden border-card-border">
                <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-rose-500">
                  Puts
                </div>
                {chain.isLoading || !chain.data ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <ChainTable side="puts" rows={chain.data.puts} spot={chain.data.spot} />
                )}
              </Card>
            </div>
          </>
        )}
      </motion.div>
    </AppShell>
  );
}

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Briefcase,
  DollarSign,
  Phone,
  Shapes,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHoldings,
  useDeleteHolding,
  useRunCallScan,
  getListHoldingsQueryKey,
  type Holding,
  type CallCandidate,
  type CallScanResult,
} from "@workspace/api-client-react";
import { resolveSector } from "@workspace/portfolio";
import { useSectorMap } from "@/hooks/use-sector-map";
import { AppShell } from "@/components/app-shell";
import { AddHoldingDialog } from "@/components/add-holding-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpokeSpinner } from "@/components/spoke-spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import {
  fmtCompactMoney,
  fmtDate,
  fmtFractionPct,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtInt,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Briefcase;
  accent?: "default" | "primary" | "success" | "warning" | "danger";
}

function Kpi({ label, value, hint, icon: Icon, accent = "default" }: KpiProps) {
  const accentClasses = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
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
        <div className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        {hint && (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function HoldingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = getListHoldingsQueryKey();
  const { data, isLoading, isError, error, refetch } = useListHoldings({
    query: { queryKey, refetchInterval: 60_000 },
  });
  const del = useDeleteHolding();
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [callScan, setCallScan] = useState<CallScanResult | null>(null);
  const runCalls = useRunCallScan();
  const onScanCalls = () => {
    runCalls.mutate(undefined, {
      onSuccess: (result) => {
        setCallScan(result);
        if (result.candidates.length === 0 && result.holdingsScanned > 0) {
          toast({
            title: "No covered-call ideas qualified",
            description:
              "No strikes above your basis fit the configured delta/DTE window. Try widening Max Δ in Settings.",
          });
        }
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({
          variant: "destructive",
          title: "Couldn't scan covered calls",
          description: message,
        });
      },
    });
  };

  const holdings: Holding[] = data?.holdings ?? [];
  const totals = data?.totals ?? {
    holdingsCount: 0,
    totalCost: 0,
    totalMarketValue: 0,
    totalUnrealizedPnl: 0,
  };

  const sectorTickers = useMemo(
    () => holdings.map((h) => h.ticker),
    [holdings],
  );
  const sectorMap = useSectorMap(sectorTickers);

  const sectorBreakdown = useMemo(() => {
    const bySector = new Map<string, { value: number; count: number }>();
    let total = 0;
    for (const h of holdings) {
      const value = h.marketValue ?? h.avgCost * h.shares;
      const sector = resolveSector(h.ticker, sectorMap);
      const cur = bySector.get(sector) ?? { value: 0, count: 0 };
      cur.value += value;
      cur.count += 1;
      bySector.set(sector, cur);
      total += value;
    }
    return {
      total,
      rows: Array.from(bySector.entries())
        .map(([sector, v]) => ({ sector, ...v }))
        .sort((a, b) => b.value - a.value),
    };
  }, [holdings, sectorMap]);

  const invalidate = () => {
    // Clear any stale covered-call results — they reference holdings that may
    // have just been added, removed, or had their share count changed.
    setCallScan(null);
    qc.invalidateQueries({ queryKey });
  };

  const onDelete = (id: number, ticker: string) => {
    setPendingDelete(id);
    del.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Holding removed", description: ticker });
          invalidate();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({
            variant: "destructive",
            title: "Failed to remove holding",
            description: message,
          });
        },
        onSettled: () => setPendingDelete(null),
      },
    );
  };

  return (
    <AppShell title="Holdings" breadcrumbs={[{ label: "Holdings" }]}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Holdings"
            value={fmtInt(totals.holdingsCount)}
            icon={Briefcase}
          />
          <Kpi
            label="Cost basis"
            value={fmtCompactMoney(totals.totalCost)}
            icon={DollarSign}
          />
          <Kpi
            label="Market value"
            value={fmtCompactMoney(totals.totalMarketValue)}
            icon={TrendingUp}
            accent="primary"
          />
          <Kpi
            label="Unrealized P/L"
            value={fmtCompactMoney(totals.totalUnrealizedPnl)}
            icon={TrendingUp}
            accent={totals.totalUnrealizedPnl >= 0 ? "success" : "danger"}
          />
        </div>

        {holdings.length > 0 && sectorBreakdown.rows.length > 0 && (
          <Card
            className="overflow-hidden border-card-border"
            data-testid="card-sector-breakdown"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border bg-card/95 py-3">
              <div className="flex items-center gap-2">
                <Shapes className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium">By sector</CardTitle>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {sectorBreakdown.rows.length} sector
                {sectorBreakdown.rows.length === 1 ? "" : "s"} ·{" "}
                {fmtCompactMoney(sectorBreakdown.total)}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 p-4">
              {sectorBreakdown.rows.map((row) => {
                const pct =
                  sectorBreakdown.total > 0
                    ? (row.value / sectorBreakdown.total) * 100
                    : 0;
                return (
                  <div
                    key={row.sector}
                    className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px]"
                    data-testid={`chip-sector-${row.sector}`}
                  >
                    <span className="font-medium">{row.sector}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtCompactMoney(row.value)} · {fmtPct(pct, 0)} ·{" "}
                      {row.count} pos
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {holdings.some((h) => h.shares >= 100) && (
            <Button
              variant="outline"
              onClick={onScanCalls}
              disabled={runCalls.isPending}
              data-testid="button-scan-covered-calls"
            >
              {runCalls.isPending ? (
                <SpokeSpinner size={14} className="mr-2" label="Scanning covered calls" />
              ) : (
                <Phone className="mr-2 h-4 w-4" />
              )}
              {runCalls.isPending ? "Scanning…" : "Scan covered calls"}
            </Button>
          )}
          <AddHoldingDialog onCreated={invalidate} />
        </div>

        <Card className="overflow-hidden border-card-border">
          {isError ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>Couldn't load holdings</EmptyTitle>
                <EmptyDescription>
                  {error instanceof Error ? error.message : "Unknown error"}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              </EmptyContent>
            </Empty>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>No holdings yet</EmptyTitle>
                <EmptyDescription>
                  Log shares you own (often from put assignment) so the screener can recommend covered calls and avoid over-concentration.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <AddHoldingDialog onCreated={invalidate} />
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-holdings">
                <thead>
                  <tr className="border-b border-border bg-card/95">
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Ticker
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Sector
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Shares
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Avg cost
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Spot
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Cost basis
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Market value
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Unrealized P/L
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const cost = h.avgCost * h.shares;
                    const pnl = h.unrealizedPnl ?? 0;
                    const pnlPct = h.unrealizedPnlPct;
                    return (
                      <tr
                        key={h.id}
                        className={cn(
                          "border-b border-border/60",
                          i % 2 === 1 && "bg-muted/30",
                        )}
                        data-testid={`row-holding-${h.ticker}`}
                      >
                        <td className="px-3 py-2 font-semibold tracking-tight">
                          {h.ticker}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-muted-foreground"
                          data-testid={`cell-sector-${h.ticker}`}
                        >
                          {resolveSector(h.ticker, sectorMap)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtInt(h.shares)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtMoney(h.avgCost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {h.spot != null ? fmtMoney(h.spot) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtCompactMoney(cost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {h.marketValue != null
                            ? fmtCompactMoney(h.marketValue)
                            : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums font-medium",
                            h.unrealizedPnl == null
                              ? "text-muted-foreground"
                              : h.unrealizedPnl >= 0
                                ? "text-emerald-500"
                                : "text-rose-500",
                          )}
                        >
                          {h.unrealizedPnl != null
                            ? `${fmtCompactMoney(pnl)}${pnlPct != null ? ` · ${fmtPct(pnlPct * 100, 1)}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                            onClick={() => onDelete(h.id, h.ticker)}
                            disabled={pendingDelete === h.id}
                            title={`Remove ${h.ticker}`}
                            data-testid={`button-delete-holding-${h.ticker}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {callScan && (
          <Card className="overflow-hidden border-card-border" data-testid="card-covered-calls">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border bg-card/95 py-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium">
                  Covered call ideas
                </CardTitle>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {callScan.holdingsWithCandidate} of {callScan.holdingsScanned}{" "}
                holding{callScan.holdingsScanned === 1 ? "" : "s"} qualified
              </div>
            </CardHeader>
            {callScan.candidates.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyTitle>No covered-call ideas qualified</EmptyTitle>
                  <EmptyDescription>
                    {callScan.errors.length > 0
                      ? `No strikes above your basis fit the configured delta/DTE window. Common reason: spot is below your cost basis, so OTM strikes that protect against a loss are too far out for the target delta. You can widen Max Δ in Settings, or sell a call below your basis (knowing assignment would lock in a loss on the underlying).`
                      : "Add holdings of at least 100 shares to scan covered calls."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-call-candidates">
                  <thead>
                    <tr className="border-b border-border bg-card/95">
                      {[
                        "Ticker",
                        "Spot",
                        "Strike",
                        "Expiry",
                        "DTE",
                        "Δ",
                        "IV",
                        "Bid",
                        "Prem (1ct)",
                        "Prem (max)",
                        "Static %",
                        "Ann %",
                        "OTM %",
                        "Qty",
                      ].map((label, i) => (
                        <th
                          key={label}
                          className={cn(
                            "px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                            i === 0 ? "text-left" : "text-right",
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {callScan.candidates.map((c: CallCandidate, i) => (
                      <tr
                        key={`${c.ticker}-${c.expiry}-${c.strike}`}
                        className={cn(
                          "border-b border-border/60",
                          i % 2 === 1 && "bg-muted/30",
                        )}
                        data-testid={`row-call-${c.ticker}`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 font-semibold tracking-tight">
                            {c.ticker}
                            {!c.aboveBasis && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500"
                                title={`Strike ${fmtMoney(c.strike)} is below your avg cost ${fmtMoney(c.avgCost)} — assignment would realize a loss on the underlying.`}
                              >
                                <AlertTriangle className="h-3 w-3" /> below basis
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.spot)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {fmtMoney(c.strike)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtDate(c.expiry)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.dte}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.delta, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtFractionPct(c.iv, 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.bid)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtMoney(c.premiumPerContract)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-500">
                          {fmtCompactMoney(c.premiumTotal)}
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
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {c.contractsAvailable}× ({fmtInt(c.shares)} sh)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </motion.div>
    </AppShell>
  );
}

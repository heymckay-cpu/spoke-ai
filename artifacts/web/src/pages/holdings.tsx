import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, DollarSign, TrendingUp, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHoldings,
  useDeleteHolding,
  getListHoldingsQueryKey,
  type Holding,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { AddHoldingDialog } from "@/components/add-holding-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import { fmtCompactMoney, fmtMoney, fmtPct, fmtInt } from "@/lib/format";
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

  const holdings: Holding[] = data?.holdings ?? [];
  const totals = data?.totals ?? {
    holdingsCount: 0,
    totalCost: 0,
    totalMarketValue: 0,
    totalUnrealizedPnl: 0,
  };

  const invalidate = () => qc.invalidateQueries({ queryKey });

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

        <div className="flex justify-end">
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
      </motion.div>
    </AppShell>
  );
}

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  Layers,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  getListPositionsQueryKey,
  useListPositions,
  useUpdatePosition,
  useDeletePosition,
  type Position,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { AddPositionDialog } from "@/components/add-position-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fmtCompactMoney, fmtDate, fmtMoney, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Layers;
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
        <div
          className="text-2xl font-semibold tabular-nums tracking-tight"
          data-testid={`kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}
        >
          {value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function PnlCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        positive ? "text-emerald-500" : "text-rose-500",
      )}
    >
      {positive ? "+" : ""}
      {fmtMoney(value)}
    </span>
  );
}

function StatusBadge({ position }: { position: Position }) {
  if (position.status === "closed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Closed
      </span>
    );
  }
  if (position.assignmentRisk) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400"
        title="Spot has fallen below strike — assignment likely if held to expiry."
      >
        <AlertTriangle className="h-3 w-3" /> ITM
      </span>
    );
  }
  if (position.expiringSoon) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400"
        title="Expires within a week."
      >
        <CalendarClock className="h-3 w-3" /> {position.dte}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      Open
    </span>
  );
}


interface ClosePositionDialogProps {
  position: Position;
  onClosed: () => void;
}

function ClosePositionDialog({ position, onClosed }: ClosePositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [closePrice, setClosePrice] = useState<string>(
    position.currentBid != null ? position.currentBid.toFixed(2) : "0",
  );
  const { toast } = useToast();
  const update = useUpdatePosition();

  const onSubmit = () => {
    const v = Number(closePrice);
    if (!Number.isFinite(v) || v < 0) {
      toast({ variant: "destructive", title: "Invalid price" });
      return;
    }
    update.mutate(
      { id: position.id, data: { closePrice: v } },
      {
        onSuccess: () => {
          toast({ title: "Position closed" });
          setOpen(false);
          onClosed();
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to close",
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={`button-close-position-${position.id}`}
        >
          Close
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Close {position.ticker} {fmtMoney(position.strike)}P
          </DialogTitle>
          <DialogDescription>
            Enter the per-share buy-to-close price. P/L = (premium − close) × 100 × contracts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Buy-to-close ($/share)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              className="tabular-nums"
              data-testid="input-close-price"
            />
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Premium received: {fmtMoney(position.premium)} / share •{" "}
            Realized P/L:{" "}
            <PnlCell
              value={
                Number.isFinite(Number(closePrice))
                  ? (position.premium - Number(closePrice)) * 100 * position.contracts
                  : null
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={update.isPending}
            data-testid="button-confirm-close"
          >
            {update.isPending ? "Closing…" : "Confirm close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PositionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useListPositions({
    query: { refetchInterval: 60_000, queryKey: getListPositionsQueryKey() },
  });
  const reopen = useUpdatePosition();
  const remove = useDeletePosition();
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");

  const today = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const positions = data?.positions ?? [];
  const visible = useMemo(
    () => (filter === "all" ? positions : positions.filter((p) => p.status === filter)),
    [positions, filter],
  );

  const totals = data?.totals;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
  };

  const onReopen = (p: Position) => {
    reopen.mutate(
      { id: p.id, data: { closePrice: null } },
      {
        onSuccess: () => {
          toast({ title: "Position re-opened" });
          invalidate();
        },
      },
    );
  };

  const onDelete = (p: Position) => {
    if (!window.confirm(`Delete ${p.ticker} ${p.strike}P ${p.expiry}?`)) return;
    remove.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          toast({ title: "Position deleted" });
          invalidate();
        },
      },
    );
  };

  return (
    <AppShell
      title="Positions"
      breadcrumbs={[{ label: "Positions" }]}
      actions={<AddPositionDialog defaultExpiry={today} onCreated={invalidate} />}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Open"
            value={totals ? fmtInt(totals.openCount) : "—"}
            hint={totals ? `${totals.closedCount} closed` : undefined}
            icon={Layers}
            accent="primary"
          />
          <Kpi
            label="Premium Received"
            value={totals ? fmtCompactMoney(totals.totalPremium) : "—"}
            hint="Open positions"
            icon={CircleDollarSign}
            accent="success"
          />
          <Kpi
            label="Collateral"
            value={totals ? fmtCompactMoney(totals.totalCollateral) : "—"}
            hint="At risk if assigned"
            icon={Layers}
          />
          <Kpi
            label="Unrealized P/L"
            value={totals ? fmtCompactMoney(totals.openUnrealizedPnl) : "—"}
            hint="Vs current bid"
            icon={totals && totals.openUnrealizedPnl >= 0 ? TrendingUp : TrendingDown}
            accent={totals && totals.openUnrealizedPnl >= 0 ? "success" : "danger"}
          />
          <Kpi
            label="Realized P/L"
            value={totals ? fmtCompactMoney(totals.closedRealizedPnl) : "—"}
            hint="Closed trades"
            icon={totals && totals.closedRealizedPnl >= 0 ? TrendingUp : TrendingDown}
            accent={totals && totals.closedRealizedPnl >= 0 ? "success" : "danger"}
          />
        </div>

        <Card className="border-card-border">
          <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-1 text-xs">
              {(["open", "closed", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs uppercase tracking-wider transition-colors",
                    filter === f
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                  data-testid={`button-filter-${f}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "position" : "positions"}
            </span>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-card-border">
          {isError ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>Couldn't load positions</EmptyTitle>
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>No positions {filter !== "all" ? `(${filter})` : "yet"}</EmptyTitle>
                <EmptyDescription>
                  Log a sold put to start tracking live P/L and assignment risk.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <AddPositionDialog defaultExpiry={today} onCreated={invalidate} />
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-positions">
                <thead className="bg-card/95">
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 text-left">Ticker</th>
                    <th className="px-3 py-2.5 text-right">Strike</th>
                    <th className="px-3 py-2.5 text-left">Expiry</th>
                    <th className="px-3 py-2.5 text-right">DTE</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Premium</th>
                    <th className="px-3 py-2.5 text-right">Spot</th>
                    <th className="px-3 py-2.5 text-right">Bid</th>
                    <th className="px-3 py-2.5 text-right">P/L</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="w-[160px] px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, i) => (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border/60 transition-colors hover:bg-accent/30",
                        i % 2 === 1 && "bg-muted/30",
                        p.assignmentRisk && "bg-rose-500/5",
                        p.expiringSoon && !p.assignmentRisk && "bg-amber-500/5",
                      )}
                      data-testid={`row-position-${p.id}`}
                    >
                      <td className="px-3 py-2 font-semibold tracking-tight">{p.ticker}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(p.strike)}</td>
                      <td className="px-3 py-2 text-left tabular-nums text-muted-foreground">
                        {fmtDate(p.expiry)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.dte}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.contracts}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(p.premium)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {p.spot != null ? fmtMoney(p.spot) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {p.currentBid != null ? fmtMoney(p.currentBid) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PnlCell
                          value={p.status === "closed" ? p.realizedPnl : p.unrealizedPnl}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge position={p} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "open" ? (
                            <ClosePositionDialog position={p} onClosed={invalidate} />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onReopen(p)}
                              data-testid={`button-reopen-position-${p.id}`}
                            >
                              Re-open
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(p)}
                            aria-label="Delete position"
                            data-testid={`button-delete-position-${p.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <X className="h-3 w-3" />
          Quotes are delayed ~15 minutes. P/L uses the current put bid (buy-to-close
          proxy) — actual fills may differ.
        </p>
      </motion.div>
    </AppShell>
  );
}

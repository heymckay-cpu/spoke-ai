import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJournal,
  useDeleteJournalEntry,
  getListJournalQueryKey,
} from "@workspace/api-client-react";
import type { JournalEntry } from "@workspace/api-client-react";
import { ArrowUpRight, NotebookPen, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "taken" | "passed";

function DecisionChip({ decision }: { decision: "taken" | "passed" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        decision === "taken"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
      data-testid={`chip-decision-${decision}`}
    >
      {decision === "taken" ? "Taken" : "Passed"}
    </span>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function JournalPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useListJournal(
    filter === "all" ? undefined : { decision: filter },
    { query: { queryKey: getListJournalQueryKey(filter === "all" ? undefined : { decision: filter }) } },
  );
  const deleteEntry = useDeleteJournalEntry();

  const entries: JournalEntry[] = data?.entries ?? [];
  const stats = data?.stats ?? { taken: 0, passed: 0 };
  const total = stats.taken + stats.passed;

  const onDelete = (entry: JournalEntry) => {
    deleteEntry.mutate(
      { id: entry.id },
      {
        onSuccess: () => {
          toast({ title: "Journal entry removed" });
          void qc.invalidateQueries({ queryKey: getListJournalQueryKey() });
          void refetch();
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to remove entry",
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      },
    );
  };

  return (
    <AppShell title="Journal" breadcrumbs={[{ label: "Journal" }]}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Decisions logged"
            value={String(total)}
            hint="Every take and pass, from the candidate drawer"
          />
          <StatTile
            label="Taken"
            value={String(stats.taken)}
            hint={total > 0 ? `${Math.round((stats.taken / total) * 100)}% of decisions` : undefined}
          />
          <StatTile
            label="Passed"
            value={String(stats.passed)}
            hint="Your control group — what you chose not to trade"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="tablist" aria-label="Filter journal">
            {(["all", "taken", "passed"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(f)}
                data-testid={`button-filter-${f}`}
              >
                {f === "all" ? "All" : f === "taken" ? "Taken" : "Passed"}
              </Button>
            ))}
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Passed recommendations are kept on purpose: they're the benchmark
            your taken trades have to beat.
          </p>
        </div>

        <Card className="overflow-hidden border-card-border">
          {isError ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>Couldn't load the journal</EmptyTitle>
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
          ) : entries.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <NotebookPen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <EmptyTitle>
                  {filter === "all" ? "No decisions logged yet" : `No ${filter} entries`}
                </EmptyTitle>
                <EmptyDescription>
                  Open a candidate on the dashboard and use “Log this trade” or
                  “Pass”. Recording both sides is what turns the screener into a
                  forward test.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="outline">
                  <Link href="/dashboard">View candidates</Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-journal">
                <thead>
                  <tr className="border-b border-border bg-card/95">
                    {["Decided", "Ticker", "Decision", "Strike", "Expiry", "Bid", "Ann %", "IV Rank", "Quiver", "Position", ""].map(
                      (label, i) => (
                        <th
                          key={`${label}-${i}`}
                          className={cn(
                            "px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                            i <= 2 ? "text-left" : "text-right",
                          )}
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={e.id}
                      className={cn("border-b border-border/60", i % 2 === 1 && "bg-muted/30")}
                      data-testid={`row-journal-${e.id}`}
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {fmtDate(e.decidedAt.slice(0, 10))}
                      </td>
                      <td className="px-3 py-2 font-semibold tracking-tight">{e.ticker}</td>
                      <td className="px-3 py-2">
                        <DecisionChip decision={e.decision} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.strike)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtDate(e.expiry)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.bid)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.annualizedPct != null ? fmtPct(e.annualizedPct, 1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {e.ivRank != null ? Math.round(e.ivRank * 100) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {e.quiverScore != null ? Math.round(e.quiverScore) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.positionId != null ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href="/dashboard/positions">
                              #{e.positionId}
                              <ArrowUpRight className="ml-0.5 h-3 w-3" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(e)}
                          aria-label="Delete journal entry"
                          data-testid={`button-delete-journal-${e.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>
    </AppShell>
  );
}

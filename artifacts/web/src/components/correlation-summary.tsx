import {
  useGetPortfolioCorrelation,
  getGetPortfolioCorrelationQueryKey,
} from "@workspace/api-client-react";
import { GitMerge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Portfolio-level correlation card for the positions page: effective
 * position count plus any hidden-trap pairs. Hidden with fewer than two
 * open tickers (nothing to correlate).
 */
export function CorrelationSummary({ className }: { className?: string }) {
  const { data } = useGetPortfolioCorrelation(undefined, {
    query: {
      queryKey: getGetPortfolioCorrelationQueryKey(undefined),
      staleTime: 10 * 60 * 1000,
    },
  });

  if (!data || data.tickers.length < 2) return null;
  const nEff = data.effectivePositions;
  const traps = data.traps;
  const overlapping = nEff != null && nEff < data.tickers.length * 0.75;

  return (
    <Card className={cn("border-card-border", className)} data-testid="correlation-summary">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <GitMerge className="h-3.5 w-3.5" />
            Correlation risk · {data.windowDays}d returns
          </div>
          {nEff != null && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                overlapping
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
              )}
              title="Diversification-adjusted position count: equal uncorrelated positions count fully; highly correlated ones collapse toward a single bet."
              data-testid="effective-positions"
            >
              {data.tickers.length} positions ≈ {nEff} effective
            </span>
          )}
        </div>

        {traps.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {traps.slice(0, 4).map((t) => (
              <li key={`${t.a}-${t.b}`} className="flex items-center justify-between">
                <span>
                  <span className="font-semibold">{t.a}</span> ×{" "}
                  <span className="font-semibold">{t.b}</span> move together
                </span>
                <span className="tabular-nums text-rose-600 dark:text-rose-400">
                  ρ {t.rho.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No hidden correlation traps — no open pair above ρ 0.70.
          </p>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">
          Correlated positions tend to get assigned together in a drawdown.
          Treat highly correlated tickers as one position when sizing.
        </p>
      </CardContent>
    </Card>
  );
}

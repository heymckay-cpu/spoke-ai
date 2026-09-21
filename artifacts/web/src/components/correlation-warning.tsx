import {
  useGetPortfolioCorrelation,
  getGetPortfolioCorrelationQueryKey,
} from "@workspace/api-client-react";
import { GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
  className?: string;
}

/**
 * Hidden-correlation-trap warning for the candidate drawer: how strongly
 * this candidate's daily returns move with the user's open positions.
 * Renders nothing when there are no open positions or nothing computable.
 */
export function CorrelationWarning({ ticker, className }: Props) {
  const { data } = useGetPortfolioCorrelation(
    { candidate: ticker },
    {
      query: {
        queryKey: getGetPortfolioCorrelationQueryKey({ candidate: ticker }),
        staleTime: 10 * 60 * 1000,
      },
    },
  );

  const cand = data?.candidate;
  if (!cand || cand.maxRho == null || cand.maxRhoTicker == null) return null;

  const rho = cand.maxRho;
  const pctLabel = `ρ ${rho.toFixed(2)}`;
  const high = rho >= 0.7;
  const medium = rho >= 0.5 && rho < 0.7;
  if (!high && !medium) return null;

  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        high
          ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className,
      )}
      data-testid="correlation-warning"
    >
      <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {high ? (
          <>
            <span className="font-semibold">Hidden correlation trap:</span>{" "}
            {ticker} has moved with your open {cand.maxRhoTicker} position (
            {pctLabel} over {data?.windowDays ?? 90} trading days). Different
            tickers, same bet — a drawdown could assign both at once.
          </>
        ) : (
          <>
            {ticker} is moderately correlated with your open {cand.maxRhoTicker}{" "}
            position ({pctLabel}). Worth counting them as overlapping exposure
            when sizing.
          </>
        )}
      </span>
    </div>
  );
}

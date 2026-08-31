import { useGetQuiverSignals } from "@workspace/api-client-react";
import type { QuiverCongressTrade } from "@workspace/api-client-react";
import { Landmark, UserRound, FileText } from "lucide-react";
import { fmtCompactMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
  className?: string;
}

function scoreTone(score: number): string {
  if (score >= 65) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (score <= 35) return "bg-red-500/15 text-red-700 dark:text-red-400";
  return "bg-muted text-muted-foreground";
}

function scoreWord(score: number): string {
  if (score >= 65) return "bullish tilt";
  if (score <= 35) return "bearish tilt";
  return "neutral";
}

function CongressTradeRow({ trade }: { trade: QuiverCongressTrade }) {
  return (
    <li className="flex items-start justify-between gap-2 text-xs">
      <span className="min-w-0 truncate">
        <span className="font-medium text-foreground">{trade.name}</span>
        {trade.party && (
          <span className="text-muted-foreground"> ({trade.party})</span>
        )}{" "}
        <span
          className={cn(
            "font-medium",
            trade.transaction === "buy"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {trade.transaction === "buy" ? "bought" : "sold"}
        </span>
        {trade.amountRange && (
          <span className="text-muted-foreground"> {trade.amountRange}</span>
        )}
      </span>
      <span className="shrink-0 text-right text-muted-foreground tabular-nums">
        {trade.tradeDate ? fmtDate(trade.tradeDate) : "—"}
        {trade.lagDays != null && (
          <span className="block text-[10px]">
            disclosed {trade.lagDays}d later
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Alternative-data section for the candidate drawer, powered by Quiver
 * Quantitative. Renders nothing when the server has no Quiver key, so the
 * feature is invisible until QUIVER_API_KEY is configured.
 */
export function QuiverSignalsCard({ ticker, className }: Props) {
  const { data, isLoading, isError } = useGetQuiverSignals(ticker);

  if (isLoading) {
    return (
      <div
        className={cn("h-16 w-full animate-pulse rounded-md bg-muted/40", className)}
        data-testid="quiver-loading"
      />
    );
  }
  // Hide entirely when the feature isn't configured; show nothing noisy on
  // transient errors either — this section is supplementary.
  if (isError || !data || !data.configured) return null;

  const { congress, insiders, govContracts, lobbying, score, scoreComponents } = data;
  const hasActivity =
    (congress && (congress.buys > 0 || congress.sells > 0)) ||
    (insiders && (insiders.buys > 0 || insiders.sells > 0)) ||
    (govContracts && govContracts.count > 0) ||
    (lobbying && lobbying.count > 0);

  return (
    <div className={cn("mt-4 space-y-2", className)} data-testid="quiver-signals">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" />
          Alt-data signals
          <span className="normal-case tracking-normal">· Quiver</span>
        </div>
        {score != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              scoreTone(score),
            )}
            title={scoreComponents.map((c) => `${c.label}: ${c.contribution >= 0 ? "+" : ""}${c.contribution} — ${c.detail}`).join("\n")}
            data-testid="quiver-score"
          >
            {Math.round(score)} · {scoreWord(score)}
          </span>
        )}
      </div>

      {!hasActivity ? (
        <div
          className="flex h-10 w-full items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground"
          data-testid="quiver-empty"
        >
          No congressional, insider, or contract activity in the last {data.windowDays} days.
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3">
          {congress && (congress.buys > 0 || congress.sells > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  Congressional trading
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {congress.buys} buys · {congress.sells} sells / {data.windowDays}d
                </span>
              </div>
              <ul className="space-y-1">
                {congress.recent.map((t, i) => (
                  <CongressTradeRow key={i} trade={t} />
                ))}
              </ul>
            </div>
          )}

          {insiders && (insiders.buys > 0 || insiders.sells > 0) && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                Insider activity
              </span>
              <span className="text-muted-foreground tabular-nums">
                {insiders.buys} buys ({fmtCompactMoney(insiders.boughtValue)}) ·{" "}
                {insiders.sells} sells ({fmtCompactMoney(insiders.soldValue)})
              </span>
            </div>
          )}

          {govContracts && govContracts.count > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Gov contracts
              </span>
              <span className="text-muted-foreground tabular-nums">
                {govContracts.count} awards · {fmtCompactMoney(govContracts.totalAmount)} / yr
              </span>
            </div>
          )}

          {lobbying && lobbying.count > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Lobbying
              </span>
              <span className="text-muted-foreground tabular-nums">
                {lobbying.count} filings · {fmtCompactMoney(lobbying.totalAmount)} / yr
              </span>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] leading-snug text-muted-foreground">
        Congressional trades are disclosed up to 45 days after the trade —
        treat these as confirmation, not real-time signals. The score is a
        transparent activity tilt (50 = neutral), not a return prediction.
      </p>
    </div>
  );
}

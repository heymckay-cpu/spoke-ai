import { AlertTriangle, Layers, Shapes } from "lucide-react";
import {
  describeOverlap,
  wouldExceedThreshold,
  type ConcentrationSettings,
  type PositionLike,
} from "@workspace/portfolio";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtCompactMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ConcentrationChipProps {
  ticker: string;
  strike: number;
  contracts: number;
  positions: readonly PositionLike[];
  settings: ConcentrationSettings;
}

/**
 * Renders up to three subtle chips next to a candidate row:
 *   - "+N open" when the ticker overlaps an open position
 *   - amber "Ticker XX%" when adding this trade would push the ticker over
 *     the configured per-ticker CAR threshold
 *   - lighter "Sector XX%" when sector exposure would cross its threshold
 *
 * Hovering / tapping any chip explains the overlap with dollar amounts.
 */
export function ConcentrationChip({
  ticker,
  strike,
  contracts,
  positions,
  settings,
}: ConcentrationChipProps) {
  const overlap = describeOverlap({ ticker, strike }, positions);
  const assessment = wouldExceedThreshold(
    { ticker, strike },
    contracts,
    settings,
    positions,
  );

  const hasOverlap = overlap.openInTicker > 0;
  if (!hasOverlap && !assessment.tickerExceeds && !assessment.sectorExceeds) {
    return null;
  }

  const tickerPct = (assessment.postTickerPct * 100).toFixed(0);
  const sectorPct = (assessment.postSectorPct * 100).toFixed(0);
  const limitTicker = (settings.tickerPct * 100).toFixed(0);
  const limitSector = (settings.sectorPct * 100).toFixed(0);

  return (
    <TooltipProvider delayDuration={120}>
      <span className="inline-flex flex-wrap items-center gap-1 align-middle">
        {hasOverlap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex cursor-help items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                data-testid={`chip-overlap-${ticker}`}
              >
                <Layers className="h-2.5 w-2.5" />+{overlap.openInTicker} open
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                You already have {overlap.openInTicker} open{" "}
                {overlap.openInTicker === 1 ? "position" : "positions"} on {ticker}{" "}
                ({fmtCompactMoney(overlap.tickerCar)} cash at risk).
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {assessment.tickerExceeds && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex cursor-help items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
                data-testid={`chip-ticker-overload-${ticker}`}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Ticker {tickerPct}%
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Adding {contracts} {contracts === 1 ? "contract" : "contracts"} would
                push {ticker} to {fmtCompactMoney(assessment.postTickerCar)} ({tickerPct}%
                of {fmtCompactMoney(assessment.postTotalCar)} total open cash at risk),
                above your {limitTicker}% per-ticker limit.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {assessment.sectorExceeds && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex cursor-help items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-medium text-amber-700/80 dark:text-amber-300/80"
                data-testid={`chip-sector-overload-${ticker}`}
              >
                <Shapes className="h-2.5 w-2.5" />
                {overlap.sector} {sectorPct}%
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {overlap.sector} would reach {fmtCompactMoney(assessment.postSectorCar)}{" "}
                ({sectorPct}% of total open cash at risk), above your {limitSector}%
                per-sector limit.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}

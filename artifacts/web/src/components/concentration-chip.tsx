import { AlertTriangle, Layers, Shapes } from "lucide-react";
import {
  describeOverlap,
  wouldExceedThreshold,
  type ConcentrationSettings,
  type PositionLike,
  type SectorMap,
} from "@workspace/portfolio";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtCompactMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type OverlapResult = ReturnType<typeof describeOverlap>;
type AssessmentResult = ReturnType<typeof wouldExceedThreshold>;

/**
 * Compute the chip's overlap + threshold assessment once. The candidate row
 * also needs these values (to color/explain the ticker), so callers can
 * compute once and feed both this chip and the row from the same result via
 * the optional `overlap` / `assessment` props.
 */
export function computeConcentration(
  ticker: string,
  strike: number,
  contracts: number,
  positions: readonly PositionLike[],
  settings: ConcentrationSettings,
  sectorMap?: SectorMap,
): { overlap: OverlapResult; assessment: AssessmentResult } {
  const overlap = describeOverlap({ ticker, strike }, positions, undefined, sectorMap);
  const assessment = wouldExceedThreshold(
    { ticker, strike },
    contracts,
    settings,
    positions,
    undefined,
    sectorMap,
  );
  return { overlap, assessment };
}

export interface ConcentrationChipProps {
  ticker: string;
  strike: number;
  contracts: number;
  positions: readonly PositionLike[];
  settings: ConcentrationSettings;
  /** Optional provider-resolved ticker→sector map. Falls back to the
   * static curated table when omitted or when a ticker is missing. */
  sectorMap?: SectorMap;
  /** Which subset of chips to render. Defaults to all of them on a single
   * wrapping line. Use "open" to render only the "+N open" pill, or
   * "thresholds" to render only the ticker / sector concentration warnings. */
  variant?: "all" | "open" | "thresholds";
  /** Optional precomputed overlap (avoids recomputing per chip variant). */
  overlap?: OverlapResult;
  /** Optional precomputed threshold assessment. */
  assessment?: AssessmentResult;
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
  sectorMap,
  variant = "all",
  overlap: overlapProp,
  assessment: assessmentProp,
}: ConcentrationChipProps) {
  const computed =
    overlapProp && assessmentProp
      ? { overlap: overlapProp, assessment: assessmentProp }
      : computeConcentration(ticker, strike, contracts, positions, settings, sectorMap);
  const overlap = computed.overlap;
  const assessment = computed.assessment;

  const hasOverlap = overlap.openInTicker > 0;
  if (!hasOverlap && !assessment.tickerExceeds && !assessment.sectorExceeds) {
    return null;
  }
  const showOpen = hasOverlap && variant !== "thresholds";
  const showThresholds = variant !== "open";
  if (!showOpen && !(showThresholds && (assessment.tickerExceeds || assessment.sectorExceeds))) {
    return null;
  }

  const tickerPct = (assessment.postTickerPct * 100).toFixed(0);
  const sectorPct = (assessment.postSectorPct * 100).toFixed(0);
  const limitTicker = (settings.tickerPct * 100).toFixed(0);
  const limitSector = (settings.sectorPct * 100).toFixed(0);

  return (
    <TooltipProvider delayDuration={120}>
      <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap align-middle">
        {showOpen && (
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
        {showThresholds && assessment.tickerExceeds && (
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
        {showThresholds && assessment.sectorExceeds && (
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

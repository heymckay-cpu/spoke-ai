import { cn } from "@/lib/utils";

interface Props {
  rank?: number | null;
  basis?: "real" | "provisional";
  className?: string;
}

export function IvRankPill({ rank, basis, className }: Props) {
  const isProvisional = basis === "provisional";
  if (rank == null || Number.isNaN(rank)) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
          "bg-muted text-muted-foreground",
          className,
        )}
        title={
          isProvisional
            ? "Not enough IV history yet — collecting daily snapshots."
            : undefined
        }
        data-testid="pill-iv-rank-empty"
      >
        —
      </span>
    );
  }

  const pct = Math.max(0, Math.min(1, rank));
  let bg = "";
  let fg = "";
  if (pct < 0.33) {
    bg = "bg-emerald-500/15";
    fg = "text-emerald-600 dark:text-emerald-400";
  } else if (pct < 0.66) {
    bg = "bg-amber-500/15";
    fg = "text-amber-600 dark:text-amber-400";
  } else {
    bg = "bg-rose-500/15";
    fg = "text-rose-600 dark:text-rose-400";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
        bg,
        fg,
        className,
      )}
      title={
        isProvisional
          ? "IV Rank (provisional) — derived from realized vol while we accumulate 20+ daily IV snapshots."
          : "IV Rank — current IV's percentile within the trailing 52-week ATM-IV history."
      }
      data-testid={isProvisional ? "pill-iv-rank-provisional" : "pill-iv-rank"}
    >
      {Math.round(pct * 100)}
      {isProvisional && <span className="opacity-60">*</span>}
    </span>
  );
}

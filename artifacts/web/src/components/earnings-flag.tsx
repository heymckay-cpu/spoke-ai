import { CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  earningsDate?: string | null;
  inWindow: boolean;
  className?: string;
}

function daysUntil(iso: string): number | null {
  const ms = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - Date.now()) / (24 * 60 * 60 * 1000));
}

export function EarningsFlag({ earningsDate, inWindow, className }: Props) {
  if (!inWindow) return null;
  const days = earningsDate ? daysUntil(earningsDate) : null;
  let tooltip: string;
  if (earningsDate) {
    const tail =
      days == null
        ? ""
        : days === 0
          ? " (today)"
          : days === 1
            ? " (tomorrow)"
            : days > 0
              ? ` (in ${days} days)`
              : ` (${Math.abs(days)} days ago)`;
    tooltip = `Earnings ${fmtDate(earningsDate)}${tail}`;
  } else {
    tooltip = "Earnings in window";
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full",
            "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            className,
          )}
          data-testid="icon-earnings-warning"
        >
          <CalendarClock className="h-3 w-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

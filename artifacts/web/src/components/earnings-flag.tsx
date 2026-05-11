import { CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  earningsDate?: string | null;
  inWindow: boolean;
  className?: string;
}

export function EarningsFlag({ earningsDate, inWindow, className }: Props) {
  if (!inWindow) return null;
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
      <TooltipContent side="top">
        Earnings {earningsDate ? fmtDate(earningsDate) : "in window"}
      </TooltipContent>
    </Tooltip>
  );
}

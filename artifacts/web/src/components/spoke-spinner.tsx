import { cn } from "@/lib/utils";
import spokeWheel from "@/assets/spoke-wheel.png";

export interface SpokeSpinnerProps {
  className?: string;
  label?: string;
  size?: number;
}

export function SpokeSpinner({
  className,
  label = "Loading",
  size = 14,
}: SpokeSpinnerProps) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center justify-center", className)}
      data-testid="roll-live-quote-spinner"
    >
      <img
        src={spokeWheel}
        alt=""
        draggable={false}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="animate-spin select-none motion-reduce:animate-[spin_3s_linear_infinite] dark:brightness-150"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

import {
  getHealthCheckQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface StalenessDotProps {
  label?: string;
  className?: string;
}

export function StalenessDot({ label, className }: StalenessDotProps) {
  const health = useHealthCheck({
    query: {
      staleTime: 30_000,
      refetchInterval: 60_000,
      queryKey: getHealthCheckQueryKey(),
    },
  });
  const provider = health.data?.provider;
  const live = health.data?.live;
  if (live !== false) return null;
  const title = `${label ?? "This number"} is from ${provider ?? "the active provider"}, which serves delayed quotes.`;
  return (
    <span
      className={cn(
        "ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 align-middle",
        className,
      )}
      title={title}
      aria-label={title}
      data-testid="dot-staleness"
    />
  );
}

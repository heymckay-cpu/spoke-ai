import { useQueryClient } from "@tanstack/react-query";
import {
  useRunScan,
  getGetLatestScanQueryKey,
  getGetScanSummaryQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  forceRefresh?: boolean;
  className?: string;
  label?: string;
}

export function RunScanButton({
  variant = "default",
  size = "sm",
  forceRefresh = true,
  className,
  label = "Run Scan",
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const runScan = useRunScan({
    mutation: {
      onSuccess: (result) => {
        qc.setQueryData(getGetLatestScanQueryKey(), result);
        qc.invalidateQueries({ queryKey: getGetLatestScanQueryKey() });
        qc.invalidateQueries({ queryKey: getGetScanSummaryQueryKey() });
        toast({
          title: result.cached ? "Loaded cached scan" : "Scan complete",
          description: `${result.candidates.length} candidate${result.candidates.length === 1 ? "" : "s"} from ${result.tickersScanned} tickers`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({
          variant: "destructive",
          title: "Scan failed",
          description: message,
        });
      },
    },
  });

  return (
    <Button
      variant={variant}
      size={size}
      disabled={runScan.isPending}
      onClick={() => runScan.mutate({ data: { forceRefresh } })}
      className={cn("gap-2", className)}
      data-testid="button-run-scan"
    >
      <RefreshCw className={cn("h-4 w-4", runScan.isPending && "animate-spin")} />
      {runScan.isPending ? "Scanning…" : label}
    </Button>
  );
}

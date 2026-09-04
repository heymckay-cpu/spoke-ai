import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallAwayPosition,
  getListPositionsQueryKey,
  getListHoldingsQueryKey,
  getGetPositionsStatsQueryKey,
} from "@workspace/api-client-react";
import type { Position } from "@workspace/api-client-react";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney } from "@/lib/format";

interface Props {
  position: Position;
  onCalledAway?: () => void;
}

/**
 * Wheel transition: shares → cash. Confirms, then closes the covered call
 * with outcome "called_away" and sells 100 × contracts shares out of the
 * linked holding at the strike.
 */
export function CalledAwayDialog({ position, onCalledAway }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const callAway = useCallAwayPosition();

  const shares = position.contracts * 100;

  const onConfirm = () => {
    callAway.mutate(
      { id: position.id },
      {
        onSuccess: (result) => {
          toast({
            title: "Called away recorded",
            description: `Sold ${result.sharesSold} ${position.ticker} at ${fmtMoney(position.strike)} — stock P/L ${fmtMoney(result.stockPnl)}${result.holding ? `, ${result.holding.shares} shares remain` : ", no shares remain"}`,
          });
          setOpen(false);
          void queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListHoldingsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetPositionsStatsQueryKey() });
          onCalledAway?.();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ variant: "destructive", title: "Failed to record called-away", description: message });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={`button-called-away-position-${position.id}`}
        >
          <PackageOpen className="mr-1 h-3.5 w-3.5" />
          Called away
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Record called away — {position.ticker} {fmtMoney(position.strike)}C{" "}
            {position.expiry}
          </DialogTitle>
          <DialogDescription>
            This closes the covered call (you keep the full{" "}
            {fmtMoney(position.premium)}/share premium) and sells {shares}{" "}
            shares of {position.ticker} out of the linked holding at{" "}
            {fmtMoney(position.strike)}. The realized stock P/L is computed
            against the holding's cost basis — one full turn of the wheel.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={callAway.isPending}
            data-testid="button-confirm-called-away"
          >
            {callAway.isPending ? "Recording…" : "Record called away"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

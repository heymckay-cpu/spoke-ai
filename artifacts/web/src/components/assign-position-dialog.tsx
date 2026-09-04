import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAssignPosition,
  getListPositionsQueryKey,
  getListHoldingsQueryKey,
  getGetPositionsStatsQueryKey,
} from "@workspace/api-client-react";
import type { Position } from "@workspace/api-client-react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onAssigned?: () => void;
}

/**
 * Wheel transition: cash-secured put → shares. Confirms, then closes the put
 * with outcome "assigned" and creates a holding at the chain-aware net cost
 * basis (strike − all net premium/share collected across the roll chain).
 */
export function AssignPositionDialog({ position, onAssigned }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const assign = useAssignPosition();

  const shares = position.contracts * 100;

  const onConfirm = () => {
    assign.mutate(
      { id: position.id, data: { notes: notes.trim() || null } },
      {
        onSuccess: (result) => {
          toast({
            title: "Assignment recorded",
            description: `${shares} shares of ${position.ticker} added to holdings at ${fmtMoney(result.costBasisPerShare)}/share net cost basis`,
          });
          setOpen(false);
          setNotes("");
          void queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListHoldingsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetPositionsStatsQueryKey() });
          onAssigned?.();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ variant: "destructive", title: "Failed to record assignment", description: message });
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
          data-testid={`button-assign-position-${position.id}`}
        >
          <PackageCheck className="mr-1 h-3.5 w-3.5" />
          Assigned
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Record assignment — {position.ticker} {fmtMoney(position.strike)}P{" "}
            {position.expiry}
          </DialogTitle>
          <DialogDescription>
            This closes the put (you keep the full {fmtMoney(position.premium)}
            /share premium) and adds {shares} shares of {position.ticker} to
            your holdings at strike minus all net premium collected across the
            roll chain — the wheel's true cost basis. The screener will then
            recommend covered calls against those shares.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Optional note (e.g. broker confirmation #)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="input-assign-notes"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={assign.isPending}
            data-testid="button-confirm-assign"
          >
            {assign.isPending ? "Recording…" : "Record assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import {
  getGetRollSuggestionQueryKey,
  useGetRollSuggestion,
  useRollPosition,
  type Position,
} from "@workspace/api-client-react";
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

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface RollPositionDialogProps {
  position: Position;
  onRolled: () => void;
}

export function RollPositionDialog({ position, onRolled }: RollPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [closePrice, setClosePrice] = useState<string>("");
  const [newExpiry, setNewExpiry] = useState<string>("");
  const [newStrike, setNewStrike] = useState<string>("");
  const [newPremium, setNewPremium] = useState<string>("");
  const [newContracts, setNewContracts] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // Tracks whether the user has manually edited the new-leg fields after the
  // dialog opened. We only auto-apply the smart suggestion when nothing has
  // been touched yet, so we never clobber a user's deliberate choice once it
  // arrives.
  const [touched, setTouched] = useState(false);
  const { toast } = useToast();
  const roll = useRollPosition();
  const suggestion = useGetRollSuggestion(position.id, {
    query: {
      enabled: open,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      queryKey: getGetRollSuggestionQueryKey(position.id),
    },
  });

  useEffect(() => {
    if (open) {
      setClosePrice(
        position.currentBid != null ? position.currentBid.toFixed(2) : "0",
      );
      setNewExpiry(addDaysIso(position.expiry, 30));
      setNewStrike(String(position.strike));
      setNewPremium(position.premium.toFixed(2));
      setNewContracts(String(position.contracts));
      setSubmitting(false);
      setTouched(false);
    }
  }, [open, position]);

  // Auto-apply the suggestion's expiry + same-strike premium when it arrives,
  // but only if the user hasn't started editing yet.
  useEffect(() => {
    if (!open || touched || !suggestion.data) return;
    const sug = suggestion.data;
    const same = sug.options.find((o) => o.kind === "same") ?? sug.options[0];
    setNewExpiry(sug.suggestedExpiry);
    if (same) {
      setNewStrike(String(same.strike));
      if (same.premium > 0) setNewPremium(same.premium.toFixed(2));
    }
  }, [open, touched, suggestion.data]);

  const applyOption = (kind: "same" | "down5") => {
    const sug = suggestion.data;
    if (!sug) return;
    const opt = sug.options.find((o) => o.kind === kind);
    if (!opt) return;
    setNewExpiry(sug.suggestedExpiry);
    setNewStrike(String(opt.strike));
    if (opt.premium > 0) setNewPremium(opt.premium.toFixed(2));
    setTouched(true);
  };

  const markTouched = () => setTouched(true);

  const closeNum = Number(closePrice);
  const strikeNum = Number(newStrike);
  const premiumNum = Number(newPremium);
  const contractsNum = Number(newContracts);

  const realizedPreview =
    Number.isFinite(closeNum)
      ? (position.premium - closeNum) * 100 * position.contracts
      : null;

  const validExpiry = /^\d{4}-\d{2}-\d{2}$/.test(newExpiry);

  const valid =
    Number.isFinite(closeNum) &&
    closeNum >= 0 &&
    Number.isFinite(strikeNum) &&
    strikeNum > 0 &&
    Number.isFinite(premiumNum) &&
    premiumNum >= 0 &&
    Number.isInteger(contractsNum) &&
    contractsNum >= 1 &&
    validExpiry;

  const onSubmit = async () => {
    if (!valid) {
      toast({ variant: "destructive", title: "Check the roll details" });
      return;
    }
    setSubmitting(true);
    try {
      // Single atomic server call — close + open happen inside one DB
      // transaction, so a network drop can never leave us half-rolled.
      await roll.mutateAsync({
        id: position.id,
        data: {
          closePrice: closeNum,
          strike: strikeNum,
          expiry: newExpiry,
          premium: premiumNum,
          contracts: contractsNum,
        },
      });

      toast({
        title: "Position rolled",
        description: `${position.ticker} ${fmtMoney(position.strike)}P ${position.expiry} → ${fmtMoney(strikeNum)}P ${newExpiry}`,
      });
      setOpen(false);
      onRolled();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to roll position",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={`button-roll-position-${position.id}`}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Roll
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Roll {position.ticker} {fmtMoney(position.strike)}P
          </DialogTitle>
          <DialogDescription>
            Close the current contract and open a new one with a later expiry.
            Both happen together in a single server transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Close existing
            </div>
            <div className="text-xs text-muted-foreground">
              {position.ticker} {fmtMoney(position.strike)}P {position.expiry} ·{" "}
              {position.contracts} contract{position.contracts === 1 ? "" : "s"} ·{" "}
              premium received {fmtMoney(position.premium)}/sh
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Buy-to-close ($/share)
              </label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={closePrice}
                onChange={(e) => setClosePrice(e.target.value)}
                className="tabular-nums"
                data-testid="input-roll-close-price"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Realized on close:{" "}
              <span
                className={
                  realizedPreview != null && realizedPreview >= 0
                    ? "font-medium tabular-nums text-emerald-500"
                    : "font-medium tabular-nums text-rose-500"
                }
              >
                {realizedPreview != null
                  ? `${realizedPreview >= 0 ? "+" : ""}${fmtMoney(realizedPreview)}`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Open new
              </div>
              {suggestion.isLoading ? (
                <div className="text-[11px] text-muted-foreground">
                  Loading suggestion…
                </div>
              ) : suggestion.data ? (
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  Next monthly: {suggestion.data.suggestedExpiry} ·{" "}
                  {suggestion.data.dteFromCurrent}d added
                </div>
              ) : null}
            </div>
            {suggestion.data && suggestion.data.options.length > 0 ? (
              <div
                className="flex flex-wrap gap-2"
                data-testid="roll-suggestion-quickpicks"
              >
                {suggestion.data.options.map((opt) => (
                  <Button
                    key={opt.kind}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyOption(opt.kind)}
                    className="h-auto gap-1.5 px-2.5 py-1.5 text-xs"
                    data-testid={`button-roll-suggestion-${opt.kind}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span className="font-medium">
                      {opt.kind === "same" ? "Same strike" : "−5% strike"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMoney(opt.strike)}P ·{" "}
                      {opt.premium > 0 ? fmtMoney(opt.premium) : "no quote"}
                    </span>
                  </Button>
                ))}
              </div>
            ) : suggestion.error ? (
              <div className="text-[11px] text-muted-foreground">
                Couldn't load a live suggestion — fill in the new leg manually.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  New expiry
                </label>
                <Input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => {
                    setNewExpiry(e.target.value);
                    markTouched();
                  }}
                  className="tabular-nums"
                  data-testid="input-roll-expiry"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Contracts
                </label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={newContracts}
                  onChange={(e) => {
                    setNewContracts(e.target.value);
                    markTouched();
                  }}
                  className="tabular-nums"
                  data-testid="input-roll-contracts"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  New strike ($)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={newStrike}
                  onChange={(e) => {
                    setNewStrike(e.target.value);
                    markTouched();
                  }}
                  className="tabular-nums"
                  data-testid="input-roll-strike"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  New premium ($/sh)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPremium}
                  onChange={(e) => {
                    setNewPremium(e.target.value);
                    markTouched();
                  }}
                  className="tabular-nums"
                  data-testid="input-roll-premium"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || !valid}
            data-testid="button-confirm-roll"
          >
            {submitting ? "Rolling…" : "Confirm roll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

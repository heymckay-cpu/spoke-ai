import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getGetRollQuoteQueryKey,
  getGetRollSuggestionQueryKey,
  useGetRollQuote,
  useGetRollSuggestion,
  useRollPosition,
  useUndoRoll,
  type Position,
  type RollQuote,
} from "@workspace/api-client-react";
import { ToastAction } from "@/components/ui/toast";
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
import { cn } from "@/lib/utils";

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
  const undoRoll = useUndoRoll();
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

  // Debounce the strike+expiry the user is editing so we don't hammer the
  // chain endpoint on every keystroke. 300ms feels responsive but also
  // collapses the noisy intermediate values when typing "150" or scrolling
  // the date picker.
  const [debouncedExpiry, setDebouncedExpiry] = useState(newExpiry);
  const [debouncedStrike, setDebouncedStrike] = useState(newStrike);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedExpiry(newExpiry), 300);
    return () => clearTimeout(t);
  }, [newExpiry]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedStrike(newStrike), 300);
    return () => clearTimeout(t);
  }, [newStrike]);

  const debouncedStrikeNum = Number(debouncedStrike);
  const debouncedExpiryValid = /^\d{4}-\d{2}-\d{2}$/.test(debouncedExpiry);
  const debouncedStrikeValid =
    Number.isFinite(debouncedStrikeNum) && debouncedStrikeNum > 0;
  const liveQuoteEnabled =
    open && debouncedExpiryValid && debouncedStrikeValid;
  const previousQuoteRef = useRef<RollQuote | undefined>(undefined);
  const liveQuote = useGetRollQuote(
    position.id,
    liveQuoteEnabled ? debouncedExpiry : "",
    liveQuoteEnabled ? debouncedStrikeNum : 0,
    {
      query: {
        enabled: liveQuoteEnabled,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: false,
        queryKey: getGetRollQuoteQueryKey(
          position.id,
          liveQuoteEnabled ? debouncedExpiry : "",
          liveQuoteEnabled ? debouncedStrikeNum : 0,
        ),
      },
    },
  );

  // Track the last successfully loaded quote so refetches can keep showing
  // the prior numbers (dimmed) instead of flashing to empty.
  useEffect(() => {
    if (liveQuote.data) {
      previousQuoteRef.current = liveQuote.data;
    }
  }, [liveQuote.data]);
  useEffect(() => {
    if (!open) {
      previousQuoteRef.current = undefined;
    }
  }, [open]);
  const displayedQuote = liveQuote.data ?? previousQuoteRef.current;
  const showSkeleton = liveQuote.isFetching && !displayedQuote;
  const showStaleQuote = liveQuote.isFetching && !!displayedQuote;

  // Net credit and breakeven update from whatever the user has currently
  // entered (not the debounced values) so the math feels reactive even while
  // the live quote is mid-flight.
  const previews = useMemo(() => {
    const contractsValid =
      Number.isInteger(contractsNum) && contractsNum >= 1;
    const netCredit =
      Number.isFinite(premiumNum) && Number.isFinite(closeNum) && contractsValid
        ? (premiumNum - closeNum) * 100 * contractsNum
        : null;
    const breakeven =
      Number.isFinite(strikeNum) && Number.isFinite(premiumNum) && Number.isFinite(closeNum)
        ? strikeNum - (premiumNum - closeNum)
        : null;
    // Annualized yield on collateral for the new leg:
    //   (newPremium / newStrike) * (365 / DTE)
    // DTE is measured from today (UTC midnight) to the new expiry, so the
    // value updates whenever strike, premium, or expiry change.
    let annualizedYield: number | null = null;
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(newExpiry) &&
      Number.isFinite(strikeNum) &&
      strikeNum > 0 &&
      Number.isFinite(premiumNum) &&
      premiumNum >= 0
    ) {
      const expiryDate = new Date(`${newExpiry}T00:00:00Z`);
      const now = new Date();
      const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const dte = Math.round(
        (expiryDate.getTime() - today) / (1000 * 60 * 60 * 24),
      );
      if (dte > 0) {
        annualizedYield = (premiumNum / strikeNum) * (365 / dte);
      }
    }
    return { netCredit, breakeven, annualizedYield };
  }, [premiumNum, closeNum, contractsNum, strikeNum, newExpiry]);

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
      const result = await roll.mutateAsync({
        id: position.id,
        data: {
          closePrice: closeNum,
          strike: strikeNum,
          expiry: newExpiry,
          premium: premiumNum,
          contracts: contractsNum,
        },
      });

      const closedId = result.closed.id;
      const openedId = result.opened.id;
      const description = `${position.ticker} ${fmtMoney(position.strike)}P ${position.expiry} → ${fmtMoney(strikeNum)}P ${newExpiry}`;
      const { dismiss } = toast({
        title: "Position rolled",
        description,
        // Auto-dismiss after ~10s so the undo affordance doesn't linger.
        duration: 10_000,
        action: (
          <ToastAction
            altText="Undo roll"
            data-testid="button-undo-roll"
            onClick={async () => {
              dismiss();
              try {
                await undoRoll.mutateAsync({
                  data: { closedId, openedId },
                });
                toast({
                  title: "Roll undone",
                  description,
                  duration: 5_000,
                });
                onRolled();
              } catch (err) {
                toast({
                  variant: "destructive",
                  title: "Couldn't undo roll",
                  description:
                    err instanceof Error ? err.message : "Unknown error",
                });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
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
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <SpokeSpinner size={12} label="Loading suggestion" />
                  <span aria-hidden="true">Loading suggestion…</span>
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

            <div
              className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs"
              data-testid="roll-live-quote"
            >
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="font-medium uppercase tracking-wider text-[10px]">
                  Live quote
                </span>
                <div className="flex items-center gap-2">
                  {displayedQuote ? (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums transition-opacity",
                        showStaleQuote && "opacity-60",
                      )}
                      data-testid="roll-live-quote-meta"
                    >
                      {displayedQuote.expiry} · {fmtMoney(displayedQuote.strike)}P
                      {displayedQuote.requestedStrike != null &&
                      Math.abs(displayedQuote.strike - displayedQuote.requestedStrike) > 0.0001
                        ? ` (snapped from ${fmtMoney(displayedQuote.requestedStrike)})`
                        : ""}
                    </span>
                  ) : null}
                  {liveQuote.isFetching ? (
                    <SpokeSpinner size={12} label="Refreshing live quote" />
                  ) : null}
                </div>
              </div>
              {showSkeleton ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {["bid", "mid", "last"].map((cell) => (
                    <Skeleton
                      key={cell}
                      data-testid="roll-live-quote-skeleton"
                      className="h-4 w-16"
                    />
                  ))}
                </div>
              ) : displayedQuote ? (
                <div
                  className={cn(
                    "flex flex-wrap gap-x-4 gap-y-1 tabular-nums transition-opacity",
                    showStaleQuote && "opacity-60",
                  )}
                >
                  <span>
                    <span className="text-muted-foreground">Bid </span>
                    <span data-testid="roll-live-quote-bid">
                      {displayedQuote.bid > 0 ? fmtMoney(displayedQuote.bid) : "—"}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Mid </span>
                    <span data-testid="roll-live-quote-mid">
                      {displayedQuote.mid > 0 ? fmtMoney(displayedQuote.mid) : "—"}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Last </span>
                    <span data-testid="roll-live-quote-last">
                      {displayedQuote.lastPrice > 0
                        ? fmtMoney(displayedQuote.lastPrice)
                        : "—"}
                    </span>
                  </span>
                  {!showStaleQuote &&
                  liveQuote.data &&
                  liveQuote.data.premium > 0 &&
                  Math.abs(liveQuote.data.premium - premiumNum) > 0.0001 ? (
                    <button
                      type="button"
                      className="ml-auto text-[10px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setNewPremium(liveQuote.data!.premium.toFixed(2));
                        if (
                          Math.abs(
                            liveQuote.data!.strike - (Number(newStrike) || 0),
                          ) > 0.0001
                        ) {
                          setNewStrike(String(liveQuote.data!.strike));
                        }
                        markTouched();
                      }}
                      data-testid="button-apply-live-quote"
                    >
                      Use {fmtMoney(liveQuote.data.premium)}
                    </button>
                  ) : null}
                </div>
              ) : liveQuote.error ? (
                <div className="text-muted-foreground">
                  No quote available for that strike+expiry.
                </div>
              ) : !liveQuoteEnabled ? (
                <div className="text-muted-foreground">
                  Enter a strike and expiry to see a live quote.
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <SpokeSpinner size={12} label="Loading live quote" />
                  <span aria-hidden="true">Loading…</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-1 tabular-nums">
                <span>
                  <span className="text-muted-foreground">Net credit </span>
                  <span
                    className={
                      previews.netCredit != null && previews.netCredit >= 0
                        ? "font-medium text-emerald-500"
                        : "font-medium text-rose-500"
                    }
                    data-testid="roll-net-credit"
                  >
                    {previews.netCredit != null
                      ? `${previews.netCredit >= 0 ? "+" : ""}${fmtMoney(previews.netCredit)}`
                      : "—"}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Breakeven </span>
                  <span className="font-medium" data-testid="roll-breakeven">
                    {previews.breakeven != null
                      ? fmtMoney(previews.breakeven)
                      : "—"}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Annualized yield </span>
                  <span
                    className="font-medium"
                    data-testid="roll-annualized-yield"
                  >
                    {previews.annualizedYield != null
                      ? `${(previews.annualizedYield * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </span>
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
            {submitting ? (
              <span className="inline-flex items-center gap-1.5">
                <SpokeSpinner size={12} label="Rolling position" />
                <span aria-hidden="true">Rolling…</span>
              </span>
            ) : (
              "Confirm roll"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

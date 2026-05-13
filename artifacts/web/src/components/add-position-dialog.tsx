import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Plus } from "lucide-react";
import {
  useCreatePosition,
  useGetSettings,
  useListPositions,
  getGetSettingsQueryKey,
  getListPositionsQueryKey,
} from "@workspace/api-client-react";
import { DEFAULT_CONCENTRATION, wouldExceedThreshold } from "@workspace/portfolio";
import { useSectorMap } from "@/hooks/use-sector-map";
import { fmtCompactMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpokeSpinner } from "@/components/spoke-spinner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

const PositionFormSchema = z.object({
  ticker: z.string().min(1, "Ticker required"),
  strike: z.number().positive("Strike must be > 0"),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  premium: z.number().min(0, "Premium must be ≥ 0"),
  contracts: z.number().int().min(1, "At least 1 contract"),
});

type FormValues = z.infer<typeof PositionFormSchema>;

export interface AddPositionInitialValues {
  ticker?: string;
  strike?: number;
  expiry?: string;
  premium?: number;
  contracts?: number;
}

export interface AddPositionDialogProps {
  defaultExpiry: string;
  onCreated?: () => void;
  initialValues?: AddPositionInitialValues;
  trigger?: ReactNode;
}

export function AddPositionDialog({
  defaultExpiry,
  onCreated,
  initialValues,
  trigger,
}: AddPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const create = useCreatePosition();
  const positionsQuery = useListPositions({
    query: { queryKey: getListPositionsQueryKey(), enabled: open },
  });
  const settingsQuery = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), enabled: open },
  });

  const buildDefaults = (): FormValues => ({
    ticker: initialValues?.ticker ?? "",
    strike: initialValues?.strike ?? 0,
    expiry: initialValues?.expiry ?? defaultExpiry,
    premium: initialValues?.premium ?? 0,
    contracts: initialValues?.contracts ?? 1,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(PositionFormSchema),
    defaultValues: buildDefaults(),
  });

  // When the dialog opens, reset the form to current initial values so the
  // prefilled candidate row data is reflected.
  useEffect(() => {
    if (open) {
      form.reset(buildDefaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const watchTicker = form.watch("ticker");
  const watchStrike = form.watch("strike");
  const watchContracts = form.watch("contracts");

  const positionsList = positionsQuery.data?.positions ?? [];
  const watchTickerNorm = (watchTicker ?? "").trim().toUpperCase();
  const sectorTickers = useMemo(() => {
    const all = positionsList.map((p) => p.ticker);
    if (watchTickerNorm) all.push(watchTickerNorm);
    return all;
  }, [positionsList, watchTickerNorm]);
  const sectorMap = useSectorMap(sectorTickers);

  const banner = useMemo(() => {
    const positions = positionsList;
    const concentration = settingsQuery.data?.concentration ?? DEFAULT_CONCENTRATION;
    const ticker = watchTickerNorm;
    const strike = Number(watchStrike) || 0;
    const contracts = Math.max(1, Math.floor(Number(watchContracts) || 0));
    if (!ticker || strike <= 0) return null;
    const a = wouldExceedThreshold(
      { ticker, strike },
      contracts,
      concentration,
      positions,
      undefined,
      sectorMap,
    );
    if (a.level === "ok") return null;
    return { assessment: a, ticker, contracts, settings: concentration };
  }, [
    positionsList,
    settingsQuery.data,
    watchTickerNorm,
    watchStrike,
    watchContracts,
    sectorMap,
  ]);

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        data: {
          ticker: values.ticker.toUpperCase(),
          strike: values.strike,
          expiry: values.expiry,
          premium: values.premium,
          contracts: values.contracts,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Position logged",
            description: `${values.ticker.toUpperCase()} ${values.strike}P ${values.expiry}`,
          });
          form.reset(buildDefaults());
          setOpen(false);
          onCreated?.();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ variant: "destructive", title: "Failed to log position", description: message });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-testid="button-add-position">
            <Plus className="mr-1 h-4 w-4" /> Log position
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a sold put</DialogTitle>
          <DialogDescription>
            Track a put you've already sold. Live P/L is computed from the current bid.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-add-position"
          >
            {banner && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
                data-testid="banner-concentration-warning"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Heads up — concentration risk</p>
                  {banner.assessment.tickerExceeds && (
                    <p>
                      After this trade, {banner.ticker} would account for{" "}
                      <span className="font-semibold tabular-nums">
                        {(banner.assessment.postTickerPct * 100).toFixed(0)}%
                      </span>{" "}
                      ({fmtCompactMoney(banner.assessment.postTickerCar)}) of your{" "}
                      {fmtCompactMoney(banner.assessment.postTotalCar)} total open
                      cash at risk — above your{" "}
                      {(banner.settings.tickerPct * 100).toFixed(0)}% per-ticker limit.
                    </p>
                  )}
                  {banner.assessment.sectorExceeds && (
                    <p>
                      Its sector would reach{" "}
                      <span className="font-semibold tabular-nums">
                        {(banner.assessment.postSectorPct * 100).toFixed(0)}%
                      </span>{" "}
                      ({fmtCompactMoney(banner.assessment.postSectorCar)}), above
                      your {(banner.settings.sectorPct * 100).toFixed(0)}% per-sector
                      limit.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="ticker"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticker</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="AAPL"
                        autoCapitalize="characters"
                        className="uppercase"
                        data-testid="input-position-ticker"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contracts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contracts</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-contracts"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="strike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strike ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-strike"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="premium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Premium / share ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-premium"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Expiration</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        className="tabular-nums"
                        data-testid="input-position-expiry"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-position"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="button-save-position"
              >
                {create.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <SpokeSpinner size={12} label="Saving position" />
                    <span aria-hidden="true">Saving…</span>
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

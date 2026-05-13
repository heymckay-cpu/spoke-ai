import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getGetLatestScanQueryKey,
  getGetScanSummaryQueryKey,
  getGetSettingsQueryKey,
  useGetSettings,
  useRunScan,
  useUpdateSettings,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SpokeSpinner } from "@/components/spoke-spinner";
import { Slider } from "@/components/ui/slider";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SettingsSchema = z
  .object({
    tickers: z.array(z.string().min(1)).min(1, "Add at least one ticker"),
    minDte: z.number().int().min(1).max(365),
    maxDte: z.number().int().min(1).max(365),
    targetDelta: z.number().min(0).max(1),
    minDelta: z.number().min(0).max(1),
    maxDelta: z.number().min(0).max(1),
    minOpenInterest: z.number().int().min(0),
    minBid: z.number().min(0),
    minUnderlyingPrice: z.number().min(0),
    riskFreeRate: z.number().min(0).max(1),
    topN: z.number().int().min(1).max(200),
    cacheTtlMinutes: z.number().int().min(1).max(1440),
    concentration: z.object({
      tickerPct: z.number().min(0).max(1),
      sectorPct: z.number().min(0).max(1),
    }),
    earningsInWindow: z.enum(["hide", "only", "include"]),
  })
  .superRefine((v, ctx) => {
    if (v.minDte > v.maxDte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDte"],
        message: "Max DTE must be ≥ Min DTE",
      });
    }
    if (v.minDelta > v.maxDelta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDelta"],
        message: "Max Δ must be ≥ Min Δ",
      });
    }
    if (v.targetDelta < v.minDelta || v.targetDelta > v.maxDelta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDelta"],
        message: "Target Δ must be within [Min Δ, Max Δ]",
      });
    }
  });

type FormValues = z.infer<typeof SettingsSchema>;

const DEFAULTS: FormValues = {
  tickers: [],
  minDte: 7,
  maxDte: 45,
  targetDelta: 0.3,
  minDelta: 0.15,
  maxDelta: 0.4,
  minOpenInterest: 100,
  minBid: 0.1,
  minUnderlyingPrice: 10,
  riskFreeRate: 0.045,
  topN: 50,
  cacheTtlMinutes: 60,
  concentration: {
    tickerPct: 0.15,
    sectorPct: 0.30,
  },
  earningsInWindow: "hide",
};

interface ChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
}

function ChipInput({ value, onChange }: ChipInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tokens = draft
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tokens.length === 0) return;
    const next = Array.from(new Set([...value, ...tokens]));
    onChange(next);
    setDraft("");
  };

  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
      )}
      data-testid="input-tickers"
    >
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground"
        >
          {t}
          <button
            type="button"
            onClick={() => remove(t)}
            className="rounded hover:text-foreground"
            aria-label={`Remove ${t}`}
            data-testid={`button-remove-ticker-${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={value.length === 0 ? "AAPL, MSFT, NVDA…" : ""}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground tabular-nums"
      />
    </div>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();

  const initial: FormValues = useMemo(
    () => ({ ...DEFAULTS, ...(settings ?? {}) }),
    [settings],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    if (settings) form.reset({ ...DEFAULTS, ...settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const rescan = useRunScan({
    mutation: {
      onSuccess: (result) => {
        qc.setQueryData(getGetLatestScanQueryKey(), result);
        qc.invalidateQueries({ queryKey: getGetLatestScanQueryKey() });
        qc.invalidateQueries({ queryKey: getGetScanSummaryQueryKey() });
      },
    },
  });

  const update = useUpdateSettings({
    mutation: {
      onSuccess: (saved) => {
        qc.setQueryData(getGetSettingsQueryKey(), saved);
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetLatestScanQueryKey() });
        toast({
          title: "Settings saved",
          description: "Re-running the screener with your new parameters…",
        });
        // Settings → scan: kick a fresh scan so the dashboard reflects the
        // new parameters immediately. Server-side has already invalidated
        // its caches.
        rescan.mutate({ data: { forceRefresh: true } });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ variant: "destructive", title: "Failed to save", description: message });
      },
    },
  });

  const onSubmit = (values: FormValues) => {
    update.mutate({ data: values });
  };

  return (
    <AppShell title="Settings" breadcrumbs={[{ label: "Settings" }]}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              data-testid="form-settings"
            >
              {/* Watchlist */}
              <Card className="border-card-border">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Watchlist</h3>
                    <p className="text-xs text-muted-foreground">
                      Tickers the screener will scan on each run.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="tickers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tickers</FormLabel>
                        <FormControl>
                          <ChipInput value={field.value ?? []} onChange={field.onChange} />
                        </FormControl>
                        <FormDescription>
                          Press Enter, comma, or space to add. Backspace removes the last chip.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Time window */}
              <Card className="border-card-border">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Expiration window</h3>
                    <p className="text-xs text-muted-foreground">
                      Days to expiration to consider when ranking puts.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="minDte"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min DTE</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-min-dte"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxDte"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max DTE</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-max-dte"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Delta sliders */}
              <Card className="border-card-border">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Delta targeting</h3>
                    <p className="text-xs text-muted-foreground">
                      Tune the |Δ| range to balance assignment risk versus premium.
                    </p>
                  </div>
                  {(
                    [
                      { name: "targetDelta", label: "Target Δ" },
                      { name: "minDelta", label: "Min Δ" },
                      { name: "maxDelta", label: "Max Δ" },
                    ] as const
                  ).map((cfg) => (
                    <FormField
                      key={cfg.name}
                      control={form.control}
                      name={cfg.name}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>{cfg.label}</FormLabel>
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {(field.value ?? 0).toFixed(2)}
                            </span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0}
                              max={1}
                              step={0.01}
                              value={[field.value ?? 0]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid={`slider-${cfg.name}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Liquidity & risk */}
              <Card className="border-card-border">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Liquidity &amp; pricing</h3>
                    <p className="text-xs text-muted-foreground">
                      Floors that filter out illiquid or low-quality contracts.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="minOpenInterest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Open Interest</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-min-oi"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="minBid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Bid ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-min-bid"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="minUnderlyingPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Underlying ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-min-underlying"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Engine */}
              <Card className="border-card-border">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Engine</h3>
                    <p className="text-xs text-muted-foreground">
                      Math &amp; output controls.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="riskFreeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Risk-free rate</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              min={0}
                              max={1}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-risk-free-rate"
                            />
                          </FormControl>
                          <FormDescription>e.g. 0.045 = 4.5%</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="topN"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Top N candidates</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={200}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-top-n"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cacheTtlMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cache TTL (min)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={1440}
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              className="tabular-nums"
                              data-testid="input-cache-ttl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Concentration risk */}
              <Card className="border-card-border">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Concentration risk</h3>
                    <p className="text-xs text-muted-foreground">
                      Warn when a new trade would push a single ticker or sector
                      above this share of your total open cash-at-risk. Advisory only.
                    </p>
                  </div>
                  {(
                    [
                      {
                        name: "concentration.tickerPct" as const,
                        label: "Per-ticker limit",
                        hint: "Default 15%. Tighter is safer, looser allows bigger single-name bets.",
                      },
                      {
                        name: "concentration.sectorPct" as const,
                        label: "Per-sector limit",
                        hint: "Default 30%. Tickers without a known sector are ignored.",
                      },
                    ]
                  ).map((cfg) => (
                    <FormField
                      key={cfg.name}
                      control={form.control}
                      name={cfg.name}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>{cfg.label}</FormLabel>
                            <span
                              className="text-xs font-medium tabular-nums text-muted-foreground"
                              data-testid={`value-${cfg.name.replace(/\./g, "-")}`}
                            >
                              {((field.value ?? 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0}
                              max={1}
                              step={0.01}
                              value={[field.value ?? 0]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid={`slider-${cfg.name.replace(/\./g, "-")}`}
                            />
                          </FormControl>
                          <FormDescription>{cfg.hint}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Earnings filter */}
              <Card className="border-card-border">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Earnings risk</h3>
                    <p className="text-xs text-muted-foreground">
                      How to treat candidates whose earnings date falls inside
                      the DTE window. Earnings inside the window is the single
                      biggest avoidable source of assignment surprise.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="earningsInWindow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default behavior</FormLabel>
                        <FormControl>
                          <div
                            className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
                            data-testid="settings-earnings-filter"
                          >
                            {(
                              [
                                { value: "hide", label: "Hide" },
                                { value: "only", label: "Show only" },
                                { value: "include", label: "Include" },
                              ] as const
                            ).map((opt) => {
                              const active = field.value === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => field.onChange(opt.value)}
                                  className={cn(
                                    "px-3 py-1 text-xs rounded-sm transition-colors",
                                    active
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:text-foreground",
                                  )}
                                  data-testid={`settings-earnings-${opt.value}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </FormControl>
                        <FormDescription>
                          The candidates page filter bar mirrors this and can
                          override it on the fly.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => form.reset(initial)}
                  data-testid="button-reset-settings"
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={update.isPending || rescan.isPending}
                  data-testid="button-save-settings"
                >
                  {update.isPending || rescan.isPending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <SpokeSpinner
                        size={12}
                        label={update.isPending ? "Saving" : "Re-scanning"}
                      />
                      <span aria-hidden="true">
                        {update.isPending ? "Saving…" : "Re-scanning…"}
                      </span>
                    </span>
                  ) : (
                    "Save & re-scan"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </motion.div>
    </AppShell>
  );
}

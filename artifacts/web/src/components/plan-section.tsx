import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTierQueryKey,
  useGetTier,
  useSetTier,
} from "@workspace/api-client-react";
import { TIERS, type Tier } from "@workspace/tiers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
};

const TIER_HEADLINE: Record<Tier, string> = {
  free: "Marketing-grade access. See enough to know it works.",
  pro: "The full daily workflow — screener, alerts, journal.",
  ultra: "Everything plus AI explainers, advisor, and live data.",
};

export function PlanSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetTier();
  const setTier = useSetTier({
    mutation: {
      onSuccess: (next) => {
        qc.setQueryData(getGetTierQueryKey(), next);
        qc.invalidateQueries({ queryKey: getGetTierQueryKey() });
        toast({
          title: `Plan switched to ${TIER_LABEL[next.tier]}`,
          description: "Capability gates re-evaluated.",
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ variant: "destructive", title: "Failed to switch plan", description: message });
      },
    },
  });

  if (isLoading || !data) {
    return (
      <Card className="border-card-border" data-testid="plan-section-loading">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const current = data.tier;

  return (
    <Card className="border-card-border" data-testid="plan-section">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Plan</h3>
            <p className="text-xs text-muted-foreground">
              You're on{" "}
              <span
                className="font-semibold text-foreground"
                data-testid="plan-current-tier"
              >
                {TIER_LABEL[current]}
              </span>
              . {TIER_HEADLINE[current]}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              current === "ultra"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : current === "pro"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {TIER_LABEL[current]}
          </span>
        </div>

        <div className="overflow-hidden rounded-md border border-card-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Capability</th>
                <th className="px-3 py-2 font-medium">Required plan</th>
                <th className="px-3 py-2 font-medium text-right">Available now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {data.capabilities.map((c) => (
                <tr key={c.capability} data-testid={`capability-row-${c.capability}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{c.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.description}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                      {TIER_LABEL[c.requiredTier]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">
                    {c.available ? (
                      <Check
                        className="ml-auto h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-label="Available"
                        data-testid={`capability-available-${c.capability}`}
                      />
                    ) : (
                      <X
                        className="ml-auto h-4 w-4 text-muted-foreground"
                        aria-label="Locked"
                        data-testid={`capability-locked-${c.capability}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Billing is not yet enabled — select your plan to try out all features for free.
        </p>

        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-card-border bg-muted/20 p-3"
          data-testid="plan-switcher"
        >
          <span className="text-xs font-medium text-muted-foreground">
            Test mode — billing not enabled. Switch plan:
          </span>
          {TIERS.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={t === current ? "default" : "outline"}
              disabled={setTier.isPending || t === current}
              onClick={() => setTier.mutate({ data: { tier: t } })}
              data-testid={`button-set-tier-${t}`}
            >
              {TIER_LABEL[t]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

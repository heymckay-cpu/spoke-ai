import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDigestSettings,
  useUpdateDigestSettings,
  getGetDigestSettingsQueryKey,
} from "@workspace/api-client-react";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GatedFeature } from "@/components/gated-feature";
import { useToast } from "@/hooks/use-toast";

/**
 * Email preferences card: daily candidate digest + alert delivery. Persisted
 * server-side; the digest fires on weekdays after the chosen UTC hour, and
 * ITM / near-expiry alerts are emailed as they trigger.
 */
export function EmailAlertsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetDigestSettings();
  const update = useUpdateDigestSettings();

  const [enabled, setEnabled] = useState(false);
  const [hourUtc, setHourUtc] = useState(13);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setHourUtc(data.hourUtc);
      setEmail(data.email ?? "");
    }
  }, [data]);

  const save = (next: { enabled: boolean; hourUtc: number; email: string }) => {
    update.mutate(
      {
        data: {
          enabled: next.enabled,
          hourUtc: next.hourUtc,
          email: next.email.trim() || null,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetDigestSettingsQueryKey() });
          toast({
            title: next.enabled ? "Daily digest on" : "Daily digest off",
            description: next.enabled
              ? `Weekday mornings after ${String(next.hourUtc).padStart(2, "0")}:00 UTC to ${next.email.trim() || data?.accountEmail || "your account email"}`
              : undefined,
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to save email settings",
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      },
    );
  };

  const localHourLabel = (h: number): string => {
    // Show what the UTC hour means on the user's clock.
    const d = new Date();
    d.setUTCHours(h, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <GatedFeature
      capability="alerts.email"
      upgradeTitle="Email alerts are part of Pro"
      upgradeDescription="Get a daily candidate digest plus position alerts (assignment risk, near-expiry) delivered to your inbox. Upgrade to Pro to turn them on."
    >
      <Card className="border-card-border" data-testid="email-alerts-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-accent/60 p-2 text-accent-foreground">
                <Mail className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">
                  Daily digest &amp; email alerts
                </h3>
                <p className="text-xs text-muted-foreground">
                  A weekday morning email with your top candidates (and their
                  Quiver scores), plus assignment-risk and near-expiry alerts
                  as they fire.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={enabled ? "default" : "outline"}
              disabled={isLoading || update.isPending}
              onClick={() => {
                const next = !enabled;
                setEnabled(next);
                save({ enabled: next, hourUtc, email });
              }}
              data-testid="button-toggle-email-alerts"
              aria-pressed={enabled}
            >
              {enabled ? "On" : "Off"}
            </Button>
          </div>

          {data && !data.emailConfigured && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              The server has no email transport configured yet (RESEND_API_KEY)
              — settings are saved, but nothing will send until it's added.
            </p>
          )}

          {enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="digest-hour">
                  Send after (UTC hour)
                </label>
                <select
                  id="digest-hour"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={hourUtc}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHourUtc(h);
                    save({ enabled, hourUtc: h, email });
                  }}
                  data-testid="select-digest-hour"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00 UTC ({localHourLabel(h)} local)
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="digest-email">
                  Deliver to
                </label>
                <Input
                  id="digest-email"
                  type="email"
                  placeholder={data?.accountEmail ?? "you@example.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => save({ enabled, hourUtc, email })}
                  data-testid="input-digest-email"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave blank to use your account email
                  {data?.accountEmail ? ` (${data.accountEmail})` : ""}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </GatedFeature>
  );
}

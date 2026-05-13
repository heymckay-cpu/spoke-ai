import { useState } from "react";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GatedFeature } from "@/components/gated-feature";

/**
 * "Email alerts" preference card surfaced in Settings. The toggle UI is
 * intentionally local-only today — the actual email transport (SMTP /
 * Resend) lands in a separate task. This card exists now so the gating
 * primitive is visibly wired into a real surface and the upgrade path
 * is obvious to free-tier users.
 */
export function EmailAlertsCard() {
  const [enabled, setEnabled] = useState(false);
  return (
    <GatedFeature
      capability="alerts.email"
      upgradeTitle="Email alerts are part of Pro"
      upgradeDescription="Get position alerts (assignment risk, near-expiry) delivered to your inbox. Upgrade to Pro to turn them on."
    >
      <Card className="border-card-border" data-testid="email-alerts-card">
        <CardContent className="flex items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-accent/60 p-2 text-accent-foreground">
              <Mail className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Email alerts</h3>
              <p className="text-xs text-muted-foreground">
                Send a copy of every assignment-risk and near-expiry alert
                to your inbox.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={enabled ? "default" : "outline"}
            onClick={() => setEnabled((v) => !v)}
            data-testid="button-toggle-email-alerts"
            aria-pressed={enabled}
          >
            {enabled ? "On" : "Off"}
          </Button>
        </CardContent>
      </Card>
    </GatedFeature>
  );
}

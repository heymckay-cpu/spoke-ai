import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { QaPanel } from "@/components/qa-panel";
import { QaConversationsRail } from "@/components/qa-conversations-rail";
import { GatedFeature } from "@/components/gated-feature";
import { Card, CardContent } from "@/components/ui/card";

const RAIL_COLLAPSED_KEY = "wheel.qa.railCollapsed";

export function AskPage() {
  const params = useParams<{ conversationId?: string }>();
  const [, navigate] = useLocation();
  const parsedId = params.conversationId ? Number(params.conversationId) : NaN;
  const conversationId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <AppShell title="Ask">
      <GatedFeature
        capability="ai.qa"
        renderUpgrade={({ required }) => (
          <div className="flex h-[calc(100vh-5rem)] items-center justify-center p-4">
            <Card
              className="max-w-xl border-card-border bg-card"
              data-testid="ask-upgrade-card"
            >
              <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Sparkles className="h-6 w-6" aria-hidden />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Portfolio Q&amp;A is part of {required === "ultra" ? "Ultra" : "Pro"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Ask plain-English questions about your positions, scans
                    and holdings, and get answers backed by your real data.
                    Each answer uses an AI call, so it&apos;s reserved for
                    paid plans.
                  </p>
                </div>
                <a
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  data-testid="link-ask-upgrade"
                >
                  See plans
                </a>
              </CardContent>
            </Card>
          </div>
        )}
      >
        <div className="flex h-[calc(100vh-5rem)] gap-0">
          <QaConversationsRail
            activeId={conversationId}
            onSelect={(id) => navigate(`/dashboard/ask/${id}`)}
            onNew={() => navigate("/dashboard/ask")}
            onActiveDeleted={() => navigate("/dashboard/ask")}
            collapsed={collapsed}
            onToggleCollapsed={setCollapsed}
          />
          <QaPanel
            className="flex-1"
            conversationId={conversationId}
            onConversationCreated={(id) => navigate(`/dashboard/ask/${id}`, { replace: true })}
          />
        </div>
      </GatedFeature>
    </AppShell>
  );
}

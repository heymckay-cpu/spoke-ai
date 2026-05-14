import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/app-shell";
import { QaPanel } from "@/components/qa-panel";
import { QaConversationsRail } from "@/components/qa-conversations-rail";

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
      <div className="flex h-[calc(100vh-5rem)] gap-0">
        <QaConversationsRail
          activeId={conversationId}
          onSelect={(id) => navigate(`/ask/${id}`)}
          onNew={() => navigate("/ask")}
          onActiveDeleted={() => navigate("/ask")}
          collapsed={collapsed}
          onToggleCollapsed={setCollapsed}
        />
        <QaPanel
          className="flex-1"
          conversationId={conversationId}
          onConversationCreated={(id) => navigate(`/ask/${id}`, { replace: true })}
        />
      </div>
    </AppShell>
  );
}

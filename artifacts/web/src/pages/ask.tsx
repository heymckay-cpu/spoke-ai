import { AppShell } from "@/components/app-shell";
import { QaPanel } from "@/components/qa-panel";

export function AskPage() {
  return (
    <AppShell title="Ask">
      <div className="flex h-[calc(100vh-5rem)] flex-col">
        <QaPanel className="flex-1" />
      </div>
    </AppShell>
  );
}

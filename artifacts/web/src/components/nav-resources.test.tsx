import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./app-shell";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { firstName: "Test", primaryEmailAddress: { emailAddress: "t@example.com" } } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/notification-bell", () => ({
  NotificationBell: () => <div data-testid="bell-stub" />,
}));

function renderAt(path: string) {
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <AppShell title="Resources">
          <div>content</div>
        </AppShell>
      </Router>
    </QueryClientProvider>,
  );
}

describe("AppShell — Resources nav entry", () => {
  it("includes a desktop sidebar link to /dashboard/resources", () => {
    renderAt("/dashboard/resources");
    const link = screen.getByTestId("link-nav-resources");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toContain("/dashboard/resources");
  });

  it("marks the Resources link as active when on the Resources route", () => {
    renderAt("/dashboard/resources");
    const link = screen.getByTestId("link-nav-resources");
    expect(link.className).toMatch(/(?:^| )bg-sidebar-accent(?: |$)/);
  });

  it("does not mark the Resources link as active on a different route", () => {
    renderAt("/dashboard");
    const link = screen.getByTestId("link-nav-resources");
    expect(link.className).not.toMatch(/(?:^| )bg-sidebar-accent(?: |$)/);
  });

  it("places Resources between Ask and Settings in the desktop sidebar", () => {
    renderAt("/dashboard");
    const sidebar = screen.getByTestId("nav-sidebar");
    const labels = within(sidebar)
      .getAllByRole("link")
      .map((a) => a.textContent?.trim())
      .filter(Boolean) as string[];
    const ask = labels.indexOf("Ask");
    const resources = labels.indexOf("Resources");
    const settings = labels.indexOf("Settings");
    expect(ask).toBeGreaterThanOrEqual(0);
    expect(resources).toBe(ask + 1);
    expect(settings).toBe(resources + 1);
  });

  it("includes a Resources entry in the mobile nav drawer", () => {
    renderAt("/dashboard");
    fireEvent.click(screen.getByTestId("button-mobile-nav"));
    const link = screen.getByTestId("link-mobile-nav-resources");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toContain("/dashboard/resources");
  });
});

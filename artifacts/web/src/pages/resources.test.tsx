import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResourcesPage } from "./resources";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="app-shell" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard/resources", () => undefined] as const,
}));

class IO {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}
(globalThis as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;

describe("ResourcesPage", () => {
  it("renders the manual heading and major sections", () => {
    render(<ResourcesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Resources" })).toBeInTheDocument();
    expect(screen.getByTestId("section-candidates")).toBeInTheDocument();
    expect(screen.getByTestId("section-positions")).toBeInTheDocument();
    expect(screen.getByTestId("section-ask")).toBeInTheDocument();
    expect(screen.getByTestId("section-faq")).toBeInTheDocument();
  });

  it("documents the earnings filter modes by name", () => {
    render(<ResourcesPage />);
    const sub = document.getElementById("earnings-filter");
    expect(sub).not.toBeNull();
    const text = sub?.textContent ?? "";
    expect(text).toMatch(/Hide/);
    expect(text).toMatch(/Show only/);
    expect(text).toMatch(/Include/);
  });

  it("includes a TOC entry for every top-level section", () => {
    render(<ResourcesPage />);
    const ids = [
      "getting-started",
      "candidates",
      "chain",
      "positions",
      "holdings",
      "ask",
      "alerts",
      "billing",
      "faq",
    ];
    for (const id of ids) {
      expect(screen.getByTestId(`toc-${id}`)).toBeInTheDocument();
    }
  });

  it("documents the row-level risk signals around the orange ticker, without the removed threshold pills", () => {
    render(<ResourcesPage />);
    const sub = document.getElementById("candidate-risk-pills");
    expect(sub).not.toBeNull();
    const text = sub?.textContent ?? "";
    expect(text).toMatch(/\+N open/);
    expect(text).toMatch(/amber|orange/i);
    // The "Ticker XX%" / "Sector XX%" pills were removed from the row in
    // task #102 — make sure the manual no longer references them.
    expect(text).not.toMatch(/Ticker XX%/);
    expect(text).not.toMatch(/Sector XX%/);
  });

  it("documents the new holdings sector view and Ask conversations rail", () => {
    render(<ResourcesPage />);
    const sectors = document.getElementById("holdings-sectors");
    expect(sectors).not.toBeNull();
    expect(sectors?.textContent ?? "").toMatch(/By sector/i);

    const convos = document.getElementById("ask-conversations");
    expect(convos).not.toBeNull();
    const convosText = convos?.textContent ?? "";
    expect(convosText).toMatch(/Rename/);
    expect(convosText).toMatch(/Delete/);
    expect(convosText).toMatch(/\/dashboard\/ask\/<id>/);
  });

  it("documents that the Ask tab is currently Ultra-only", () => {
    render(<ResourcesPage />);
    const tier = document.getElementById("ask-tier");
    expect(tier).not.toBeNull();
    expect(tier?.textContent ?? "").toMatch(/Ultra/);
  });

  it("renders an anchor target for the deep-linkable earnings-filter subsection", () => {
    render(<ResourcesPage />);
    const target = document.getElementById("earnings-filter");
    expect(target).not.toBeNull();
    expect(target?.className ?? "").toMatch(/scroll-mt-/);
  });
});

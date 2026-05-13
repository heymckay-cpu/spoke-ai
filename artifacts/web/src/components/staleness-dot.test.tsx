import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseHealthCheck = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useHealthCheck: (opts: unknown) => mockUseHealthCheck(opts),
  getHealthCheckQueryKey: () => ["healthz"],
}));

import { StalenessDot } from "./staleness-dot";

describe("StalenessDot", () => {
  beforeEach(() => {
    mockUseHealthCheck.mockReset();
  });

  it("renders nothing when the active provider serves live quotes", () => {
    mockUseHealthCheck.mockReturnValue({
      data: { status: "ok", provider: "yahoo", live: true },
    });
    const { container } = render(<StalenessDot label="Spot" />);
    expect(screen.queryByTestId("dot-staleness")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while health is still loading (no data yet)", () => {
    mockUseHealthCheck.mockReturnValue({ data: undefined });
    render(<StalenessDot label="Spot" />);
    expect(screen.queryByTestId("dot-staleness")).toBeNull();
  });

  it("renders the amber dot with a tooltip mentioning the provider when delayed", () => {
    mockUseHealthCheck.mockReturnValue({
      data: { status: "ok", provider: "yahoo", live: false },
    });
    render(<StalenessDot label="Bid" />);
    const dot = screen.getByTestId("dot-staleness");
    expect(dot).toBeInTheDocument();
    const title = dot.getAttribute("title") ?? "";
    expect(title).toMatch(/Bid/);
    expect(title).toMatch(/yahoo/);
    expect(title).toMatch(/delayed/i);
  });
});

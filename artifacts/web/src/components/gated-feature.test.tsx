import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseGetTier = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetTier: (...args: unknown[]) => mockUseGetTier(...args),
}));

import { GatedFeature } from "./gated-feature";

describe("<GatedFeature>", () => {
  beforeEach(() => {
    mockUseGetTier.mockReset();
  });

  it("renders the upgrade prompt for a free user blocked from a Pro feature", () => {
    mockUseGetTier.mockReturnValue({
      data: { tier: "free", capabilities: [] },
      isLoading: false,
      isError: false,
    });
    render(
      <GatedFeature capability="alerts.email">
        <div>Email alerts content</div>
      </GatedFeature>,
    );
    expect(screen.getByTestId("gated-alerts.email-upgrade")).toBeInTheDocument();
    expect(screen.queryByText("Email alerts content")).not.toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });

  it("renders the children for an ultra user", () => {
    mockUseGetTier.mockReturnValue({
      data: { tier: "ultra", capabilities: [] },
      isLoading: false,
      isError: false,
    });
    render(
      <GatedFeature capability="ai.advisor">
        <div data-testid="advisor-content">Advisor content</div>
      </GatedFeature>,
    );
    expect(screen.getByTestId("advisor-content")).toBeInTheDocument();
    expect(screen.queryByTestId("gated-ai.advisor-upgrade")).not.toBeInTheDocument();
  });

  it("renders a loading skeleton while the tier query is in flight", () => {
    mockUseGetTier.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(
      <GatedFeature capability="ai.qa">
        <div>QA content</div>
      </GatedFeature>,
    );
    expect(screen.getByTestId("gated-ai.qa-loading")).toBeInTheDocument();
    expect(screen.queryByText("QA content")).not.toBeInTheDocument();
  });

  it("blocks pro users from ultra-only capabilities", () => {
    mockUseGetTier.mockReturnValue({
      data: { tier: "pro", capabilities: [] },
      isLoading: false,
      isError: false,
    });
    render(
      <GatedFeature capability="data.realtime">
        <div>Live quotes</div>
      </GatedFeature>,
    );
    expect(screen.getByTestId("gated-data.realtime-upgrade")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Ultra/i)).toBeInTheDocument();
    expect(screen.queryByText("Live quotes")).not.toBeInTheDocument();
  });
});

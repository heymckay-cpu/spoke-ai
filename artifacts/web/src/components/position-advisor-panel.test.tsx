import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockUseGetPositionAdvisor = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetPositionAdvisor: (...args: unknown[]) =>
    mockUseGetPositionAdvisor(...args),
  getGetPositionAdvisorQueryKey: (id: number) =>
    [`/api/positions/${id}/advisor`] as const,
  // The panel imports RollPositionDialog, which depends on these hooks. We
  // stub them to return inert objects so the dialog doesn't blow up when it
  // hydrates as part of the component tree (it's hidden until the user
  // clicks "Open roll dialog").
  useGetRollQuote: () => ({ data: undefined, isFetching: false, error: null }),
  useGetRollSuggestion: () => ({
    data: undefined,
    isLoading: false,
    error: null,
  }),
  useRollPosition: () => ({ mutateAsync: vi.fn() }),
  useUndoRoll: () => ({ mutateAsync: vi.fn() }),
  getGetRollQuoteQueryKey: () => ["roll-quote"] as const,
  getGetRollSuggestionQueryKey: () => ["roll-suggestion"] as const,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(() => ({ id: "1", dismiss: vi.fn(), update: vi.fn() })) }),
}));

import { PositionAdvisorPanel } from "./position-advisor-panel";
import type { Position } from "@workspace/api-client-react";

const position: Position = {
  id: 7,
  ticker: "AAPL",
  strike: 200,
  expiry: "2025-05-16",
  premium: 2.5,
  contracts: 1,
  openedAt: "2025-04-01T00:00:00.000Z",
  closedAt: null,
  closePrice: null,
  notes: null,
  status: "open",
  dte: 5,
  spot: 195,
  currentBid: 6.5,
  unrealizedPnl: -100,
  realizedPnl: null,
  assignmentRisk: true,
  expiringSoon: true,
  rolledFromId: null,
  rolledFrom: null,
  rolledTo: null,
} as unknown as Position;

const baseContext = {
  position: {
    id: 7,
    ticker: "AAPL",
    strike: 200,
    expiry: "2025-05-16",
    premium: 2.5,
    contracts: 1,
    dte: 5,
  },
  costBasisPerShare: 197.5,
  netPremiumPerShare: 2.5,
  totalPremiumCollected: 250,
  chainLegs: [],
  quote: {
    spot: 195,
    currentBid: 6.5,
    intrinsic: 5,
    extrinsic: 1.5,
    fetchedAt: "2025-05-13T10:00:00Z",
  },
  rollTargets: [],
  concentration: {
    totalCar: 100_000,
    tickerCar: 20_000,
    tickerPct: 0.2,
    sector: "Technology",
    sectorCar: 30_000,
    sectorPct: 0.3,
    openPositionsInTicker: 1,
  },
  assignmentCostPerShare: 200,
  assignmentCostTotal: 20_000,
};

beforeEach(() => {
  mockUseGetPositionAdvisor.mockReset();
});

describe("PositionAdvisorPanel", () => {
  it("renders the verdict, summary, bullets, and a deep-link CTA when AI is available", async () => {
    mockUseGetPositionAdvisor.mockReturnValue({
      data: {
        available: true,
        context: baseContext,
        verdict: {
          verdict: "roll",
          summary: "Roll out 30d for $50 net credit at the same strike.",
          bullets: [
            "Net credit of $50 keeps premium flowing.",
            "Cost basis $197.50 still below current spot.",
          ],
          recommendedRoll: { expiry: "2025-06-15", strike: 200 },
        },
        unavailableReason: undefined,
        generatedAt: "2025-05-13T10:01:00Z",
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PositionAdvisorPanel position={position} onRolled={vi.fn()} />);
    fireEvent.click(screen.getByTestId("advisor-toggle-7"));

    await waitFor(() => {
      expect(screen.getByTestId("advisor-verdict-roll")).toBeInTheDocument();
    });
    expect(screen.getByTestId("advisor-summary")).toHaveTextContent(
      /net credit/i,
    );
    expect(screen.getByTestId("advisor-bullets").children.length).toBe(2);
    expect(
      screen.getByTestId("advisor-open-roll-7"),
    ).toHaveTextContent(/2025-06-15/);
    expect(screen.getByTestId("advisor-raw-numbers")).toHaveTextContent(
      /Cost basis/i,
    );
  });

  it("falls back to raw numbers and an unavailable badge when AI is down", async () => {
    mockUseGetPositionAdvisor.mockReturnValue({
      data: {
        available: false,
        context: baseContext,
        verdict: null,
        unavailableReason: "LLM unavailable",
        generatedAt: "2025-05-13T10:02:00Z",
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PositionAdvisorPanel position={position} onRolled={vi.fn()} />);
    fireEvent.click(screen.getByTestId("advisor-toggle-7"));

    await waitFor(() => {
      expect(
        screen.getByTestId("advisor-verdict-unavailable"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("advisor-fallback-message")).toHaveTextContent(
      /LLM unavailable/,
    );
    // Raw numbers must still be visible so the user has actionable info.
    expect(screen.getByTestId("advisor-raw-numbers")).toHaveTextContent(
      /Cost basis/i,
    );
    // No verdict means no roll-deep-link CTA.
    expect(screen.queryByTestId("advisor-open-roll-7")).toBeNull();
  });
});

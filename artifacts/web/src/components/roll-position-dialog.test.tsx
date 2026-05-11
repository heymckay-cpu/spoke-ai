import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the api-client-react hooks before importing the component under test.
const useGetRollSuggestionMock = vi.fn();
const useRollPositionMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetRollSuggestion: (...args: unknown[]) => useGetRollSuggestionMock(...args),
  useRollPosition: (...args: unknown[]) => useRollPositionMock(...args),
  getGetRollSuggestionQueryKey: (id: number) => ["positions", id, "roll-suggestion"],
}));

// The toast hook just needs a no-op shape; the dialog calls toast() on submit/error.
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { RollPositionDialog } from "./roll-position-dialog";
import type { Position } from "@workspace/api-client-react";

const basePosition: Position = {
  id: 42,
  ticker: "AAPL",
  strike: 200,
  expiry: "2025-04-18",
  premium: 2.5,
  contracts: 1,
  openedAt: "2025-04-01T00:00:00.000Z",
  closedAt: null,
  closePrice: null,
  notes: null,
  status: "open",
  dte: 10,
  spot: 205,
  currentBid: 1.25,
  unrealizedPnl: 125,
  realizedPnl: null,
  assignmentRisk: false,
  expiringSoon: false,
  rolledFromId: null,
  rolledFrom: null,
  rolledTo: null,
} as unknown as Position;

const sampleSuggestion = {
  ticker: "AAPL",
  currentExpiry: "2025-04-18",
  currentStrike: 200,
  suggestedExpiry: "2025-05-16",
  dteFromNow: 31,
  dteFromCurrent: 28,
  spot: 205,
  fetchedAt: "2025-04-15T15:00:00.000Z",
  options: [
    {
      kind: "same",
      strike: 200,
      premium: 4.2,
      bid: 4.2,
      ask: 4.5,
      mid: 4.35,
      lastPrice: 4.1,
    },
    {
      kind: "down5",
      strike: 190,
      premium: 2.6,
      bid: 2.6,
      ask: 2.8,
      mid: 2.7,
      lastPrice: 2.55,
    },
  ],
};

beforeEach(() => {
  useGetRollSuggestionMock.mockReset();
  useRollPositionMock.mockReset();
  useRollPositionMock.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
});

function openDialog() {
  const trigger = screen.getByTestId("button-roll-position-42");
  fireEvent.click(trigger);
}

describe("<RollPositionDialog />", () => {
  it("auto-applies the smart suggestion to expiry/strike/premium when it arrives", async () => {
    useGetRollSuggestionMock.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={basePosition} onRolled={() => {}} />);
    openDialog();

    await waitFor(() => {
      expect(screen.getByTestId("input-roll-expiry")).toHaveValue("2025-05-16");
    });
    expect(screen.getByTestId("input-roll-strike")).toHaveValue(200);
    expect(screen.getByTestId("input-roll-premium")).toHaveValue(4.2);
  });

  it("populates inputs from the −5% quick-pick button without overwriting on later renders", async () => {
    useGetRollSuggestionMock.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={basePosition} onRolled={() => {}} />);
    openDialog();

    // Wait for the auto-apply to settle on the "same" strike first.
    await waitFor(() => {
      expect(screen.getByTestId("input-roll-strike")).toHaveValue(200);
    });

    fireEvent.click(screen.getByTestId("button-roll-suggestion-down5"));
    expect(screen.getByTestId("input-roll-strike")).toHaveValue(190);
    expect(screen.getByTestId("input-roll-premium")).toHaveValue(2.6);
    expect(screen.getByTestId("input-roll-expiry")).toHaveValue("2025-05-16");
  });

  it("renders both quick-pick buttons when the suggestion has same and down5 strikes", () => {
    useGetRollSuggestionMock.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={basePosition} onRolled={() => {}} />);
    openDialog();

    expect(screen.getByTestId("roll-suggestion-quickpicks")).toBeInTheDocument();
    expect(screen.getByTestId("button-roll-suggestion-same")).toBeInTheDocument();
    expect(screen.getByTestId("button-roll-suggestion-down5")).toBeInTheDocument();
  });

  it("does not auto-apply once the user has manually edited a field", async () => {
    let suggestionData: typeof sampleSuggestion | undefined = undefined;
    useGetRollSuggestionMock.mockImplementation(() => ({
      data: suggestionData,
      isLoading: suggestionData == null,
      error: null,
    }));

    const { rerender } = render(
      <RollPositionDialog position={basePosition} onRolled={() => {}} />,
    );
    openDialog();

    // User edits the strike before the suggestion arrives.
    const strikeInput = screen.getByTestId("input-roll-strike");
    fireEvent.change(strikeInput, { target: { value: "150" } });
    expect(strikeInput).toHaveValue(150);

    // Suggestion arrives → re-render with data populated.
    suggestionData = sampleSuggestion;
    rerender(<RollPositionDialog position={basePosition} onRolled={() => {}} />);

    // Strike must remain at the user's value; auto-apply is suppressed.
    await waitFor(() => {
      expect(screen.getByTestId("input-roll-strike")).toHaveValue(150);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the generated react-query hooks before importing the component so the
// dialog uses our controllable stubs instead of hitting the network.
const mockRollMutate = vi.fn(async () => ({
  closed: { id: 100 },
  opened: { id: 101 },
}));
const mockUndoRollMutate = vi.fn(async () => ({
  reopened: { id: 100 },
  deletedId: 101,
}));
const mockUseGetRollQuote = vi.fn();
const mockUseGetRollSuggestion = vi.fn();
const useRollPositionMock = vi.fn();
const useUndoRollMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetRollQuote: (...args: unknown[]) => mockUseGetRollQuote(...args),
  useGetRollSuggestion: (...args: unknown[]) => mockUseGetRollSuggestion(...args),
  useRollPosition: (...args: unknown[]) => useRollPositionMock(...args),
  useUndoRoll: (...args: unknown[]) => useUndoRollMock(...args),
  getGetRollQuoteQueryKey: (id: number, expiry: string, strike: number) =>
    [`/api/positions/${id}/roll-quote/${expiry}/${strike}`] as const,
  getGetRollSuggestionQueryKey: (id: number) =>
    [`/api/positions/${id}/roll-suggestion`] as const,
}));

// Capture toast calls so the undo test can pull the action element back out
// and invoke it (the dialog renders no Toaster of its own under test).
const toastCalls: Array<Record<string, unknown>> = [];
const toastDismissMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (props: Record<string, unknown>) => {
      toastCalls.push(props);
      return { id: String(toastCalls.length), dismiss: toastDismissMock, update: vi.fn() };
    },
  }),
}));

import { RollPositionDialog } from "./roll-position-dialog";
import type { Position } from "@workspace/api-client-react";

const suggestionPosition: Position = {
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

const liveQuotePosition: Position = {
  id: 42,
  ticker: "AAPL",
  strike: 150,
  expiry: "2026-06-19",
  premium: 2.5,
  contracts: 1,
  openedAt: "2026-05-01T00:00:00Z",
  closedAt: null,
  closePrice: null,
  notes: null,
  status: "open",
  dte: 39,
  spot: 152,
  currentBid: 1.5,
  unrealizedPnl: 100,
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
  mockRollMutate.mockClear();
  mockUseGetRollQuote.mockReset();
  mockUseGetRollSuggestion.mockReset();
  useRollPositionMock.mockReset();
  useRollPositionMock.mockReturnValue({
    mutateAsync: mockRollMutate,
    isPending: false,
  });
  mockUndoRollMutate.mockClear();
  useUndoRollMock.mockReset();
  useUndoRollMock.mockReturnValue({
    mutateAsync: mockUndoRollMutate,
    isPending: false,
  });
  toastCalls.length = 0;
  toastDismissMock.mockClear();

  // Default: live-quote panel returns nothing so suggestion-focused tests
  // aren't affected by an unrelated quote panel render.
  mockUseGetRollQuote.mockReturnValue({
    data: undefined,
    isFetching: false,
    error: null,
  });
});

function openDialog(positionId: number) {
  const trigger = screen.getByTestId(`button-roll-position-${positionId}`);
  fireEvent.click(trigger);
}

describe("<RollPositionDialog /> smart suggestion", () => {
  it("auto-applies the smart suggestion to expiry/strike/premium when it arrives", async () => {
    mockUseGetRollSuggestion.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={suggestionPosition} onRolled={() => {}} />);
    openDialog(suggestionPosition.id);

    await waitFor(() => {
      expect(screen.getByTestId("input-roll-expiry")).toHaveValue("2025-05-16");
    });
    expect(screen.getByTestId("input-roll-strike")).toHaveValue(200);
    expect(screen.getByTestId("input-roll-premium")).toHaveValue(4.2);
  });

  it("populates inputs from the −5% quick-pick button without overwriting on later renders", async () => {
    mockUseGetRollSuggestion.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={suggestionPosition} onRolled={() => {}} />);
    openDialog(suggestionPosition.id);

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
    mockUseGetRollSuggestion.mockReturnValue({
      data: sampleSuggestion,
      isLoading: false,
      error: null,
    });

    render(<RollPositionDialog position={suggestionPosition} onRolled={() => {}} />);
    openDialog(suggestionPosition.id);

    expect(screen.getByTestId("roll-suggestion-quickpicks")).toBeInTheDocument();
    expect(screen.getByTestId("button-roll-suggestion-same")).toBeInTheDocument();
    expect(screen.getByTestId("button-roll-suggestion-down5")).toBeInTheDocument();
  });

  it("does not auto-apply once the user has manually edited a field", async () => {
    let suggestionData: typeof sampleSuggestion | undefined = undefined;
    mockUseGetRollSuggestion.mockImplementation(() => ({
      data: suggestionData,
      isLoading: suggestionData == null,
      error: null,
    }));

    const { rerender } = render(
      <RollPositionDialog position={suggestionPosition} onRolled={() => {}} />,
    );
    openDialog(suggestionPosition.id);

    // User edits the strike before the suggestion arrives.
    const strikeInput = screen.getByTestId("input-roll-strike");
    fireEvent.change(strikeInput, { target: { value: "150" } });
    expect(strikeInput).toHaveValue(150);

    // Suggestion arrives → re-render with data populated.
    suggestionData = sampleSuggestion;
    rerender(<RollPositionDialog position={suggestionPosition} onRolled={() => {}} />);

    // Strike must remain at the user's value; auto-apply is suppressed.
    await waitFor(() => {
      expect(screen.getByTestId("input-roll-strike")).toHaveValue(150);
    });
  });
});

describe("<RollPositionDialog /> live quote panel", () => {
  beforeEach(() => {
    // Suggestion-off so the auto-apply effect doesn't clobber the strike the
    // user types in this scenario.
    mockUseGetRollSuggestion.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("updates the live quote line and recomputes net credit + breakeven when the user types a custom strike", async () => {
    const user = userEvent.setup();

    // The dialog debounces the strike → useGetRollQuote call by 300ms; once
    // the debounced strike lands on 145 we return a snapped quote at 144.5.
    mockUseGetRollQuote.mockImplementation(
      (_id: number, _expiry: string, strike: number) => {
        if (strike === 145) {
          return {
            data: {
              ticker: "AAPL",
              expiry: "2026-07-17",
              strike: 144.5,
              requestedStrike: 145,
              bid: 3.2,
              ask: 3.6,
              mid: 3.4,
              lastPrice: 3.3,
              premium: 3.2,
              spot: 152,
              fetchedAt: "2026-05-11T12:00:00Z",
            },
            isFetching: false,
            error: null,
          };
        }
        return { data: undefined, isFetching: false, error: null };
      },
    );

    render(<RollPositionDialog position={liveQuotePosition} onRolled={() => {}} />);

    await user.click(
      screen.getByTestId(`button-roll-position-${liveQuotePosition.id}`),
    );

    const strikeInput = await screen.findByTestId("input-roll-strike");
    const premiumInput = screen.getByTestId("input-roll-premium");
    const contractsInput = screen.getByTestId("input-roll-contracts");
    const closePriceInput = screen.getByTestId("input-roll-close-price");

    // Set deterministic values so the math is easy to assert.
    await user.clear(closePriceInput);
    await user.type(closePriceInput, "1.00");
    await user.clear(contractsInput);
    await user.type(contractsInput, "2");
    await user.clear(premiumInput);
    await user.type(premiumInput, "3.20");

    await user.clear(strikeInput);
    await user.type(strikeInput, "145");

    // Wait for debounced live quote to render with the snapped strike.
    await waitFor(
      () => {
        expect(screen.getByText(/snapped from/i)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // Live quote line shows the bid/mid/last we returned.
    expect(screen.getByTestId("roll-live-quote-bid")).toHaveTextContent("$3.20");
    expect(screen.getByTestId("roll-live-quote-mid")).toHaveTextContent("$3.40");
    expect(screen.getByTestId("roll-live-quote-last")).toHaveTextContent("$3.30");

    // Net credit = (premium - closePrice) * 100 * contracts = (3.20 - 1.00) * 100 * 2 = 440.
    expect(screen.getByTestId("roll-net-credit")).toHaveTextContent("+$440.00");
    // Breakeven = strike - (premium - closePrice) = 145 - (3.20 - 1.00) = 142.80.
    expect(screen.getByTestId("roll-breakeven")).toHaveTextContent("$142.80");
  });

  it("renders skeleton cells and a Spoke spinner on the first fetch when no prior quote exists", async () => {
    mockUseGetRollQuote.mockReturnValue({
      data: undefined,
      isFetching: true,
      error: null,
    });

    render(<RollPositionDialog position={liveQuotePosition} onRolled={() => {}} />);
    fireEvent.click(
      screen.getByTestId(`button-roll-position-${liveQuotePosition.id}`),
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("roll-live-quote-skeleton")).toHaveLength(3);
    });
    const spinner = screen.getByTestId("roll-live-quote-spinner");
    expect(spinner).toHaveAttribute("role", "status");
    expect(spinner).toHaveTextContent("Refreshing live quote");
  });

  it("keeps the prior quote visible (dimmed) and shows the spinner during a refetch", async () => {
    const priorQuote = {
      ticker: "AAPL",
      expiry: "2026-07-17",
      strike: 144.5,
      requestedStrike: 145,
      bid: 3.2,
      ask: 3.6,
      mid: 3.4,
      lastPrice: 3.3,
      premium: 3.2,
      spot: 152,
      fetchedAt: "2026-05-11T12:00:00Z",
    };

    let isFetching = false;
    mockUseGetRollQuote.mockImplementation(() => ({
      data: priorQuote,
      isFetching,
      error: null,
    }));

    const { rerender } = render(
      <RollPositionDialog position={liveQuotePosition} onRolled={() => {}} />,
    );
    fireEvent.click(
      screen.getByTestId(`button-roll-position-${liveQuotePosition.id}`),
    );

    await waitFor(() => {
      expect(screen.getByTestId("roll-live-quote-bid")).toHaveTextContent("$3.20");
    });

    // Simulate the user changing the strike → react-query enters a refetch.
    isFetching = true;
    rerender(<RollPositionDialog position={liveQuotePosition} onRolled={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("roll-live-quote-spinner")).toBeInTheDocument();
    });
    // Prior quote stays on screen.
    expect(screen.getByTestId("roll-live-quote-bid")).toHaveTextContent("$3.20");
    expect(screen.getByTestId("roll-live-quote-mid")).toHaveTextContent("$3.40");
    expect(screen.getByTestId("roll-live-quote-last")).toHaveTextContent("$3.30");
    // Snapped-from header text reflects the prior (displayed) quote, not the
    // in-flight strike, so it can never lie about which numbers we're showing.
    expect(screen.getByTestId("roll-live-quote-meta")).toHaveTextContent(
      "2026-07-17 · $144.50P (snapped from $145.00)",
    );
  });
});

describe("<RollPositionDialog /> undo action", () => {
  beforeEach(() => {
    mockUseGetRollSuggestion.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    mockRollMutate.mockReset();
    mockRollMutate.mockResolvedValue({
      closed: { id: 555 },
      opened: { id: 777 },
    });
  });

  async function submitRoll() {
    render(<RollPositionDialog position={liveQuotePosition} onRolled={() => {}} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByTestId(`button-roll-position-${liveQuotePosition.id}`),
    );
    // Default values from the dialog effect are valid; just click confirm.
    await user.click(await screen.findByTestId("button-confirm-roll"));
    await waitFor(() => {
      expect(mockRollMutate).toHaveBeenCalledTimes(1);
    });
  }

  it("offers a 10s Undo toast carrying the closed/opened ids from the roll response", async () => {
    await submitRoll();
    const success = toastCalls.find((t) => t["title"] === "Position rolled");
    expect(success).toBeDefined();
    expect(success!["duration"]).toBe(10_000);
    // The action element must be a clickable Undo button wired to the
    // freshly-returned ids; renders as a child via toast.action prop.
    expect(success!["action"]).toBeDefined();
  });

  it("calls undoRoll with the right ids when the user clicks Undo", async () => {
    await submitRoll();
    const success = toastCalls.find((t) => t["title"] === "Position rolled");
    const action = success!["action"] as React.ReactElement<{
      onClick: () => Promise<void>;
    }>;
    await action.props.onClick();
    expect(mockUndoRollMutate).toHaveBeenCalledWith({
      data: { closedId: 555, openedId: 777 },
    });
    expect(toastDismissMock).toHaveBeenCalled();
    // A confirmation toast follows.
    expect(toastCalls.some((t) => t["title"] === "Roll undone")).toBe(true);
  });

  it("shows a destructive toast when undo fails", async () => {
    mockUndoRollMutate.mockRejectedValueOnce(new Error("link broken"));
    await submitRoll();
    const success = toastCalls.find((t) => t["title"] === "Position rolled");
    const action = success!["action"] as React.ReactElement<{
      onClick: () => Promise<void>;
    }>;
    await action.props.onClick();
    const failure = toastCalls.find((t) => t["title"] === "Couldn't undo roll");
    expect(failure).toBeDefined();
    expect(failure!["variant"]).toBe("destructive");
    expect(failure!["description"]).toBe("link broken");
  });
});

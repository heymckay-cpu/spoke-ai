import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the generated hooks before importing the page so we have controllable
// stubs in place of network calls.
const {
  mockGetLatestScan,
  mockGetScanSummary,
  mockGetSettings,
  mockListPositions,
  mockListHoldings,
  mockHealthCheck,
  mockUseRunScan,
  mockUseUpdateSettings,
  runScanMutate,
  updateSettingsMutate,
} = vi.hoisted(() => ({
  mockGetLatestScan: vi.fn(),
  mockGetScanSummary: vi.fn(),
  mockGetSettings: vi.fn(),
  mockListPositions: vi.fn(() => ({ data: { positions: [] }, isLoading: false })),
  mockListHoldings: vi.fn(() => ({ data: { holdings: [] }, isLoading: false })),
  mockHealthCheck: vi.fn(() => ({ data: { ok: true }, isLoading: false })),
  mockUseRunScan: vi.fn(),
  mockUseUpdateSettings: vi.fn(),
  runScanMutate: vi.fn(),
  updateSettingsMutate: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetLatestScan: mockGetLatestScan,
  useGetScanSummary: mockGetScanSummary,
  useGetSettings: mockGetSettings,
  useListPositions: mockListPositions,
  useListHoldings: mockListHoldings,
  useHealthCheck: mockHealthCheck,
  useRunScan: mockUseRunScan,
  useUpdateSettings: mockUseUpdateSettings,
  useGetSectors: vi.fn(() => ({ data: { sectors: [] }, isLoading: false })),
  getGetLatestScanQueryKey: () => ["/api/scan/latest"] as const,
  getGetScanSummaryQueryKey: () => ["/api/scan/summary"] as const,
  getGetSettingsQueryKey: () => ["/api/settings"] as const,
  getListPositionsQueryKey: () => ["/api/positions"] as const,
  getListHoldingsQueryKey: () => ["/api/holdings"] as const,
  getHealthCheckQueryKey: () => ["/api/health"] as const,
  getGetSectorsQueryKey: () => ["/api/sectors"] as const,
}));

// The candidate row uses the AddPositionDialog which pulls in market hooks; stub
// it as a passthrough so the table renders without exercising unrelated code.
vi.mock("@/components/add-position-dialog", () => ({
  AddPositionDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/components/run-scan-button", () => ({
  RunScanButton: () => <button data-testid="button-run-scan">Run Scan</button>,
}));

vi.mock("@/components/candidate-detail-drawer", () => ({
  CandidateDetailDrawer: () => null,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CandidatesPage } from "./candidates";

const baseSettings = {
  tickers: ["AAPL"],
  minDte: 25,
  maxDte: 50,
  targetDelta: 0.25,
  minDelta: 0.15,
  maxDelta: 0.35,
  minOpenInterest: 100,
  minBid: 0.1,
  minUnderlyingPrice: 5,
  riskFreeRate: 0.045,
  topN: 20,
  cacheTtlMinutes: 15,
  earningsInWindow: "hide" as const,
};

function makeCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ticker: "AAPL",
    spot: 200,
    expiry: "2026-06-19",
    dte: 30,
    strike: 190,
    delta: -0.25,
    bid: 1.5,
    ask: 1.6,
    iv: 0.3,
    openInterest: 500,
    volume: 200,
    premiumPerContract: 150,
    collateralPerContract: 19000,
    staticReturnPct: 0.79,
    annualizedPct: 9.6,
    breakeven: 188.5,
    pctOtm: 5,
    ivRank: 0.5,
    hv30: 0.3,
    earningsDate: null,
    earningsInWindow: false,
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <CandidatesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  runScanMutate.mockReset();
  updateSettingsMutate.mockReset();
  mockUseRunScan.mockReset();
  mockUseUpdateSettings.mockReset();
  mockGetSettings.mockReset();
  mockGetScanSummary.mockReset();
  mockGetLatestScan.mockReset();

  mockUseRunScan.mockReturnValue({ mutate: runScanMutate, isPending: false });
  mockUseUpdateSettings.mockReturnValue({
    mutate: updateSettingsMutate,
    isPending: false,
  });
  mockGetSettings.mockReturnValue({ data: baseSettings });
  mockGetScanSummary.mockReturnValue({
    data: {
      scannedAt: "2026-05-13T00:00:00Z",
      candidateCount: 1,
      earningsFlaggedCount: 0,
      avgAnnualizedPct: 9.6,
      medianAnnualizedPct: 9.6,
      maxAnnualizedPct: 9.6,
      totalCollateral: 19000,
      totalPremium: 150,
      ivRankBuckets: [],
      topTickers: [],
    },
    isError: false,
    isLoading: false,
  });
  mockGetLatestScan.mockReturnValue({
    data: {
      scannedAt: "2026-05-13T00:00:00Z",
      candidates: [makeCandidate()],
      errors: [],
      tickersScanned: 1,
      tickersWithCandidate: 1,
      cached: false,
      stale: false,
      hiddenByEarningsCount: 3,
    },
    isError: false,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("CandidatesPage earnings filter", () => {
  it("renders the tri-state earnings filter and reflects the saved setting", () => {
    renderPage();
    const hide = screen.getByTestId("filter-earnings-hide");
    const only = screen.getByTestId("filter-earnings-only");
    const include = screen.getByTestId("filter-earnings-include");
    expect(hide).toHaveAttribute("aria-checked", "true");
    expect(only).toHaveAttribute("aria-checked", "false");
    expect(include).toHaveAttribute("aria-checked", "false");
  });

  it("re-runs the scan and persists the setting when the user changes the filter", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("filter-earnings-only"));

    await waitFor(() => {
      expect(runScanMutate).toHaveBeenCalledWith({
        data: { earningsInWindow: "only", forceRefresh: false },
      });
    });
    expect(updateSettingsMutate).toHaveBeenCalledTimes(1);
    const savedPayload = updateSettingsMutate.mock.calls[0]![0] as {
      data: { earningsInWindow: string };
    };
    expect(savedPayload.data.earningsInWindow).toBe("only");
  });

  it("shows the hidden-count footer when filter is `hide` and clicking 'Show them' switches to include", async () => {
    renderPage();
    const footer = screen.getByTestId("text-hidden-by-earnings");
    expect(footer).toHaveTextContent(/3 candidates hidden by earnings filter/);

    fireEvent.click(screen.getByTestId("button-show-hidden-earnings"));
    await waitFor(() => {
      expect(runScanMutate).toHaveBeenCalledWith({
        data: { earningsInWindow: "include", forceRefresh: false },
      });
    });
    const savedPayload = updateSettingsMutate.mock.calls[0]![0] as {
      data: { earningsInWindow: string };
    };
    expect(savedPayload.data.earningsInWindow).toBe("include");
  });

  it("still shows the hidden footer when every candidate was suppressed (empty table)", async () => {
    mockGetLatestScan.mockReturnValue({
      data: {
        scannedAt: "2026-05-13T00:00:00Z",
        candidates: [],
        errors: [],
        tickersScanned: 5,
        tickersWithCandidate: 0,
        cached: false,
        stale: false,
        hiddenByEarningsCount: 5,
      },
      isError: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/No scan results yet/i)).toBeInTheDocument();
    const footer = screen.getByTestId("text-hidden-by-earnings");
    expect(footer).toHaveTextContent(/5 candidates hidden by earnings filter/);
    fireEvent.click(screen.getByTestId("button-show-hidden-earnings"));
    await waitFor(() => {
      expect(runScanMutate).toHaveBeenCalledWith({
        data: { earningsInWindow: "include", forceRefresh: false },
      });
    });
  });

  it("does not show the hidden footer when nothing was suppressed", () => {
    mockGetLatestScan.mockReturnValue({
      data: {
        scannedAt: "2026-05-13T00:00:00Z",
        candidates: [makeCandidate()],
        errors: [],
        tickersScanned: 1,
        tickersWithCandidate: 1,
        cached: false,
        stale: false,
        hiddenByEarningsCount: 0,
      },
      isError: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByTestId("text-hidden-by-earnings")).toBeNull();
  });
});

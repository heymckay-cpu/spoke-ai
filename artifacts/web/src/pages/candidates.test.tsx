import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const {
  mockUseGetLatestScan,
  mockUseGetScanSummary,
  mockUseGetSettings,
  mockUseListPositions,
  mockUseListHoldings,
  mockUseRunScan,
  mockUseHealthCheck,
  mockUseUpdateSettings,
} = vi.hoisted(() => ({
  mockUseGetLatestScan: vi.fn(),
  mockUseGetScanSummary: vi.fn(),
  mockUseGetSettings: vi.fn(),
  mockUseListPositions: vi.fn(),
  mockUseListHoldings: vi.fn(() => ({ data: { holdings: [] }, isLoading: false })),
  mockUseRunScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  mockUseHealthCheck: vi.fn(() => ({ data: { ok: true }, isLoading: false })),
  mockUseUpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@workspace/api-client-react", () => {
  const m: Record<string, unknown> = {
    useGetLatestScan: mockUseGetLatestScan,
    useGetScanSummary: mockUseGetScanSummary,
    useGetSettings: mockUseGetSettings,
    useListPositions: mockUseListPositions,
    useListHoldings: mockUseListHoldings,
    useRunScan: mockUseRunScan,
    useHealthCheck: mockUseHealthCheck,
    useUpdateSettings: mockUseUpdateSettings,
    getListPositionsQueryKey: () => ["/api/positions"],
    getListHoldingsQueryKey: () => ["/api/holdings"],
    getGetSettingsQueryKey: () => ["/api/settings"],
    getGetLatestScanQueryKey: () => ["/api/scan/latest"],
    getGetScanSummaryQueryKey: () => ["/api/scan/summary"],
    getHealthCheckQueryKey: () => ["/api/health"],
  };
  return m;
});

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@/components/candidate-detail-drawer", () => ({
  CandidateDetailDrawer: () => null,
}));
vi.mock("@/components/add-position-dialog", () => ({
  AddPositionDialog: () => null,
}));

import { CandidatesPage } from "./candidates";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CandidatesPage />
    </QueryClientProvider>,
  );
}

const baseCandidate = {
  ticker: "AAPL",
  spot: 200,
  expiry: "2026-06-19",
  dte: 30,
  strike: 200,
  delta: -0.25,
  bid: 2.5,
  ask: 2.6,
  iv: 0.3,
  openInterest: 500,
  volume: 100,
  premiumPerContract: 250,
  collateralPerContract: 20_000,
  staticReturnPct: 1.25,
  annualizedPct: 15.2,
  breakeven: 197.5,
  pctOtm: 0,
  ivRank: 0.5,
  hv30: 0.28,
  earningsDate: null,
  earningsInWindow: false,
};

describe("CandidatesPage concentration chips", () => {
  beforeEachStubs();

  it("renders an overlap chip for a candidate that matches an open position", () => {
    mockUseGetLatestScan.mockReturnValue({
      data: {
        scannedAt: "2026-05-13T00:00:00Z",
        candidates: [baseCandidate],
        errors: [],
        tickersScanned: 1,
        tickersWithCandidate: 1,
        cached: false,
        stale: false,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetScanSummary.mockReturnValue({
      data: {
        avgAnnualizedPct: 15,
        maxAnnualizedPct: 15,
        candidateCount: 1,
        totalPremium: 250,
        totalCollateral: 20_000,
        earningsFlaggedCount: 0,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetSettings.mockReturnValue({
      data: { concentration: { tickerPct: 0.15, sectorPct: 0.3 } },
      isLoading: false,
      isError: false,
    });
    mockUseListPositions.mockReturnValue({
      data: {
        positions: [
          {
            id: 1,
            ticker: "AAPL",
            strike: 195,
            expiry: "2026-05-15",
            premium: 1.5,
            contracts: 1,
            openedAt: "2026-04-01T00:00:00Z",
            status: "open",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderPage();
    const overlap = screen.getByTestId("chip-overlap-AAPL");
    expect(overlap.textContent).toContain("+1 open");
    // Adding 1 more contract on top of an existing AAPL position takes the
    // ticker to 100% of total open CAR — well past the 15% limit.
    expect(screen.getByTestId("chip-ticker-overload-AAPL")).toBeInTheDocument();
  });
});

function beforeEachStubs() {
  // Default stubs reset before each test to a "no positions / no scan" state.
  mockUseListHoldings.mockReturnValue({ data: { holdings: [] }, isLoading: false });
  mockUseRunScan.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

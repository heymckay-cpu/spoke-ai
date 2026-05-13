import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConcentrationChip } from "./concentration-chip";
import type { PositionLike } from "@workspace/portfolio";

const open = (
  over: Partial<PositionLike> & { ticker: string; strike: number; contracts: number },
): PositionLike => ({ status: "open", ...over });

describe("ConcentrationChip", () => {
  const settings = { tickerPct: 0.15, sectorPct: 0.3 };

  it("renders nothing when there's no overlap and no threshold breach", () => {
    const { container } = render(
      <ConcentrationChip
        ticker="XOM"
        strike={100}
        contracts={1}
        positions={[
          open({ ticker: "MSFT", strike: 400, contracts: 1 }),
          open({ ticker: "JPM", strike: 200, contracts: 1 }),
        ]}
        settings={settings}
      />,
    );
    expect(container.textContent ?? "").toBe("");
  });

  it("shows '+N open' when the candidate ticker overlaps an open position", () => {
    render(
      <ConcentrationChip
        ticker="AAPL"
        strike={200}
        contracts={1}
        positions={[
          open({ ticker: "AAPL", strike: 200, contracts: 1 }),
          open({ ticker: "MSFT", strike: 400, contracts: 1 }),
          open({ ticker: "JPM", strike: 200, contracts: 1 }),
        ]}
        settings={settings}
      />,
    );
    const chip = screen.getByTestId("chip-overlap-AAPL");
    expect(chip.textContent).toContain("+1 open");
  });

  it("shows the amber ticker-overload chip when the threshold is crossed", () => {
    render(
      <ConcentrationChip
        ticker="AAPL"
        strike={200}
        contracts={1}
        positions={[open({ ticker: "AAPL", strike: 200, contracts: 1 })]}
        settings={settings}
      />,
    );
    expect(screen.getByTestId("chip-ticker-overload-AAPL")).toBeInTheDocument();
  });
});

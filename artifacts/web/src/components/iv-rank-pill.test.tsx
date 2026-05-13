import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IvRankPill } from "./iv-rank-pill";

describe("IvRankPill", () => {
  it("renders the real-basis pill with the rank percent and no asterisk", () => {
    render(<IvRankPill rank={0.42} basis="real" />);
    const pill = screen.getByTestId("pill-iv-rank");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent(/^42$/);
    expect(pill.getAttribute("title") ?? "").toMatch(/52-week ATM-IV history/);
    expect(screen.queryByTestId("pill-iv-rank-provisional")).toBeNull();
  });

  it("renders the provisional pill with an asterisk and the provisional tooltip", () => {
    render(<IvRankPill rank={0.42} basis="provisional" />);
    const pill = screen.getByTestId("pill-iv-rank-provisional");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent(/42\*/);
    expect(pill.getAttribute("title") ?? "").toMatch(/provisional/i);
    expect(screen.queryByTestId("pill-iv-rank")).toBeNull();
  });

  it("renders an empty pill when the rank is missing", () => {
    render(<IvRankPill rank={null} basis="provisional" />);
    const empty = screen.getByTestId("pill-iv-rank-empty");
    expect(empty).toHaveTextContent("—");
    expect(empty.getAttribute("title") ?? "").toMatch(/Not enough IV history/i);
  });
});

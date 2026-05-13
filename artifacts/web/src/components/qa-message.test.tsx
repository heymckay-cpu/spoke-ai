import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import type { QaMessage } from "@workspace/api-client-react";
import { QaMessageBubble } from "./qa-message";

const wrap = (ui: React.ReactNode) => render(<Router base="">{ui}</Router>);

const baseMsg = (over: Partial<QaMessage>): QaMessage => ({
  id: 1,
  conversationId: 1,
  role: "assistant",
  content: "",
  attachments: [],
  createdAt: "2026-05-13T00:00:00Z",
  ...over,
});

describe("QaMessageBubble", () => {
  it("renders user messages on the right with the user testid", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({ role: "user", content: "Show me PLTR positions" })}
      />,
    );
    expect(screen.getByTestId("qa-message-user")).toHaveTextContent(
      "Show me PLTR positions",
    );
  });

  it("renders inline bold and code formatting in assistant prose", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({ content: "Your **best** trade was `PLTR`." })}
      />,
    );
    const bubble = screen.getByTestId("qa-message-assistant");
    expect(bubble.querySelector("strong")?.textContent).toBe("best");
    expect(bubble.querySelector("code")?.textContent).toBe("PLTR");
  });

  it("renders attached tables with deep links when deepLinkColumn is set", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({
          content: "Here you go.",
          attachments: [
            {
              type: "table",
              title: "Worst trades",
              columns: [
                { key: "ticker", label: "Ticker" },
                { key: "pnl", label: "P/L", align: "right" },
              ],
              rows: [
                { ticker: "PLTR", tickerHref: "/chain/PLTR", pnl: -432.1 },
              ],
              deepLinkColumn: "ticker",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Worst trades")).toBeInTheDocument();
    const link = screen.getByTestId("qa-attachment-link");
    expect(link).toHaveTextContent("PLTR");
    expect(link).toHaveAttribute("href", "/chain/PLTR");
  });

  it("formats numeric cells with localised separators", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({
          attachments: [
            {
              type: "table",
              title: "Premium by month",
              columns: [
                { key: "month", label: "Month" },
                { key: "premium", label: "Premium", align: "right" },
              ],
              rows: [{ month: "2026-04", premium: 12450 }],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("12,450")).toBeInTheDocument();
  });

  it("sorts rows when a column header is clicked, toggling direction on a second click", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({
          attachments: [
            {
              type: "table",
              title: "Trades",
              columns: [
                { key: "ticker", label: "Ticker" },
                { key: "pnl", label: "P/L", align: "right" },
              ],
              rows: [
                { ticker: "AAPL", pnl: 100 },
                { ticker: "PLTR", pnl: -50 },
                { ticker: "MSFT", pnl: 25 },
              ],
            },
          ],
        })}
      />,
    );
    const tableEl = screen.getByTestId("qa-attachment-table");
    const readTickers = () =>
      within(tableEl)
        .getAllByTestId("qa-attachment-row")
        .map((tr) => tr.querySelectorAll("td")[0].textContent);
    expect(readTickers()).toEqual(["AAPL", "PLTR", "MSFT"]);
    fireEvent.click(screen.getByTestId("qa-attachment-sort-pnl"));
    expect(readTickers()).toEqual(["PLTR", "MSFT", "AAPL"]);
    fireEvent.click(screen.getByTestId("qa-attachment-sort-pnl"));
    expect(readTickers()).toEqual(["AAPL", "MSFT", "PLTR"]);
  });

  it("shows an empty-state row when the table has no rows", () => {
    wrap(
      <QaMessageBubble
        message={baseMsg({
          attachments: [
            {
              type: "table",
              title: "Open positions",
              columns: [{ key: "ticker", label: "Ticker" }],
              rows: [],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/no rows/i)).toBeInTheDocument();
  });
});

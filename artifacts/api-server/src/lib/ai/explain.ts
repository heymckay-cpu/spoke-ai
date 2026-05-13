import type { CandidateOut } from "../screener";
import type { PositionRow } from "@workspace/db";

export const EXPLAIN_MODEL = "claude-sonnet-4-6";

export type Verdict = "good_fit" | "mixed" | "avoid";

export interface ExplainerInput {
  candidate: CandidateOut;
  /** Open short-put positions across the whole portfolio (any ticker). */
  openPositions: Pick<PositionRow, "ticker" | "strike" | "expiry" | "contracts">[];
  /** Long share holdings keyed by ticker. */
  shareHoldings: { ticker: string; shares: number; avgCost: number }[];
}

export interface ExplainerResult {
  verdict: Verdict;
  summary: string;
  bullets: string[];
}

const VERDICTS: readonly Verdict[] = ["good_fit", "mixed", "avoid"];

function fmtPct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`;
}

function fmtFracPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

/**
 * Builds the prompt sent to Claude. Pure / deterministic so it can be
 * snapshot-tested. Returns the user message body — the model role + system
 * prompt are added by the caller.
 */
export function buildExplainerPrompt(input: ExplainerInput): {
  system: string;
  user: string;
} {
  const { candidate: c, openPositions, shareHoldings } = input;
  const ownLeg = openPositions.find(
    (p) => p.ticker === c.ticker && p.strike === c.strike && p.expiry === c.expiry,
  );
  const otherLegsInTicker = openPositions.filter(
    (p) => p.ticker === c.ticker && !(p.strike === c.strike && p.expiry === c.expiry),
  );
  const heldShares = shareHoldings
    .filter((h) => h.ticker === c.ticker)
    .reduce((s, h) => s + h.shares, 0);

  const portfolioLines: string[] = [];
  if (heldShares > 0) {
    const avg =
      shareHoldings
        .filter((h) => h.ticker === c.ticker)
        .reduce((s, h) => s + h.avgCost * h.shares, 0) / heldShares;
    portfolioLines.push(
      `- Owns ${heldShares} shares of ${c.ticker} at avg cost ${fmtMoney(avg)}.`,
    );
  }
  if (ownLeg) {
    portfolioLines.push(
      `- Already short ${ownLeg.contracts}× this exact ${fmtMoney(c.strike)}P ${c.expiry} leg.`,
    );
  }
  for (const p of otherLegsInTicker) {
    portfolioLines.push(
      `- Open ${p.contracts}× ${c.ticker} ${fmtMoney(p.strike)}P ${p.expiry}.`,
    );
  }
  if (portfolioLines.length === 0) {
    portfolioLines.push(`- No existing exposure to ${c.ticker}.`);
  }

  const ivRankLine =
    c.ivRank == null
      ? "IV Rank: unavailable"
      : `IV Rank: ${Math.round(c.ivRank * 100)} (${c.ivRankBasis})`;
  const ivPctLine =
    c.ivPercentile == null
      ? "IV Percentile: unavailable"
      : `IV Percentile: ${Math.round(c.ivPercentile * 100)}`;
  const earningsLine = c.earningsInWindow
    ? `Earnings inside the window${c.earningsDate ? ` on ${c.earningsDate}` : ""}.`
    : "No earnings before expiry.";

  const system = [
    "You are Spoke AI, an options-selling coach focused on the wheel strategy.",
    "Given a single short-put candidate and the trader's existing portfolio, return a JSON",
    "object that judges whether this is a good wheel trade.",
    "",
    "Schema (return ONLY this JSON, no prose, no code fences):",
    `{ "verdict": "good_fit" | "mixed" | "avoid",`,
    `  "summary": string (2-4 sentences, plain English, no markdown),`,
    `  "bullets": string[] (3-5 short bullets, each <= 90 chars) }`,
    "",
    "Cover yield quality, IV-rank context, earnings-window risk, delta / assignment risk,",
    "and any concentration overlap with the trader's open positions or share holdings.",
    "Be specific with numbers from the candidate, not generic. Never invent fields.",
  ].join("\n");

  const user = [
    `Candidate: ${c.ticker} ${fmtMoney(c.strike)}P expiring ${c.expiry} (${c.dte} DTE)`,
    `Spot: ${fmtMoney(c.spot)} · Bid: ${fmtMoney(c.bid)} · Premium/contract: ${fmtMoney(c.premiumPerContract)}`,
    `Collateral/contract: ${fmtMoney(c.collateralPerContract)}`,
    `Static return: ${fmtPct(c.staticReturnPct, 2)} · Annualized: ${fmtPct(c.annualizedPct, 1)}`,
    `Delta: ${c.delta.toFixed(2)} · IV: ${fmtFracPct(c.iv, 1)} · ${ivRankLine} · ${ivPctLine}`,
    `Breakeven: ${fmtMoney(c.breakeven)} · OTM cushion: ${fmtPct(c.pctOtm, 1)} · OI: ${c.openInterest}`,
    earningsLine,
    "",
    "Trader portfolio context:",
    ...portfolioLines,
  ].join("\n");

  return { system, user };
}

/**
 * Strict-ish JSON parser for the model's reply. Accepts a raw object that
 * may or may not be wrapped in code fences; throws when the shape is wrong.
 */
export function parseExplainerResponse(raw: string): ExplainerResult {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("explainer response did not contain a JSON object");
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (typeof obj !== "object" || obj === null) {
    throw new Error("explainer response was not an object");
  }
  const o = obj as Record<string, unknown>;
  const verdict = o["verdict"];
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict as Verdict)) {
    throw new Error(`explainer response had invalid verdict: ${String(verdict)}`);
  }
  const summary = o["summary"];
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("explainer response missing summary");
  }
  const bullets = o["bullets"];
  if (
    !Array.isArray(bullets) ||
    bullets.length === 0 ||
    !bullets.every((b) => typeof b === "string" && b.trim().length > 0)
  ) {
    throw new Error("explainer response missing bullets");
  }
  return {
    verdict: verdict as Verdict,
    summary: summary.trim(),
    bullets: bullets.map((b) => (b as string).trim()),
  };
}

/**
 * Deterministic non-LLM fallback used when AI is unavailable, the user is
 * on a tier without the explainer, or the upstream errors.
 */
export function buildFallbackExplanation(input: ExplainerInput): ExplainerResult {
  const { candidate: c, openPositions, shareHoldings } = input;
  const heldShares = shareHoldings
    .filter((h) => h.ticker === c.ticker)
    .reduce((s, h) => s + h.shares, 0);
  const sameTickerLegs = openPositions.filter((p) => p.ticker === c.ticker);

  const bullets: string[] = [
    `Annualized ${fmtPct(c.annualizedPct, 1)} on ${fmtPct(c.pctOtm, 1)} OTM cushion (${c.dte}d to expiry).`,
    `Delta ${c.delta.toFixed(2)} · POP ~${fmtFracPct(1 - Math.abs(c.delta), 0)} from delta proxy.`,
    c.ivRank == null
      ? "IV Rank unavailable — premium quality vs. history can't be ranked."
      : `IV Rank ${Math.round(c.ivRank * 100)} (${c.ivRankBasis}) — ${c.ivRank > 0.5 ? "rich" : "muted"} premium vs. trailing year.`,
    c.earningsInWindow
      ? `Earnings before expiry${c.earningsDate ? ` on ${c.earningsDate}` : ""} — IV is elevated for a reason.`
      : "No earnings before expiry.",
  ];
  if (heldShares >= 100) {
    bullets.push(
      `You already own ${heldShares} shares of ${c.ticker} — selling another put concentrates risk.`,
    );
  } else if (sameTickerLegs.length > 0) {
    bullets.push(
      `${sameTickerLegs.length} open put leg${sameTickerLegs.length === 1 ? "" : "s"} already on ${c.ticker}.`,
    );
  }

  let verdict: Verdict;
  if (c.earningsInWindow || heldShares >= 100) {
    verdict = "avoid";
  } else if (c.annualizedPct >= 25 && (c.ivRank == null || c.ivRank >= 0.4)) {
    verdict = "good_fit";
  } else if (c.annualizedPct >= 15) {
    verdict = "mixed";
  } else {
    verdict = "avoid";
  }

  const summary =
    verdict === "good_fit"
      ? `Strong wheel candidate: ${fmtPct(c.annualizedPct, 1)} annualized with a ${fmtPct(c.pctOtm, 1)} OTM cushion and no earnings inside the window. Delta ${c.delta.toFixed(2)} keeps assignment odds modest while theta does the work over ${c.dte} days.`
      : verdict === "mixed"
        ? `Workable but unremarkable: ${fmtPct(c.annualizedPct, 1)} annualized over ${c.dte} days with a ${fmtPct(c.pctOtm, 1)} cushion. Worth selling only if you're comfortable owning ${c.ticker} at ${fmtMoney(c.strike)}.`
        : c.earningsInWindow
          ? `Avoid for now — earnings land before expiry, so the rich IV is compensation for binary risk. Consider waiting until after the print.`
          : heldShares >= 100
            ? `You already own ${heldShares} shares of ${c.ticker}; stacking another short put doubles down on the same direction. A covered call against your shares is the cleaner wheel move.`
            : `Yield is light (${fmtPct(c.annualizedPct, 1)} annualized) and the setup doesn't stand out. Skip unless you actively want shares at ${fmtMoney(c.strike)}.`;

  return { verdict, summary, bullets };
}

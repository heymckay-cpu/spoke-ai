import { db, positionsTable, type PositionRow } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  buildBreakdown,
  type ConcentrationBreakdown,
} from "@workspace/portfolio";
import { sectorForTicker } from "@workspace/data/sectors";
import { getOptionChain } from "./market";
import {
  computeRollSuggestion,
  RollSuggestionUnavailable,
} from "./roll-suggestion";
import { logger } from "./logger";

export type Verdict = "roll" | "assign" | "close";

export interface AdvisorRollTarget {
  expiry: string;
  strike: number;
  premium: number;
  netCredit: number;
  newAnnualizedYield: number;
  dteFromNow: number;
}

export interface AdvisorContext {
  position: {
    id: number;
    ticker: string;
    strike: number;
    expiry: string;
    premium: number;
    contracts: number;
    dte: number;
  };
  /** Effective per-share cost basis if assigned: strike - net premium per
   *  share collected across the entire chain. E.g. a 200-strike put with
   *  $2.50 of net premium collected gives an effective basis of $197.50. */
  costBasisPerShare: number;
  /** Net premium per share (premium received - close cost) across every leg
   *  in the chain. The raw offset before subtracting from strike. */
  netPremiumPerShare: number;
  totalPremiumCollected: number;
  chainLegs: Array<{
    id: number;
    strike: number;
    expiry: string;
    premium: number;
    contracts: number;
    closePrice: number | null;
    status: "open" | "closed";
  }>;
  quote: {
    spot: number | null;
    currentBid: number | null;
    intrinsic: number | null;
    extrinsic: number | null;
    fetchedAt: string | null;
  };
  rollTargets: AdvisorRollTarget[];
  concentration: {
    totalCar: number;
    tickerCar: number;
    tickerPct: number;
    sector: string;
    sectorCar: number;
    sectorPct: number;
    openPositionsInTicker: number;
  };
  /** assignmentCost = strike * 100 * contracts; what it costs to take assignment. */
  assignmentCostPerShare: number;
  assignmentCostTotal: number;
}

export interface AdvisorVerdict {
  verdict: Verdict;
  summary: string;
  bullets: string[];
  recommendedRoll?: {
    expiry: string;
    strike: number;
  };
}

export interface AdvisorResponse {
  available: boolean;
  context: AdvisorContext;
  verdict: AdvisorVerdict | null;
  /** Reason verdict is null when AI is unavailable. */
  unavailableReason?: string;
  generatedAt: string;
}

// In-memory cache keyed by `${positionId}:${quoteFetchedAt}` so that as long as
// the underlying quote hasn't moved we serve the same recommendation cheaply.
// This intentionally lives in process — a restart is fine, it just regenerates.
const advisorCache = new Map<string, AdvisorResponse>();
const CACHE_MAX = 200;

function cacheKey(positionId: number, quoteFetchedAt: string | null): string {
  return `${positionId}:${quoteFetchedAt ?? "no-quote"}`;
}

export function clearAdvisorCache(): void {
  advisorCache.clear();
}

function dteFromIso(expiry: string): number {
  const exp = new Date(`${expiry}T00:00:00Z`).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.round((exp - Date.now()) / (24 * 60 * 60 * 1000));
}

function annualizedYield(premium: number, strike: number, dte: number): number {
  if (strike <= 0 || dte <= 0) return 0;
  return (premium / strike) * (365 / dte);
}

/**
 * Walk the rolled-from chain to collect every leg from the original (root)
 * down to the current position. Returns rows in chronological order.
 */
async function loadChainLegs(
  current: PositionRow,
): Promise<PositionRow[]> {
  const rows: PositionRow[] = [current];
  const seen = new Set<number>([current.id]);
  let parentId = current.rolledFromId;
  while (parentId != null && !seen.has(parentId)) {
    seen.add(parentId);
    const [parent] = await db
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.id, parentId));
    if (!parent) break;
    rows.unshift(parent);
    parentId = parent.rolledFromId;
  }
  return rows;
}

interface BuildContextDeps {
  /** Optional override so tests can inject a deterministic chain provider. */
  getOptionChainFn?: typeof getOptionChain;
}

/**
 * Assemble the full decision context for the advisor: cost basis from the
 * complete chain, latest quote, top 3 candidate roll targets (same/-5%/-10%
 * strikes on the next monthly), and the trader's concentration picture.
 */
export async function buildAdvisorContext(
  positionId: number,
  userId: string,
  deps: BuildContextDeps = {},
): Promise<AdvisorContext | null> {
  const getChain = deps.getOptionChainFn ?? getOptionChain;

  const [row] = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.id, positionId), eq(positionsTable.userId, userId)));
  if (!row) return null;

  const chainRows = await loadChainLegs(row);

  // Cost basis = sum of (premium received - close cost) per share across every
  // leg, weighted by contracts. We track per-share so the LLM can reason in
  // the same units the user sees.
  let totalPremiumDollars = 0;
  let totalCloseDollars = 0;
  let totalContractDollarBase = 0; // contracts*100, for share-weighted normalisation
  for (const leg of chainRows) {
    const shares = leg.contracts * 100;
    totalContractDollarBase += shares;
    totalPremiumDollars += leg.premium * shares;
    if (leg.closedAt && leg.closePrice != null) {
      totalCloseDollars += leg.closePrice * shares;
    }
  }
  const totalPremiumCollected = totalPremiumDollars - totalCloseDollars;
  const netPremiumPerShare =
    totalContractDollarBase > 0
      ? (totalPremiumDollars - totalCloseDollars) / totalContractDollarBase
      : 0;
  // Effective assignment basis = strike - net premium offset per share.
  // This is what the user actually pays per share if assigned, in the units
  // shown on the dashboard ("Cost basis / sh").
  const costBasisPerShare = row.strike - netPremiumPerShare;

  // Quote — use the option chain on the current expiry so we get a fetchedAt
  // suitable for cache keying. Best effort: a missing chain just means the
  // quote portion is blank, the rest of the context is still useful.
  let spot: number | null = null;
  let currentBid: number | null = null;
  let fetchedAt: string | null = null;
  try {
    const chain = await getChain(row.ticker, row.expiry);
    if (chain) {
      spot = chain.spot;
      fetchedAt = chain.fetchedAt;
      const match = chain.puts.find(
        (p) => Math.abs(p.strike - row.strike) < 0.01,
      );
      if (match) {
        const bid = match.bid > 0 ? match.bid : match.lastPrice;
        if (bid > 0) currentBid = bid;
      }
    }
  } catch (err) {
    logger.warn({ err, positionId: row.id }, "advisor: chain fetch failed");
  }

  const intrinsic =
    spot != null ? Math.max(0, row.strike - spot) : null;
  const extrinsic =
    currentBid != null && intrinsic != null
      ? Math.max(0, currentBid - intrinsic)
      : null;

  // Top roll targets come from the same helper the user-facing
  // /roll-suggestion endpoint uses, so the advisor's recommendations always
  // match the smart-roll dialog the user sees.
  const rollTargets: AdvisorRollTarget[] = [];
  try {
    const suggestion = await computeRollSuggestion(row, {
      kinds: ["same", "down5", "down10"],
    });
    const closeCostPerShare = currentBid ?? 0;
    for (const opt of suggestion.options) {
      if (opt.premium <= 0) continue;
      rollTargets.push({
        expiry: suggestion.suggestedExpiry,
        strike: opt.strike,
        premium: opt.premium,
        netCredit:
          (opt.premium - closeCostPerShare) * 100 * row.contracts,
        newAnnualizedYield: annualizedYield(
          opt.premium,
          opt.strike,
          suggestion.dteFromNow,
        ),
        dteFromNow: suggestion.dteFromNow,
      });
    }
  } catch (err) {
    if (!(err instanceof RollSuggestionUnavailable)) {
      logger.warn(
        { err, positionId: row.id },
        "advisor: roll target fetch failed",
      );
    }
  }

  // Concentration: pull every open position to compute shares of CAR.
  const openRows = await db
    .select({
      ticker: positionsTable.ticker,
      strike: positionsTable.strike,
      contracts: positionsTable.contracts,
      closedAt: positionsTable.closedAt,
    })
    .from(positionsTable)
    .where(eq(positionsTable.userId, userId));
  const openLikes = openRows
    .filter((p) => p.closedAt == null)
    .map((p) => ({
      ticker: p.ticker,
      strike: p.strike,
      contracts: p.contracts,
      status: "open" as const,
    }));
  const breakdown: ConcentrationBreakdown = buildBreakdown(openLikes);
  const tickerKey = row.ticker.toUpperCase();
  const sector = sectorForTicker(tickerKey);
  const tickerCar = breakdown.byTicker.get(tickerKey) ?? 0;
  const sectorCar = breakdown.bySector.get(sector) ?? 0;
  const openPositionsInTicker = openLikes.filter(
    (p) => p.ticker.toUpperCase() === tickerKey,
  ).length;

  const assignmentCostPerShare = row.strike;
  const assignmentCostTotal = row.strike * 100 * row.contracts;

  const ctx: AdvisorContext = {
    position: {
      id: row.id,
      ticker: row.ticker,
      strike: row.strike,
      expiry: row.expiry,
      premium: row.premium,
      contracts: row.contracts,
      dte: dteFromIso(row.expiry),
    },
    costBasisPerShare,
    netPremiumPerShare,
    totalPremiumCollected,
    chainLegs: chainRows.map((leg) => ({
      id: leg.id,
      strike: leg.strike,
      expiry: leg.expiry,
      premium: leg.premium,
      contracts: leg.contracts,
      closePrice: leg.closePrice,
      status: leg.closedAt ? "closed" : "open",
    })),
    quote: {
      spot,
      currentBid,
      intrinsic,
      extrinsic,
      fetchedAt,
    },
    rollTargets,
    concentration: {
      totalCar: breakdown.totalCar,
      tickerCar,
      tickerPct: breakdown.totalCar > 0 ? tickerCar / breakdown.totalCar : 0,
      sector,
      sectorCar,
      sectorPct: breakdown.totalCar > 0 ? sectorCar / breakdown.totalCar : 0,
      openPositionsInTicker,
    },
    assignmentCostPerShare,
    assignmentCostTotal,
  };
  return ctx;
}

const SYSTEM_PROMPT = `You are an expert options-trading advisor for the wheel \
strategy. You will be given the full decision context for a single sold-put \
position and you must recommend exactly one of three actions: "roll", "assign", \
or "close".

Reply with ONLY a JSON object matching this schema, no markdown, no prose:
{
  "verdict": "roll" | "assign" | "close",
  "summary": "1 sentence headline (<=140 chars)",
  "bullets": ["2-4 short rationale bullets, each referencing concrete numbers from the context"],
  "recommendedRoll": { "expiry": "YYYY-MM-DD", "strike": number }   // OMIT unless verdict is "roll"
}

Guidance:
- Prefer "roll" when there's a candidate roll target with positive netCredit \
and meaningful added DTE.
- Prefer "assign" when the trader's effective cost basis (costBasisPerShare) \
is comfortably below the current spot, the position is deep ITM, and concentration \
isn't already too high in the ticker.
- Prefer "close" when net credit on every roll is poor, intrinsic dominates, \
and assignment would over-concentrate the portfolio.
- When recommending "roll", recommendedRoll MUST be one of the rollTargets in \
the input.`;

export interface RunAdvisorOptions {
  /** Override the LLM call for tests / fallback. */
  llmCall?: (context: AdvisorContext) => Promise<string>;
}

function parseLlmJson(raw: string): AdvisorVerdict {
  // Models occasionally wrap responses in ```json fences despite instructions.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Advisor response was not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj["verdict"];
  if (verdict !== "roll" && verdict !== "assign" && verdict !== "close") {
    throw new Error(`Advisor returned unknown verdict: ${String(verdict)}`);
  }
  const summary = obj["summary"];
  if (typeof summary !== "string" || summary.length === 0) {
    throw new Error("Advisor response missing summary");
  }
  const rawBullets = obj["bullets"];
  if (!Array.isArray(rawBullets) || rawBullets.length === 0) {
    throw new Error("Advisor response missing bullets");
  }
  const bullets = rawBullets
    .map((b) => (typeof b === "string" ? b : ""))
    .filter((b) => b.length > 0);
  if (bullets.length === 0) {
    throw new Error("Advisor response had no usable bullets");
  }

  const result: AdvisorVerdict = { verdict, summary, bullets };
  const rec = obj["recommendedRoll"];
  if (verdict === "roll") {
    if (!rec || typeof rec !== "object") {
      throw new Error("roll verdict requires recommendedRoll");
    }
    const recObj = rec as Record<string, unknown>;
    const expiry = recObj["expiry"];
    const strike = recObj["strike"];
    if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      throw new Error("recommendedRoll.expiry must be a YYYY-MM-DD string");
    }
    if (typeof strike !== "number" || !Number.isFinite(strike) || strike <= 0) {
      throw new Error("recommendedRoll.strike must be a positive number");
    }
    result.recommendedRoll = { expiry, strike };
  }
  return result;
}

export { parseLlmJson };

async function callAnthropic(context: AdvisorContext): Promise<string> {
  // Lazy-load the Anthropic client. The integration module throws at import
  // time when AI_INTEGRATIONS_ANTHROPIC_* env vars are missing, so deferring
  // the import here keeps the rest of the API server fully functional in
  // setups without AI credentials — the advisor route just falls back to
  // raw numbers via getAdvisor's try/catch.
  const { anthropic } = await import("@workspace/integrations-anthropic-ai");
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Decision context (JSON):\n\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  });
  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Advisor LLM returned no text content");
  }
  return block.text;
}

export async function runAdvisor(
  context: AdvisorContext,
  opts: RunAdvisorOptions = {},
): Promise<AdvisorVerdict> {
  const caller = opts.llmCall ?? callAnthropic;
  const raw = await caller(context);
  const verdict = parseLlmJson(raw);
  // Hard-enforce that a "roll" recommendation matches one of the candidates
  // we actually showed the model. Otherwise the deep-link would prefill a
  // strike/expiry that isn't listed and the trader can't actually execute it.
  if (verdict.verdict === "roll" && verdict.recommendedRoll) {
    const rec = verdict.recommendedRoll;
    const matches = context.rollTargets.some(
      (t) =>
        t.expiry === rec.expiry && Math.abs(t.strike - rec.strike) < 0.0001,
    );
    if (!matches) {
      throw new Error(
        `recommendedRoll ${rec.expiry}@${rec.strike} not in rollTargets`,
      );
    }
  }
  return verdict;
}

export interface GetAdvisorOptions extends BuildContextDeps, RunAdvisorOptions {
  /** Skip the in-memory cache. */
  noCache?: boolean;
}

export async function getAdvisor(
  positionId: number,
  userId: string,
  opts: GetAdvisorOptions = {},
): Promise<AdvisorResponse | null> {
  const context = await buildAdvisorContext(positionId, userId, opts);
  if (!context) return null;

  const key = cacheKey(positionId, context.quote.fetchedAt);
  if (!opts.noCache) {
    const cached = advisorCache.get(key);
    if (cached) return cached;
  }

  let verdict: AdvisorVerdict | null = null;
  let unavailableReason: string | undefined;
  try {
    verdict = await runAdvisor(context, opts);
  } catch (err) {
    unavailableReason =
      err instanceof Error ? err.message : "Unknown advisor error";
    logger.warn(
      { err, positionId },
      "advisor: LLM call failed, falling back to raw numbers",
    );
  }

  const response: AdvisorResponse = {
    available: verdict != null,
    context,
    verdict,
    unavailableReason,
    generatedAt: new Date().toISOString(),
  };

  if (!opts.noCache && verdict != null) {
    if (advisorCache.size >= CACHE_MAX) {
      // Bound the cache: nuke the oldest entry (insertion order).
      const oldestKey = advisorCache.keys().next().value;
      if (oldestKey) advisorCache.delete(oldestKey);
    }
    advisorCache.set(key, response);
  }

  return response;
}

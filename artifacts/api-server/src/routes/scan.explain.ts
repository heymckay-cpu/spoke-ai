import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  scanSnapshotTable,
  candidateExplanationsTable,
  positionsTable,
  holdingsTable,
  type CandidateExplanationRow,
} from "@workspace/db";
import { ExplainCandidateBody, ExplainCandidateResponse } from "@workspace/api-zod";
import {
  buildExplainerPrompt,
  buildFallbackExplanation,
  parseExplainerResponse,
  EXPLAIN_MODEL,
  type ExplainerInput,
  type ExplainerResult,
  type Verdict,
} from "../lib/ai/explain";
import { hasCapability } from "@workspace/tiers";
import { getCurrentTier } from "../middlewares/tier";
import type { CandidateOut } from "../lib/screener";
import { getCachedScan } from "../lib/scanRunner";

const router: IRouter = Router();

interface SnapshotLookup {
  snapshotId: number;
  candidate: CandidateOut;
}

/**
 * Find a candidate by (ticker, strike, expiry) inside the most recent
 * persisted scan snapshot. Returns the snapshot id (used as the cache key)
 * along with the candidate row, or null when there is no match.
 */
async function findLatestCandidate(
  ticker: string,
  strike: number,
  expiry: string,
): Promise<SnapshotLookup | null> {
  // Prefer the in-memory cache when present so the explanation lines up
  // with whatever the dashboard is currently rendering. The cache lacks a
  // db id, so fall back to the latest snapshot row to get one.
  const tickerU = ticker.toUpperCase();
  const matches = (cands: unknown): CandidateOut | null => {
    if (!Array.isArray(cands)) return null;
    return (
      (cands as CandidateOut[]).find(
        (c) => c.ticker === tickerU && c.strike === strike && c.expiry === expiry,
      ) ?? null
    );
  };

  const cached = getCachedScan();
  const [row] = await db
    .select()
    .from(scanSnapshotTable)
    .orderBy(desc(scanSnapshotTable.scannedAt))
    .limit(1);
  if (cached) {
    const c = matches(cached.result.candidates);
    if (c && row) {
      return { snapshotId: row.id, candidate: c };
    }
  }
  if (!row) return null;
  const c = matches(row.candidates);
  if (!c) return null;
  return { snapshotId: row.id, candidate: c };
}

async function loadPortfolioSnapshot(): Promise<{
  openPositions: ExplainerInput["openPositions"];
  shareHoldings: ExplainerInput["shareHoldings"];
}> {
  // The positions table tracks open vs. closed via `closedAt`; we filter
  // in JS to keep this single round-trip readable.
  const [positions, holdings] = await Promise.all([
    db
      .select({
        ticker: positionsTable.ticker,
        strike: positionsTable.strike,
        expiry: positionsTable.expiry,
        contracts: positionsTable.contracts,
        closedAt: positionsTable.closedAt,
      })
      .from(positionsTable),
    db
      .select({
        ticker: holdingsTable.ticker,
        shares: holdingsTable.shares,
        avgCost: holdingsTable.avgCost,
      })
      .from(holdingsTable),
  ]);
  return {
    openPositions: positions
      .filter((p) => p.closedAt == null)
      .map(({ ticker, strike, expiry, contracts }) => ({ ticker, strike, expiry, contracts })),
    shareHoldings: holdings,
  };
}

function rowToResult(row: CandidateExplanationRow): ExplainerResult {
  return {
    verdict: row.verdict as Verdict,
    summary: row.summary,
    bullets: row.bullets as string[],
  };
}

router.post("/scan/explain", async (req, res): Promise<void> => {
  const parsed = ExplainCandidateBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { ticker, strike, expiry, regenerate } = parsed.data;

  const lookup = await findLatestCandidate(ticker, strike, expiry);
  if (!lookup) {
    res.status(404).json({
      error: `No candidate ${ticker.toUpperCase()} ${strike}P ${expiry} in the latest scan snapshot.`,
    });
    return;
  }
  const { snapshotId, candidate } = lookup;

  // Cache lookup keyed by (snapshot, ticker, strike, expiry).
  if (!regenerate) {
    const [cached] = await db
      .select()
      .from(candidateExplanationsTable)
      .where(
        and(
          eq(candidateExplanationsTable.snapshotId, snapshotId),
          eq(candidateExplanationsTable.ticker, candidate.ticker),
          eq(candidateExplanationsTable.strike, candidate.strike),
          eq(candidateExplanationsTable.expiry, candidate.expiry),
        ),
      )
      .limit(1);
    if (cached) {
      const result = rowToResult(cached);
      res.json(
        ExplainCandidateResponse.parse({
          ticker: candidate.ticker,
          strike: candidate.strike,
          expiry: candidate.expiry,
          verdict: result.verdict,
          summary: result.summary,
          bullets: result.bullets,
          source: cached.source === "fallback" ? "fallback" : "cache",
          model: cached.model,
          generatedAt: cached.createdAt.toISOString(),
          cached: true,
        }),
      );
      return;
    }
  }

  // Tier gate. The fallback path is intentionally kept inline so unentitled
  // users still see useful copy rather than a wall.
  const tier = await getCurrentTier(req);
  const aiEntitled = hasCapability(tier, "ai.explainer");

  const portfolio = await loadPortfolioSnapshot();
  const explainerInput: ExplainerInput = {
    candidate,
    openPositions: portfolio.openPositions,
    shareHoldings: portfolio.shareHoldings,
  };

  let result: ExplainerResult;
  let source: "llm" | "fallback" = "fallback";
  let model = "fallback";

  if (aiEntitled) {
    try {
      const { anthropic } = await import("@workspace/integrations-anthropic-ai");
      const prompt = buildExplainerPrompt(explainerInput);
      const message = await anthropic.messages.create({
        model: EXPLAIN_MODEL,
        max_tokens: 8192,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const block = message.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      result = parseExplainerResponse(text);
      source = "llm";
      model = EXPLAIN_MODEL;
    } catch (err) {
      req.log?.warn?.({ err }, "explain candidate: anthropic call failed; using fallback");
      result = buildFallbackExplanation(explainerInput);
    }
  } else {
    result = buildFallbackExplanation(explainerInput);
  }

  // Cache LLM responses only — the fallback is cheap to recompute and
  // can change as the user's portfolio evolves.
  const generatedAt = new Date();
  if (source === "llm") {
    try {
      await db
        .insert(candidateExplanationsTable)
        .values({
          snapshotId,
          ticker: candidate.ticker,
          strike: candidate.strike,
          expiry: candidate.expiry,
          verdict: result.verdict,
          summary: result.summary,
          bullets: result.bullets,
          model,
          source,
          createdAt: generatedAt,
        })
        .onConflictDoUpdate({
          target: [
            candidateExplanationsTable.snapshotId,
            candidateExplanationsTable.ticker,
            candidateExplanationsTable.strike,
            candidateExplanationsTable.expiry,
          ],
          set: {
            verdict: result.verdict,
            summary: result.summary,
            bullets: result.bullets,
            model,
            source,
            createdAt: generatedAt,
          },
        });
    } catch (err) {
      req.log?.warn?.({ err }, "explain candidate: failed to persist explanation cache");
    }
  }

  res.json(
    ExplainCandidateResponse.parse({
      ticker: candidate.ticker,
      strike: candidate.strike,
      expiry: candidate.expiry,
      verdict: result.verdict,
      summary: result.summary,
      bullets: result.bullets,
      source,
      model,
      generatedAt: generatedAt.toISOString(),
      cached: false,
    }),
  );
});

export default router;

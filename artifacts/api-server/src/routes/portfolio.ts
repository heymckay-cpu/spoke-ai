import { Router, type IRouter } from "express";
import { db, positionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { GetPortfolioCorrelationResponse } from "@workspace/api-zod";
import { getPortfolioCorrelation } from "../lib/correlation";
import { getUserId } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Correlation risk overlay across the user's open positions, optionally
// including a candidate ticker (for the drawer warning). Collateral-weighted:
// a CSP's exposure is strike × 100 × contracts.
router.get("/portfolio/correlation", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const candidateRaw = String(req.query.candidate ?? "").trim().toUpperCase();
  const candidate =
    candidateRaw && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(candidateRaw) ? candidateRaw : null;

  const open = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.userId, userId), isNull(positionsTable.closedAt)));

  try {
    const report = await getPortfolioCorrelation({
      positions: open.map((p) => ({
        ticker: p.ticker,
        collateral: p.strike * 100 * p.contracts,
      })),
      candidateTicker: candidate,
    });
    res.json(GetPortfolioCorrelationResponse.parse(report));
  } catch (err) {
    logger.error({ err, userId }, "portfolio correlation failed");
    res.status(502).json({ error: "Correlation data is currently unavailable" });
  }
});

export default router;

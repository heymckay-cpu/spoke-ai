import { Router, type IRouter } from "express";
import { GetQuiverSignalsResponse } from "@workspace/api-zod";
import { getQuiverSignals } from "../lib/quiver/signals";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Aggregated Quiver alternative-data signals for one ticker. The underlying
// data is global (not per-user), slow-moving, and cached for 12h server-side,
// so this endpoint is cheap to call from the candidate drawer. When the
// server has no QUIVER_API_KEY the response is `configured: false` and the
// client hides the section entirely.
router.get("/quiver/:ticker", async (req, res): Promise<void> => {
  const ticker = String(req.params.ticker ?? "")
    .trim()
    .toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    res.status(400).json({ error: "ticker is required" });
    return;
  }
  try {
    const signals = await getQuiverSignals(ticker);
    res.json(GetQuiverSignalsResponse.parse(signals));
  } catch (err) {
    logger.error({ err, ticker }, "quiver signals failed");
    res.status(502).json({ error: "Quiver data is currently unavailable" });
  }
});

export default router;

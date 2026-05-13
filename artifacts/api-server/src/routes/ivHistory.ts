import { Router, type IRouter } from "express";
import { GetIvHistoryResponse } from "@workspace/api-zod";
import { loadIvSeries, MIN_HISTORY_DAYS } from "../lib/iv/rank";

const router: IRouter = Router();

router.get("/iv/history/:ticker", async (req, res): Promise<void> => {
  const ticker = String(req.params.ticker ?? "").toUpperCase();
  if (!ticker) {
    res.status(400).json({ error: "ticker is required" });
    return;
  }
  const points = await loadIvSeries(ticker);
  const basis: "real" | "provisional" =
    points.length >= MIN_HISTORY_DAYS ? "real" : "provisional";
  res.json(
    GetIvHistoryResponse.parse({
      ticker,
      basis,
      sampleSize: points.length,
      points,
    }),
  );
});

export default router;

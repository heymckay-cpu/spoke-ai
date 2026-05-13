import { Router, type IRouter } from "express";
import { GetSectorsQueryParams, GetSectorsResponse } from "@workspace/api-zod";
import { getSectors } from "../lib/sectorResolver";

const router: IRouter = Router();

router.get("/sectors", async (req, res): Promise<void> => {
  const parsed = GetSectorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tickers = parsed.data.tickers
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tickers.length === 0) {
    res.json(GetSectorsResponse.parse({ sectors: {} }));
    return;
  }
  const sectors = await getSectors(tickers);
  res.json(GetSectorsResponse.parse({ sectors }));
});

export default router;

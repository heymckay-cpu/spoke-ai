import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getProviderName, isLiveProvider } from "../lib/market";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    provider: getProviderName(),
    live: isLiveProvider(),
  });
  res.json(data);
});

export default router;

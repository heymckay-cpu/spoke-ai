import { Router, type IRouter } from "express";
import { runDigestSweep } from "../lib/digest";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// External-cron trigger for the daily digest sweep. Deliberately NOT in the
// OpenAPI spec and mounted BEFORE requireUser: it is machine-to-machine,
// authenticated by a shared secret instead of a Clerk session.
//
// Why it exists: on Replit Autoscale the in-process scheduler only ticks
// while an instance is awake, so a Scheduled Deployment (or any external
// cron) POSTs here to guarantee delivery. The sweep is idempotent — a
// conditional claim on settings.last_digest_at means concurrent triggers
// never double-send.
//
// Setup: set DIGEST_CRON_SECRET, then cron:
//   curl -X POST -H "x-digest-secret: $DIGEST_CRON_SECRET" https://<app>/api/digests/run
router.post("/digests/run", async (req, res): Promise<void> => {
  const secret = process.env.DIGEST_CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: "DIGEST_CRON_SECRET is not configured" });
    return;
  }
  const provided = req.get("x-digest-secret") ?? "";
  if (provided !== secret) {
    res.status(401).json({ error: "invalid digest secret" });
    return;
  }
  try {
    const result = await runDigestSweep();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "digest run endpoint failed");
    res.status(500).json({ error: "digest sweep failed" });
  }
});

export default router;

import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startAlertScheduler } from "./lib/alerts";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Background scan for assignment-risk / near-expiry alerts on tracked positions.
// Runs every 15 minutes; emits at most one alert per condition per position.
const ALERT_INTERVAL_MIN = Number(process.env["ALERT_INTERVAL_MIN"] ?? 15);
startAlertScheduler(Number.isFinite(ALERT_INTERVAL_MIN) && ALERT_INTERVAL_MIN > 0 ? ALERT_INTERVAL_MIN : 15);

export default app;

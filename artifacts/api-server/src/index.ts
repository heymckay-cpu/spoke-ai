import app from "./app";
import { logger } from "./lib/logger";
import { setMarketProvider } from "./lib/market";
import { createPolygonProvider } from "./lib/polygonProvider";
import { startScanScheduler } from "./lib/scheduler";

// Optionally swap the default Yahoo provider for a live one (e.g. Polygon).
// Yahoo zeros bid/ask after hours; Polygon serves live quotes during RTH so
// the chain page's "stale data" banner only fires when the market is truly
// closed. Configure with MARKET_PROVIDER=polygon and POLYGON_API_KEY=<key>.
const marketProviderName = (process.env["MARKET_PROVIDER"] ?? "").toLowerCase();
if (marketProviderName === "polygon") {
  const apiKey = process.env["POLYGON_API_KEY"];
  if (!apiKey) {
    logger.error(
      "MARKET_PROVIDER=polygon but POLYGON_API_KEY is not set; falling back to default Yahoo provider",
    );
  } else {
    setMarketProvider(createPolygonProvider(apiKey), { live: true });
    logger.info("Using Polygon market data provider");
  }
} else if (marketProviderName && marketProviderName !== "yahoo") {
  logger.warn(
    { provider: marketProviderName },
    "Unknown MARKET_PROVIDER value; using default Yahoo provider",
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startScanScheduler();
});

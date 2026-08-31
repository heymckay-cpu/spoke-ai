// Thin HTTP client for the Quiver Quantitative REST API.
//
// Auth is a static token in the `Authorization: Token <key>` header,
// configured via QUIVER_API_KEY. All consumers must tolerate the key being
// absent — the feature degrades to "not configured" rather than erroring,
// so the app runs fine without a Quiver subscription.
//
// Endpoint shapes follow Quiver's official python-api client
// (github.com/Quiver-Quantitative/python-api): base `/beta`, per-ticker
// historical endpoints plus `live/insiders?ticker=`.

import { logger } from "../logger";

const QUIVER_BASE = "https://api.quiverquant.com/beta";
const REQUEST_TIMEOUT_MS = 10_000;

export function isQuiverConfigured(): boolean {
  return Boolean(process.env.QUIVER_API_KEY);
}

export class QuiverNotConfiguredError extends Error {
  constructor() {
    super("QUIVER_API_KEY is not set");
    this.name = "QuiverNotConfiguredError";
  }
}

/**
 * GET a Quiver endpoint and parse the JSON body. `pathAndQuery` starts with
 * `/`, e.g. `/historical/congresstrading/AAPL`.
 *
 * Throws on network errors, timeouts, non-2xx responses, and unparseable
 * bodies — callers that aggregate multiple datasets catch per-dataset so a
 * single failing endpoint degrades to a missing section, not a failed scan.
 */
export async function quiverGet<T>(pathAndQuery: string): Promise<T> {
  const apiKey = process.env.QUIVER_API_KEY;
  if (!apiKey) throw new QuiverNotConfiguredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${QUIVER_BASE}${pathAndQuery}`, {
      headers: {
        accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `quiver ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`quiver request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a per-ticker dataset, returning null (and logging) on any failure so
 * aggregation can continue with the sections that did load.
 */
export async function quiverGetOrNull<T>(
  pathAndQuery: string,
  dataset: string,
): Promise<T | null> {
  try {
    return await quiverGet<T>(pathAndQuery);
  } catch (err) {
    if (err instanceof QuiverNotConfiguredError) throw err;
    logger.warn({ err, dataset, pathAndQuery }, "quiver: dataset fetch failed");
    return null;
  }
}

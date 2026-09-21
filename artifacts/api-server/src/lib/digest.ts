// Daily email digest: per-user scheduled screener run + morning email with
// the top candidates and their Quiver signals.
//
// Firing model (autoscale-safe): `runDigestSweep` is idempotent and cheap to
// call repeatedly. Each enabled user is "due" once per UTC weekday after
// their chosen hour; a conditional UPDATE on settings.last_digest_at claims
// the send so concurrent sweeps (in-process timer + external cron hitting
// POST /digests/run) can never double-send. On Replit Autoscale the
// in-process timer only ticks while an instance is awake, so production
// setups should also point an external cron at the trigger endpoint.

import { db, settingsTable } from "@workspace/db";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { hasCapability, isTier } from "@workspace/tiers";
import { runScreener, type CandidateOut } from "./screener";
import { getSettings } from "./settingsStore";
import { setCachedScanForUser } from "./scanRunner";
import { scanSnapshotTable } from "@workspace/db";
import { getQuiverSignals } from "./quiver/signals";
import { isQuiverConfigured } from "./quiver/client";
import { isEmailConfigured, sendEmail } from "./email";
import { getNotificationEmail } from "./userEmail";
import { buildActionItems, type ActionItem } from "./digestActions";
import { logger } from "./logger";

export interface DigestSweepResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

const DIGEST_CANDIDATE_COUNT = 5;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Weekdays only — a digest of Friday's stale chain data is Saturday noise. */
export function isDigestDay(now: Date): boolean {
  const day = now.getUTCDay();
  return day >= 1 && day <= 5;
}

export function isDue(
  now: Date,
  digestHourUtc: number,
  lastDigestAt: Date | null,
): boolean {
  if (!isDigestDay(now)) return false;
  if (now.getUTCHours() < digestHourUtc) return false;
  if (lastDigestAt && lastDigestAt >= startOfUtcDay(now)) return false;
  return true;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const money = (n: number): string => `$${n.toFixed(2)}`;
// Screener percent fields (annualizedPct, staticReturnPct) are already in
// percent units (49.2 = 49.2%) — mirror the web's fmtPct, no re-scaling.
const pct = (n: number, d = 1): string => `${n.toFixed(d)}%`;

export interface DigestCandidate extends CandidateOut {
  quiverScore?: number | null;
}

export function buildDigestHtml(args: {
  candidates: DigestCandidate[];
  tickersScanned: number;
  appUrl: string;
  dateLabel: string;
  actionItems?: ActionItem[];
  effectiveLine?: string | null;
}): { subject: string; html: string; text: string } {
  const { candidates, tickersScanned, appUrl, dateLabel } = args;
  const actionItems = args.actionItems ?? [];
  const effectiveLine = args.effectiveLine ?? null;
  const top = candidates.slice(0, DIGEST_CANDIDATE_COUNT);

  const subject =
    top.length > 0
      ? `Spoke.ai digest — ${top[0].ticker} ${money(top[0].strike)}P tops today's ${top.length} candidates`
      : `Spoke.ai digest — no candidates matched today`;

  const rows = top
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 10px;font-weight:600;">${esc(c.ticker)}</td>
        <td style="padding:8px 10px;text-align:right;">${money(c.strike)}</td>
        <td style="padding:8px 10px;text-align:right;">${esc(c.expiry)} (${c.dte}d)</td>
        <td style="padding:8px 10px;text-align:right;">${money(c.bid)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;">${pct(c.annualizedPct)}</td>
        <td style="padding:8px 10px;text-align:right;">${c.ivRank != null ? Math.round(c.ivRank * 100) : "—"}</td>
        <td style="padding:8px 10px;text-align:right;">${c.quiverScore != null ? Math.round(c.quiverScore) : "—"}</td>
        <td style="padding:8px 10px;text-align:center;">${c.earningsInWindow ? "⚠️" : ""}${c.macroEvent ? "🏛" : ""}</td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
    <h2 style="margin:16px 0 4px;">Your wheel candidates — ${esc(dateLabel)}</h2>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">
      Scanned ${tickersScanned} tickers with your screener settings.
      ${top.length > 0 ? `Top ${top.length} by annualized premium:` : "Nothing cleared your filters today."}
    </p>
    ${
      top.length > 0
        ? `<table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e5e5;">
      <thead>
        <tr style="background:#f6f6f6;text-align:right;">
          <th style="padding:8px 10px;text-align:left;">Ticker</th>
          <th style="padding:8px 10px;">Strike</th>
          <th style="padding:8px 10px;">Expiry</th>
          <th style="padding:8px 10px;">Bid</th>
          <th style="padding:8px 10px;">Ann %</th>
          <th style="padding:8px 10px;">IV Rk</th>
          <th style="padding:8px 10px;">Quiver</th>
          <th style="padding:8px 10px;">Risk</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
        : ""
    }
    ${
      actionItems.length > 0 || effectiveLine
        ? `<h3 style="margin:20px 0 6px;">Your positions — what needs attention</h3>
    ${effectiveLine ? `<p style="margin:0 0 8px;color:#555;font-size:13px;">${esc(effectiveLine)}</p>` : ""}
    ${
      actionItems.length > 0
        ? `<ul style="margin:0 0 8px;padding-left:18px;font-size:14px;line-height:1.6;">
      ${actionItems
        .map(
          (item) =>
            `<li style="margin:4px 0;">${item.severity === "action" ? "🔴" : item.severity === "watch" ? "🟡" : "ℹ️"} ${esc(item.text)}</li>`,
        )
        .join("")}
    </ul>`
        : `<p style="margin:0 0 8px;color:#555;font-size:13px;">Nothing needs a decision today — open positions are healthy.</p>`
    }`
        : ""
    }
    <p style="margin:16px 0;">
      <a href="${appUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px;">
        Open the dashboard
      </a>
    </p>
    <p style="color:#888;font-size:12px;line-height:1.5;">
      Risk flags: ⚠️ earnings before expiry, 🏛 FOMC/CPI inside the window —
      premium is rich for a reason on both. Quiver scores are an activity
      tilt from congressional/insider/contract data (50 = neutral) —
      disclosures lag the trades, sometimes by weeks.
      Nothing here is investment advice; log takes and passes in your journal
      so the forward test stays honest.
    </p>
  </div>`;

  const actionText =
    actionItems.length > 0
      ? "\n\nNeeds attention:\n" + actionItems.map((i) => `- ${i.text}`).join("\n")
      : "";
  const text =
    top.length > 0
      ? top
          .map(
            (c) =>
              `${c.ticker} ${money(c.strike)}P ${c.expiry} — bid ${money(c.bid)}, ann ${pct(c.annualizedPct)}${c.earningsInWindow ? " (earnings in window)" : ""}`,
          )
          .join("\n")
      : "No candidates matched your filters today.";

  return { subject, html, text: text + actionText };
}

/** Run the user's screener exactly like POST /scan does, warming their cache. */
async function runScanForUser(userId: string): Promise<{
  candidates: CandidateOut[];
  tickersScanned: number;
}> {
  const cfg = await getSettings(userId);
  const result = await runScreener(cfg);
  setCachedScanForUser(userId, result, cfg.cacheTtlMinutes * 60 * 1000);
  try {
    await db.insert(scanSnapshotTable).values({
      userId,
      scannedAt: result.scannedAt ? new Date(result.scannedAt) : new Date(),
      candidates: result.candidates,
      errors: result.errors,
      tickersScanned: result.tickersScanned,
      tickersWithCandidate: result.tickersWithCandidate,
      hiddenByEarningsCount: result.hiddenByEarningsCount,
    });
  } catch (err) {
    logger.warn({ err, userId }, "digest: failed to persist scan snapshot");
  }
  return { candidates: result.candidates, tickersScanned: result.tickersScanned };
}

async function enrichWithQuiver(candidates: CandidateOut[]): Promise<DigestCandidate[]> {
  const top = candidates.slice(0, DIGEST_CANDIDATE_COUNT);
  if (!isQuiverConfigured()) return top;
  return Promise.all(
    top.map(async (c) => {
      try {
        const signals = await getQuiverSignals(c.ticker);
        return { ...c, quiverScore: signals.score };
      } catch {
        return { ...c, quiverScore: null };
      }
    }),
  );
}

async function sendDigestForUser(userId: string, now: Date): Promise<boolean> {
  const to = await getNotificationEmail(userId);
  if (!to) {
    logger.warn({ userId }, "digest: no email address resolvable, skipping");
    return false;
  }
  const scan = await runScanForUser(userId);
  const candidates = await enrichWithQuiver(scan.candidates);
  // Best-effort: the action section should never sink the whole digest.
  let actionItems: ActionItem[] = [];
  let effectiveLine: string | null = null;
  try {
    const actions = await buildActionItems(userId);
    actionItems = actions.items;
    effectiveLine = actions.effectiveLine;
  } catch (err) {
    logger.warn({ err, userId }, "digest: action items failed");
  }
  const appUrl = process.env.APP_URL ?? "https://spoke-ai.replit.app/dashboard";
  const dateLabel = now.toISOString().slice(0, 10);
  const { subject, html, text } = buildDigestHtml({
    candidates,
    tickersScanned: scan.tickersScanned,
    appUrl,
    dateLabel,
    actionItems,
    effectiveLine,
  });
  return sendEmail({ to, subject, html, text });
}

/**
 * One sweep over all users: claim + send every due digest. Idempotent —
 * safe to call from the in-process timer and an external cron concurrently.
 */
export async function runDigestSweep(now = new Date()): Promise<DigestSweepResult> {
  const result: DigestSweepResult = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isEmailConfigured()) return result;
  if (!isDigestDay(now)) return result;

  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.digestEnabled, true));

  for (const row of rows) {
    result.checked += 1;
    const tier = isTier(row.tier) ? row.tier : "free";
    if (!hasCapability(tier, "alerts.email")) {
      result.skipped += 1;
      continue;
    }
    if (!isDue(now, row.digestHourUtc ?? 13, row.lastDigestAt ?? null)) {
      result.skipped += 1;
      continue;
    }

    // Claim before sending: only one sweep wins the day's digest. Capture
    // the pre-claim marker first so a failed send can restore it exactly.
    const previousLastDigestAt = row.lastDigestAt ?? null;
    const dayStart = startOfUtcDay(now);
    const claimed = await db
      .update(settingsTable)
      .set({ lastDigestAt: now })
      .where(
        and(
          eq(settingsTable.userId, row.userId),
          eq(settingsTable.digestEnabled, true),
          or(isNull(settingsTable.lastDigestAt), lt(settingsTable.lastDigestAt, dayStart)),
        ),
      )
      .returning({ userId: settingsTable.userId });
    if (claimed.length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const ok = await sendDigestForUser(row.userId, now);
      if (ok) {
        result.sent += 1;
        logger.info({ userId: row.userId }, "digest: sent");
      } else {
        result.failed += 1;
        // Release the claim so the next sweep can retry today.
        await db
          .update(settingsTable)
          .set({ lastDigestAt: previousLastDigestAt })
          .where(eq(settingsTable.userId, row.userId));
      }
    } catch (err) {
      result.failed += 1;
      logger.error({ err, userId: row.userId }, "digest: send crashed");
      await db
        .update(settingsTable)
        .set({ lastDigestAt: previousLastDigestAt })
        .where(eq(settingsTable.userId, row.userId))
        .catch(() => {});
    }
  }
  return result;
}

let timer: NodeJS.Timeout | null = null;

export function startDigestScheduler(intervalMinutes = 15): void {
  if (timer) return;
  if (!isEmailConfigured()) {
    logger.info("digest scheduler: RESEND_API_KEY not set, scheduler disabled");
    return;
  }
  logger.info({ intervalMinutes }, "digest scheduler: started");
  timer = setInterval(() => {
    runDigestSweep().catch((err) => logger.error({ err }, "digest sweep failed"));
  }, intervalMinutes * 60 * 1000);
  timer.unref?.();
}

export function stopDigestScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// `sql` reserved for future aggregate queries.
void sql;

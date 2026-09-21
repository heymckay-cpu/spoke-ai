// Email transport via Resend's REST API (no SDK dependency).
//
// Configured with:
//   RESEND_API_KEY  — required for sending; feature is a logged no-op without it
//   EMAIL_FROM      — sender, defaults to Resend's shared onboarding address
//                     (fine for testing; set a verified domain for production)
//
// Every caller treats sending as best-effort: a failed email must never fail
// the request or scheduler tick that triggered it.

import { logger } from "./logger";

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? "Spoke.ai <onboarding@resend.dev>";
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Send one email. Returns true on success, false on any failure. */
export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info({ to: args.to, subject: args.subject }, "email: transport not configured, skipping send");
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [args.to],
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { to: args.to, subject: args.subject, status: res.status, body: body.slice(0, 300) },
        "email: send failed",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, to: args.to, subject: args.subject }, "email: send errored");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

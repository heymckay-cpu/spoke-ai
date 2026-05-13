import Anthropic from "@anthropic-ai/sdk";

// Lazy, non-throwing client construction. Importing this module must be
// safe even if the AI integration env vars are missing (e.g. in tests, or
// before the user provisions the integration). Only `getAnthropic()` —
// called from request handlers — surfaces a missing-config error.

let cached: Anthropic | null = null;

export class AnthropicNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Anthropic AI integration is not configured (missing: ${missing.join(", ")}).`,
    );
    this.name = "AnthropicNotConfiguredError";
  }
}

export function isAnthropicConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const missing: string[] = [];
  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL)
    missing.push("AI_INTEGRATIONS_ANTHROPIC_BASE_URL");
  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY)
    missing.push("AI_INTEGRATIONS_ANTHROPIC_API_KEY");
  if (missing.length > 0) throw new AnthropicNotConfiguredError(missing);
  cached = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
  return cached;
}

// Backwards-compat: a Proxy that defers construction until first access so
// existing `import { anthropic }` callers keep working but don't crash on
// import.
export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_t, prop) {
    const real = getAnthropic() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as Function).bind(real) : v;
  },
});

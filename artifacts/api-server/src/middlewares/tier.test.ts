import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/tierStore", () => ({
  getCurrentTierForRequest: vi.fn(),
}));

import { getCurrentTierForRequest } from "../lib/tierStore";
import { requireCapability } from "./tier";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get(
    "/protected/email",
    requireCapability("alerts.email"),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.get(
    "/protected/advisor",
    requireCapability("ai.advisor"),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
}

describe("requireCapability middleware", () => {
  const mocked = vi.mocked(getCurrentTierForRequest);

  beforeEach(() => {
    mocked.mockReset();
  });

  afterEach(() => {
    mocked.mockReset();
  });

  it("returns 403 with the canonical TierBlocked payload when blocked", async () => {
    mocked.mockResolvedValue("free");
    const res = await request(buildApp()).get("/protected/email");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: "tier_required",
      capability: "alerts.email",
      required: "pro",
      current: "free",
    });
  });

  it("blocks pro tier from ultra-only capabilities", async () => {
    mocked.mockResolvedValue("pro");
    const res = await request(buildApp()).get("/protected/advisor");
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("ultra");
    expect(res.body.current).toBe("pro");
  });

  it("allows the request through when the tier satisfies the requirement", async () => {
    mocked.mockResolvedValue("pro");
    const res = await request(buildApp()).get("/protected/email");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("treats a corrupt tier value as not authorized rather than failing open", async () => {
    // @ts-expect-error — deliberately injecting an invalid value
    mocked.mockResolvedValue("enterprise");
    const res = await request(buildApp()).get("/protected/email");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("tier_required");
  });
});

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweepMock = vi.fn();
vi.mock("../lib/digest", () => ({
  runDigestSweep: (...a: unknown[]) => sweepMock(...a),
}));

import digestsRouter from "./digests";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(digestsRouter);
  return app;
}

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ checked: 2, sent: 1, skipped: 1, failed: 0 });
  vi.stubEnv("DIGEST_CRON_SECRET", "s3cret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /digests/run", () => {
  it("runs the sweep with the correct secret", async () => {
    const res = await request(buildApp())
      .post("/digests/run")
      .set("x-digest-secret", "s3cret");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checked: 2, sent: 1, skipped: 1, failed: 0 });
    expect(sweepMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong or missing secret without running the sweep", async () => {
    expect(
      (await request(buildApp()).post("/digests/run").set("x-digest-secret", "nope")).status,
    ).toBe(401);
    expect((await request(buildApp()).post("/digests/run")).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("503s when no secret is configured server-side", async () => {
    vi.stubEnv("DIGEST_CRON_SECRET", "");
    const res = await request(buildApp())
      .post("/digests/run")
      .set("x-digest-secret", "anything");
    expect(res.status).toBe(503);
    expect(sweepMock).not.toHaveBeenCalled();
  });
});

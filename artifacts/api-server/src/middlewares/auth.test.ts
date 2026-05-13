import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
}));

import { getAuth } from "@clerk/express";
import { requireUser, getUserId } from "./auth";

const mockGetAuth = vi.mocked(getAuth);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get("/protected", requireUser, (req, res) => {
    res.json({ userId: getUserId(req) });
  });
  return app;
}

describe("requireUser middleware", () => {
  it("returns 401 when there is no authenticated user", async () => {
    mockGetAuth.mockReturnValue({ userId: null } as ReturnType<typeof getAuth>);
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Authentication required" });
  });

  it("calls next and attaches userId when user is authenticated", async () => {
    mockGetAuth.mockReturnValue({ userId: "user_abc123" } as ReturnType<typeof getAuth>);
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user_abc123" });
  });

  it("returns 401 when getAuth returns an empty userId string", async () => {
    mockGetAuth.mockReturnValue({ userId: "" } as ReturnType<typeof getAuth>);
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
  });
});

describe("getUserId", () => {
  it("throws when called on a request that has no userId attached", () => {
    const req = { userId: undefined } as express.Request;
    expect(() => getUserId(req)).toThrow("getUserId called on an unauthenticated request");
  });

  it("returns the userId when it has been set", () => {
    const req = { userId: "user_xyz" } as express.Request;
    expect(getUserId(req)).toBe("user_xyz");
  });
});

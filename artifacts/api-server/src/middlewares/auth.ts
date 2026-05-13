import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Express middleware that returns 401 when there is no authenticated Clerk
 * user on the request. Mount this after clerkMiddleware() has run.
 *
 * Pattern for public webhook endpoints (none today):
 *   router.post("/webhooks/stripe", express.raw(...), stripeWebhookHandler)
 *   // Do NOT add requireUser to that route.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

/**
 * Extracts the authenticated userId from the request. Throws if no user is
 * attached — only call this inside a route that has already run requireUser.
 */
export function getUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) {
    throw new Error("getUserId called on an unauthenticated request");
  }
  return userId;
}

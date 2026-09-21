// Resolves where to send a user's emails: the notification_email override on
// their settings row when set, otherwise their Clerk account's primary email.

import { clerkClient } from "@clerk/express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function getAccountEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "email: failed to resolve Clerk account email");
    return null;
  }
}

export async function getNotificationEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ notificationEmail: settingsTable.notificationEmail })
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));
  const override = row?.notificationEmail?.trim();
  if (override) return override;
  return getAccountEmail(userId);
}

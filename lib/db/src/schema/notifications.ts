import { pgTable, integer, text, timestamp, serial } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").notNull(),
  kind: text("kind").notNull(),
  ticker: text("ticker").notNull(),
  message: text("message").notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

export type NotificationRow = typeof notificationsTable.$inferSelect;

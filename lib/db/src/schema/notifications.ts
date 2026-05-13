import { pgTable, integer, text, timestamp, serial, index } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  positionId: integer("position_id").notNull(),
  kind: text("kind").notNull(),
  ticker: text("ticker").notNull(),
  message: text("message").notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("notifications_user_idx").on(t.userId),
}));

export type NotificationRow = typeof notificationsTable.$inferSelect;

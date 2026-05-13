import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const qaConversationsTable = pgTable("qa_conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  userIdx: index("qa_conversations_user_idx").on(t.userId),
}));

export type QaConversationRow = typeof qaConversationsTable.$inferSelect;

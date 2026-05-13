import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Per-session natural-language Q&A conversation. One row per conversation;
// individual user/assistant messages live in `qaMessagesTable`. We keep the
// schema deliberately narrow — no user/session FK — so it can stack onto the
// existing single-tenant dashboard without an auth migration.
export const qaConversationsTable = pgTable("qa_conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type QaConversationRow = typeof qaConversationsTable.$inferSelect;

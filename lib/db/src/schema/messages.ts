import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { qaConversationsTable } from "./conversations";

// One row per message in a Q&A conversation. `attachments` carries the
// structured renderables (tables, deep-links) that the agent loop produced
// alongside the text answer — keeping them out of `content` lets the UI
// render rich previews without re-parsing markdown.
export const qaMessagesTable = pgTable("qa_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => qaConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type QaMessageRow = typeof qaMessagesTable.$inferSelect;

import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tokenLogsTable = pgTable(
  "token_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_token_logs_user_id").on(table.userId),
    index("idx_token_logs_feature").on(table.feature),
    index("idx_token_logs_created_at").on(table.createdAt),
  ],
);

export type TokenLog = typeof tokenLogsTable.$inferSelect;
export type InsertTokenLog = typeof tokenLogsTable.$inferInsert;

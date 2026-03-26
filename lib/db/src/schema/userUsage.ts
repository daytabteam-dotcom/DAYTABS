import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userUsageTable = pgTable("user_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  videoAnalysesUsed: integer("video_analyses_used").notNull().default(0),
  scriptPlannerChatsUsed: integer("script_planner_chats_used").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export type UserUsage = typeof userUsageTable.$inferSelect;

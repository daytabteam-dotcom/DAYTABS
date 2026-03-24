import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const scriptPlannerChatsTable = pgTable("script_planner_chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New chat"),
  displayMessages: jsonb("display_messages").notNull().default([]),
  apiHistory: jsonb("api_history").notNull().default([]),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ScriptPlannerChat = typeof scriptPlannerChatsTable.$inferSelect;
export type InsertScriptPlannerChat = typeof scriptPlannerChatsTable.$inferInsert;

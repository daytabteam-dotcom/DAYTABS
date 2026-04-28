import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const socialGrowthWeeklyPlansTable = pgTable("social_growth_weekly_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  weekNumber: integer("week_number").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  topic: text("topic").notNull(),
  postsPerWeek: integer("posts_per_week").notNull(),
  postingMode: text("posting_mode").notNull().default("manual"),
  preferredWeekdays: jsonb("preferred_weekdays").notNull().default([]),
  audience: text("audience"),
  goal: text("goal"),
  tone: text("tone"),
  formatPreference: text("format_preference"),
  plan: jsonb("plan").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialGrowthPlanFeedbackTable = pgTable("social_growth_plan_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => socialGrowthWeeklyPlansTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  feedback: jsonb("feedback").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SocialGrowthWeeklyPlan = typeof socialGrowthWeeklyPlansTable.$inferSelect;
export type SocialGrowthPlanFeedback = typeof socialGrowthPlanFeedbackTable.$inferSelect;

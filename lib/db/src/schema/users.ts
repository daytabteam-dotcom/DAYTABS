import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  plan: text("plan").notNull().default("free"),
  paddleCustomerId: text("paddle_customer_id"),
  paddleSubscriptionId: text("paddle_subscription_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Anchor date for the billing cycle.
  // Free users: set to createdAt on first access.
  // Paid users: updated to now() when a subscription activates.
  // Resets happen exactly 1 month from this date, not on calendar month boundaries.
  cycleStartAt: timestamp("cycle_start_at"),
  // Set when user cancels — the date their paid access actually ends.
  // Cleared when they reactivate or when subscription.canceled webhook fires.
  // Used as a fallback when Paddle API hasn't reflected the scheduledChange yet.
  subscriptionCancelsAt: timestamp("subscription_cancels_at"),
  // Set true when Paddle reports subscription.past_due (payment failed).
  // Does NOT downgrade the plan — Paddle retries automatically.
  // Cleared when subscription.resumed or subscription.activated fires.
  subscriptionPastDue: boolean("subscription_past_due").default(false),
  socialGrowthPlatforms: text("social_growth_platforms").notNull().default(""),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type UserPlan = "free" | "premium" | "professional";

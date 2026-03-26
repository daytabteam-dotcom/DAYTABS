import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type UserPlan = "free" | "premium" | "professional";

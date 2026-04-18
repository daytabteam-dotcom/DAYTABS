import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const youtubeConnectionsTable = pgTable("youtube_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  connectedGoogleEmail: text("connected_google_email"),
  channelId: text("channel_id"),
  channelTitle: text("channel_title"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenType: text("token_type"),
  scopes: text("scopes"),
  expiresAt: timestamp("expires_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubeChannelProfilesTable = pgTable("youtube_channel_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  subscriberCount: text("subscriber_count"),
  totalViewCount: text("total_view_count"),
  videoCount: text("video_count"),
  recentVideos: jsonb("recent_videos").notNull().default([]),
  nicheProfile: jsonb("niche_profile"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubeCompetitorsTable = pgTable("youtube_competitors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  subscriberCount: text("subscriber_count"),
  mostViewedRecentVideos: jsonb("most_viewed_recent_videos").notNull().default([]),
  postingFrequency: text("posting_frequency"),
  niche: text("niche"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubeWeeklyPlansTable = pgTable("youtube_weekly_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  plan: jsonb("plan").notNull(),
  contextSnapshot: jsonb("context_snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubePlanResultsTable = pgTable("youtube_plan_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => youtubeWeeklyPlansTable.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(),
  plannedTitle: text("planned_title").notNull(),
  videoUrl: text("video_url").notNull(),
  videoId: text("video_id").notNull(),
  metrics: jsonb("metrics").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubeApiCacheTable = pgTable("youtube_api_cache", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  cacheKey: text("cache_key").notNull().unique(),
  payload: jsonb("payload").notNull(),
  quotaCost: integer("quota_cost").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type YoutubeConnection = typeof youtubeConnectionsTable.$inferSelect;
export type YoutubeChannelProfile = typeof youtubeChannelProfilesTable.$inferSelect;
export type YoutubeCompetitor = typeof youtubeCompetitorsTable.$inferSelect;
export type YoutubeWeeklyPlan = typeof youtubeWeeklyPlansTable.$inferSelect;
export type YoutubePlanResult = typeof youtubePlanResultsTable.$inferSelect;

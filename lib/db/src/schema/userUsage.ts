import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userUsageTable = pgTable("user_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  videoAnalysisRunsUsed: integer("video_analysis_runs_used").notNull().default(0),
  videoAnalysisUsageUsed: integer("video_analysis_usage_used").notNull().default(0),
  scriptGenerationsUsed: integer("script_generations_used").notNull().default(0),
  videoAnalysesUsed: integer("video_analyses_used").notNull().default(0),
  scriptPlannerChatsUsed: integer("script_planner_chats_used").notNull().default(0),
  videoAnalysisTokensUsed: integer("video_analysis_tokens_used").notNull().default(0),
  contentPlannerTokensUsed: integer("content_planner_tokens_used").notNull().default(0),
  youtubeGrowthTokensUsed: integer("youtube_growth_tokens_used").notNull().default(0),
  socialGrowthPlansUsed: integer("social_growth_plans_used").notNull().default(0),
  socialGrowthManualIdeasUsedLinkedin: integer("social_growth_manual_ideas_used_linkedin").notNull().default(0),
  socialGrowthManualIdeasUsedInstagram: integer("social_growth_manual_ideas_used_instagram").notNull().default(0),
  socialGrowthManualIdeasUsedTiktok: integer("social_growth_manual_ideas_used_tiktok").notNull().default(0),
  socialGrowthImprovementsUsedLinkedin: integer("social_growth_improvements_used_linkedin").notNull().default(0),
  socialGrowthImprovementsUsedInstagram: integer("social_growth_improvements_used_instagram").notNull().default(0),
  socialGrowthImprovementsUsedTiktok: integer("social_growth_improvements_used_tiktok").notNull().default(0),
  socialGrowthAdditionalIdeasUsedLinkedin: integer("social_growth_additional_ideas_used_linkedin").notNull().default(0),
  socialGrowthAdditionalIdeasUsedInstagram: integer("social_growth_additional_ideas_used_instagram").notNull().default(0),
  socialGrowthAdditionalIdeasUsedTiktok: integer("social_growth_additional_ideas_used_tiktok").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export type UserUsage = typeof userUsageTable.$inferSelect;

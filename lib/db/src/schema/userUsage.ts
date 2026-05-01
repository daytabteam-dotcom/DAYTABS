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
  socialGrowthAiImprovementsLinkedin: integer("social_growth_ai_improvements_linkedin").notNull().default(0),
  socialGrowthAiImprovementsTiktok: integer("social_growth_ai_improvements_tiktok").notNull().default(0),
  socialGrowthAiImprovementsInstagram: integer("social_growth_ai_improvements_instagram").notNull().default(0),
  socialGrowthAdditionalAiIdeasLinkedin: integer("social_growth_additional_ai_ideas_linkedin").notNull().default(0),
  socialGrowthAdditionalAiIdeasTiktok: integer("social_growth_additional_ai_ideas_tiktok").notNull().default(0),
  socialGrowthAdditionalAiIdeasInstagram: integer("social_growth_additional_ai_ideas_instagram").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export type UserUsage = typeof userUsageTable.$inferSelect;

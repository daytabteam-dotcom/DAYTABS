import { pgTable, text, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysisJobsTable = pgTable("analysis_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("queued"),
  progress: real("progress").notNull().default(0),
  currentStep: text("current_step").notNull().default("queued"),
  platform: text("platform").notNull(),
  translateSubtitles: integer("translate_subtitles").notNull().default(0),
  subtitleLanguage: text("subtitle_language"),
  replaceAudio: integer("replace_audio").notNull().default(0),
  audioLanguage: text("audio_language"),
  videoPath: text("video_path"),
  audioPath: text("audio_path"),
  framesDir: text("frames_dir"),
  result: jsonb("result"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAnalysisJobSchema = createInsertSchema(analysisJobsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalysisJob = z.infer<typeof insertAnalysisJobSchema>;
export type AnalysisJob = typeof analysisJobsTable.$inferSelect;

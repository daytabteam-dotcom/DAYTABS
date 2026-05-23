import { integer, jsonb, pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const audioTranscriptProjectsTable = pgTable("audio_transcript_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  audioFileUrl: text("audio_file_url"),
  audioFileName: text("audio_file_name"),
  audioFileSize: integer("audio_file_size"),
  audioDurationSeconds: integer("audio_duration_seconds"),
  sourceLanguage: text("source_language"),
  detectedLanguage: text("detected_language"),
  status: text("status").notNull(), // uploaded | transcribing | completed | failed
  fullTranscript: text("full_transcript"),
  transcriptSegments: jsonb("transcript_segments"),
  audioDeleted: boolean("audio_deleted").notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const audioTranslationsTable = pgTable("audio_translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  transcriptProjectId: uuid("transcript_project_id").notNull().references(() => audioTranscriptProjectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sourceLanguage: text("source_language"),
  targetLanguage: text("target_language").notNull(),
  translatedFullText: text("translated_full_text"),
  translatedSegments: jsonb("translated_segments"),
  status: text("status").notNull(), // translating | completed | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const audioTranscriptJobsTable = pgTable("audio_transcript_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  transcriptProjectId: uuid("transcript_project_id").notNull().references(() => audioTranscriptProjectsTable.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(), // transcription | translation
  provider: text("provider").notNull(), // openai
  status: text("status").notNull(), // queued | processing | completed | failed
  input: jsonb("input").notNull().default({}),
  output: jsonb("output"),
  errorMessage: text("error_message"),
  costCredits: integer("cost_credits").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AudioTranscriptProject = typeof audioTranscriptProjectsTable.$inferSelect;
export type AudioTranslation = typeof audioTranslationsTable.$inferSelect;
export type AudioTranscriptJob = typeof audioTranscriptJobsTable.$inferSelect;


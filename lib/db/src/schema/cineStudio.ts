import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cineProjectsTable = pgTable("cine_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  styleId: uuid("style_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cineCharactersTable = pgTable("cine_characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => cineProjectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  basePrompt: text("base_prompt").notNull(),
  identityPrompt: text("identity_prompt"),
  stylePreset: text("style_preset").notNull(),
  styleId: uuid("style_id"),
  lockedIdentity: boolean("locked_identity").notNull().default(false),
  referenceImageUrl: text("reference_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cineAssetsTable = pgTable("cine_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => cineProjectsTable.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").references(() => cineCharactersTable.id, { onDelete: "set null" }),
  styleId: uuid("style_id"),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // image | video
  category: text("category").notNull(), // character_sheet | angle | scene | shot | final_video
  url: text("url").notNull(),
  prompt: text("prompt").notNull(),
  provider: text("provider").notNull(), // gemini | seedance | fal
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cineJobsTable = pgTable("cine_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => cineProjectsTable.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").references(() => cineCharactersTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull(), // openai | gemini | seedance | fal
  jobType: text("job_type").notNull(), // prompt_planning | image_generation | image_edit | angle_generation | image_to_video
  status: text("status").notNull(), // queued | processing | completed | failed
  input: jsonb("input").notNull().default({}),
  output: jsonb("output"),
  errorMessage: text("error_message"),
  costCredits: integer("cost_credits").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creditsTable = pgTable("credits", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  remainingCredits: integer("remaining_credits").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cineStylesTable = pgTable("cine_styles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  stylePrompt: text("style_prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  colorPalette: jsonb("color_palette"),
  moodKeywords: jsonb("mood_keywords"),
  textureKeywords: jsonb("texture_keywords"),
  lightingKeywords: jsonb("lighting_keywords"),
  referenceImageUrl: text("reference_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CineProject = typeof cineProjectsTable.$inferSelect;
export type CineCharacter = typeof cineCharactersTable.$inferSelect;
export type CineAsset = typeof cineAssetsTable.$inferSelect;
export type CineJob = typeof cineJobsTable.$inferSelect;
export type CreditsRow = typeof creditsTable.$inferSelect;
export type CineStyle = typeof cineStylesTable.$inferSelect;

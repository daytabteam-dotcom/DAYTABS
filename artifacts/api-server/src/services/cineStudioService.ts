import {
  db,
  cineAssetsTable,
  cineCharactersTable,
  cineJobsTable,
  cineProjectsTable,
  cineStylesTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export async function listCineProjects(userId: number) {
  return await db
    .select()
    .from(cineProjectsTable)
    .where(eq(cineProjectsTable.userId, userId))
    .orderBy(desc(cineProjectsTable.updatedAt));
}

export async function listCineCharacters(userId: number) {
  return await db
    .select()
    .from(cineCharactersTable)
    .where(eq(cineCharactersTable.userId, userId))
    .orderBy(desc(cineCharactersTable.updatedAt));
}

export async function listCineAssets(userId: number, limit = 60) {
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  return await db
    .select()
    .from(cineAssetsTable)
    .where(eq(cineAssetsTable.userId, userId))
    .orderBy(desc(cineAssetsTable.createdAt))
    .limit(n);
}

export async function createCineProject(userId: number, title: string, description?: string | null) {
  const [row] = await db.insert(cineProjectsTable).values({
    userId,
    title,
    description: description ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function updateCineProjectStyle(userId: number, projectId: string, styleId: string | null) {
  const [row] = await db.update(cineProjectsTable).set({
    styleId,
    updatedAt: new Date(),
  }).where(and(eq(cineProjectsTable.id, projectId), eq(cineProjectsTable.userId, userId))).returning();
  return row ?? null;
}

export async function getCineProjectDetail(userId: number, projectId: string) {
  const [project] = await db
    .select()
    .from(cineProjectsTable)
    .where(and(eq(cineProjectsTable.id, projectId), eq(cineProjectsTable.userId, userId)))
    .limit(1);
  if (!project) return null;

  const characters = await db
    .select()
    .from(cineCharactersTable)
    .where(and(eq(cineCharactersTable.projectId, projectId), eq(cineCharactersTable.userId, userId)))
    .orderBy(desc(cineCharactersTable.updatedAt));

  const assets = await db
    .select()
    .from(cineAssetsTable)
    .where(and(eq(cineAssetsTable.projectId, projectId), eq(cineAssetsTable.userId, userId)))
    .orderBy(desc(cineAssetsTable.createdAt));

  const jobs = await db
    .select()
    .from(cineJobsTable)
    .where(and(eq(cineJobsTable.projectId, projectId), eq(cineJobsTable.userId, userId)))
    .orderBy(desc(cineJobsTable.updatedAt))
    .limit(25);

  return { project, characters, assets, jobs };
}

export async function getCineProject(userId: number, projectId: string) {
  const [project] = await db
    .select()
    .from(cineProjectsTable)
    .where(and(eq(cineProjectsTable.id, projectId), eq(cineProjectsTable.userId, userId)))
    .limit(1);
  return project ?? null;
}

export async function createCharacter(input: {
  userId: number;
  projectId: string;
  name: string;
  basePrompt: string;
  stylePreset: string;
  styleId?: string | null;
}) {
  const [row] = await db.insert(cineCharactersTable).values({
    userId: input.userId,
    projectId: input.projectId,
    name: input.name,
    basePrompt: input.basePrompt,
    stylePreset: input.stylePreset,
    styleId: input.styleId ?? null,
    lockedIdentity: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function getCharacter(userId: number, characterId: string) {
  const [row] = await db
    .select()
    .from(cineCharactersTable)
    .where(and(eq(cineCharactersTable.id, characterId), eq(cineCharactersTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateCharacterIdentity(userId: number, characterId: string, identityPrompt: string) {
  const [row] = await db.update(cineCharactersTable).set({
    identityPrompt,
    updatedAt: new Date(),
  }).where(and(eq(cineCharactersTable.id, characterId), eq(cineCharactersTable.userId, userId))).returning();
  return row ?? null;
}

export async function lockCharacterIdentity(userId: number, characterId: string, referenceImageUrl: string) {
  const [row] = await db.update(cineCharactersTable).set({
    lockedIdentity: true,
    referenceImageUrl,
    updatedAt: new Date(),
  }).where(and(eq(cineCharactersTable.id, characterId), eq(cineCharactersTable.userId, userId))).returning();
  return row ?? null;
}

export async function updateCharacterStyle(userId: number, characterId: string, styleId: string | null) {
  const [row] = await db.update(cineCharactersTable).set({
    styleId,
    updatedAt: new Date(),
  }).where(and(eq(cineCharactersTable.id, characterId), eq(cineCharactersTable.userId, userId))).returning();
  return row ?? null;
}

export async function createCineJob(input: {
  userId: number;
  projectId: string;
  characterId?: string | null;
  provider: string;
  jobType: string;
  status: string;
  costCredits: number;
  inputPayload: unknown;
}) {
  const [row] = await db.insert(cineJobsTable).values({
    userId: input.userId,
    projectId: input.projectId,
    characterId: input.characterId ?? null,
    provider: input.provider,
    jobType: input.jobType,
    status: input.status,
    costCredits: input.costCredits,
    input: input.inputPayload as never,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function updateCineJob(input: {
  userId: number;
  jobId: string;
  patch: Partial<{
    status: string;
    output: unknown;
    errorMessage: string | null;
  }>;
}) {
  const [row] = await db.update(cineJobsTable).set({
    status: input.patch.status,
    output: input.patch.output as never,
    errorMessage: input.patch.errorMessage ?? undefined,
    updatedAt: new Date(),
  }).where(and(eq(cineJobsTable.id, input.jobId), eq(cineJobsTable.userId, input.userId))).returning();
  return row ?? null;
}

export async function getCineJob(userId: number, jobId: string) {
  const [row] = await db
    .select()
    .from(cineJobsTable)
    .where(and(eq(cineJobsTable.id, jobId), eq(cineJobsTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createCineAsset(input: {
  userId: number;
  projectId: string;
  characterId?: string | null;
  styleId?: string | null;
  type: "image" | "video";
  category: string;
  url: string;
  prompt: string;
  provider: string;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db.insert(cineAssetsTable).values({
    userId: input.userId,
    projectId: input.projectId,
    characterId: input.characterId ?? null,
    styleId: input.styleId ?? null,
    type: input.type,
    category: input.category,
    url: input.url,
    prompt: input.prompt,
    provider: input.provider,
    metadata: (input.metadata ?? {}) as never,
    createdAt: new Date(),
  }).returning();
  return row!;
}

export async function getCineAsset(userId: number, assetId: string) {
  const [row] = await db
    .select()
    .from(cineAssetsTable)
    .where(and(eq(cineAssetsTable.id, assetId), eq(cineAssetsTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listCineStyles(userId: number) {
  return await db.select().from(cineStylesTable).where(eq(cineStylesTable.userId, userId)).orderBy(desc(cineStylesTable.updatedAt));
}

export async function createCineStyle(input: {
  userId: number;
  name: string;
  description?: string | null;
  stylePrompt: string;
  negativePrompt?: string | null;
  colorPalette?: string[] | null;
  moodKeywords?: string[] | null;
  textureKeywords?: string[] | null;
  lightingKeywords?: string[] | null;
  referenceImageUrl?: string | null;
}) {
  const [row] = await db.insert(cineStylesTable).values({
    userId: input.userId,
    name: input.name,
    description: input.description ?? null,
    stylePrompt: input.stylePrompt,
    negativePrompt: input.negativePrompt ?? null,
    colorPalette: (input.colorPalette ?? null) as never,
    moodKeywords: (input.moodKeywords ?? null) as never,
    textureKeywords: (input.textureKeywords ?? null) as never,
    lightingKeywords: (input.lightingKeywords ?? null) as never,
    referenceImageUrl: input.referenceImageUrl ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function getCineStyle(userId: number, styleId: string) {
  const [row] = await db.select().from(cineStylesTable).where(and(eq(cineStylesTable.id, styleId), eq(cineStylesTable.userId, userId))).limit(1);
  return row ?? null;
}

export async function updateCineStyle(userId: number, styleId: string, patch: Partial<{
  name: string;
  description: string | null;
  stylePrompt: string;
  negativePrompt: string | null;
  colorPalette: string[] | null;
  moodKeywords: string[] | null;
  textureKeywords: string[] | null;
  lightingKeywords: string[] | null;
  referenceImageUrl: string | null;
}>) {
  const [row] = await db.update(cineStylesTable).set({
    name: patch.name,
    description: patch.description,
    stylePrompt: patch.stylePrompt,
    negativePrompt: patch.negativePrompt,
    colorPalette: (patch.colorPalette ?? undefined) as never,
    moodKeywords: (patch.moodKeywords ?? undefined) as never,
    textureKeywords: (patch.textureKeywords ?? undefined) as never,
    lightingKeywords: (patch.lightingKeywords ?? undefined) as never,
    referenceImageUrl: patch.referenceImageUrl,
    updatedAt: new Date(),
  }).where(and(eq(cineStylesTable.id, styleId), eq(cineStylesTable.userId, userId))).returning();
  return row ?? null;
}

export async function deleteCineStyle(userId: number, styleId: string) {
  const [row] = await db.delete(cineStylesTable).where(and(eq(cineStylesTable.id, styleId), eq(cineStylesTable.userId, userId))).returning();
  return row ?? null;
}

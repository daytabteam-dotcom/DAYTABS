import { db, audioTranscriptJobsTable, audioTranscriptProjectsTable, audioTranslationsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import type { TranscriptSegment } from "../aiProviders/openaiTranscription";

export async function createAudioTranscriptProjectRow(input: {
  userId: number;
  title: string;
  audioFileUrl: string;
  audioFileName: string;
  audioFileSize: number;
  sourceLanguage: string;
}) {
  const [row] = await db.insert(audioTranscriptProjectsTable).values({
    userId: input.userId,
    title: input.title,
    audioFileUrl: input.audioFileUrl,
    audioFileName: input.audioFileName,
    audioFileSize: input.audioFileSize,
    sourceLanguage: input.sourceLanguage,
    status: "uploaded",
    audioDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function updateAudioTranscriptProject(userId: number, projectId: string, patch: Partial<{
  status: string;
  detectedLanguage: string | null;
  fullTranscript: string | null;
  transcriptSegments: TranscriptSegment[] | null;
  errorMessage: string | null;
  audioFileUrl: string | null;
  audioDeleted: boolean;
}>) {
  const [row] = await db.update(audioTranscriptProjectsTable).set({
    status: patch.status,
    detectedLanguage: patch.detectedLanguage ?? undefined,
    fullTranscript: patch.fullTranscript ?? undefined,
    transcriptSegments: (patch.transcriptSegments ?? undefined) as never,
    errorMessage: patch.errorMessage ?? undefined,
    audioFileUrl: patch.audioFileUrl ?? undefined,
    audioDeleted: patch.audioDeleted ?? undefined,
    updatedAt: new Date(),
  }).where(and(eq(audioTranscriptProjectsTable.id, projectId), eq(audioTranscriptProjectsTable.userId, userId))).returning();
  return row ?? null;
}

export async function getAudioTranscriptProject(userId: number, projectId: string) {
  const [row] = await db.select().from(audioTranscriptProjectsTable).where(and(eq(audioTranscriptProjectsTable.id, projectId), eq(audioTranscriptProjectsTable.userId, userId))).limit(1);
  return row ?? null;
}

export async function listAudioTranscriptProjects(userId: number) {
  return await db.select().from(audioTranscriptProjectsTable).where(eq(audioTranscriptProjectsTable.userId, userId)).orderBy(desc(audioTranscriptProjectsTable.updatedAt));
}

export async function createAudioTranscriptJob(input: {
  userId: number;
  transcriptProjectId: string;
  jobType: "transcription" | "translation";
  status: "queued" | "processing" | "completed" | "failed";
  inputPayload: unknown;
  costCredits?: number;
}) {
  const [row] = await db.insert(audioTranscriptJobsTable).values({
    userId: input.userId,
    transcriptProjectId: input.transcriptProjectId,
    jobType: input.jobType,
    provider: "openai",
    status: input.status,
    input: input.inputPayload as never,
    costCredits: input.costCredits ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function updateAudioTranscriptJob(userId: number, jobId: string, patch: Partial<{
  status: string;
  output: unknown;
  errorMessage: string | null;
}>) {
  const [row] = await db.update(audioTranscriptJobsTable).set({
    status: patch.status,
    output: patch.output as never,
    errorMessage: patch.errorMessage ?? undefined,
    updatedAt: new Date(),
  }).where(and(eq(audioTranscriptJobsTable.id, jobId), eq(audioTranscriptJobsTable.userId, userId))).returning();
  return row ?? null;
}

export async function getAudioTranscriptJob(userId: number, jobId: string) {
  const [row] = await db.select().from(audioTranscriptJobsTable).where(and(eq(audioTranscriptJobsTable.id, jobId), eq(audioTranscriptJobsTable.userId, userId))).limit(1);
  return row ?? null;
}

export async function listTranslationsForProject(userId: number, transcriptProjectId: string) {
  return await db.select().from(audioTranslationsTable).where(and(eq(audioTranslationsTable.userId, userId), eq(audioTranslationsTable.transcriptProjectId, transcriptProjectId))).orderBy(desc(audioTranslationsTable.updatedAt));
}

export async function getTranslation(userId: number, translationId: string) {
  const [row] = await db.select().from(audioTranslationsTable).where(and(eq(audioTranslationsTable.id, translationId), eq(audioTranslationsTable.userId, userId))).limit(1);
  return row ?? null;
}

export async function getTranslationByTarget(userId: number, transcriptProjectId: string, targetLanguage: string) {
  const [row] = await db.select().from(audioTranslationsTable).where(and(
    eq(audioTranslationsTable.userId, userId),
    eq(audioTranslationsTable.transcriptProjectId, transcriptProjectId),
    eq(audioTranslationsTable.targetLanguage, targetLanguage),
  )).limit(1);
  return row ?? null;
}

export async function createTranslationRow(input: {
  userId: number;
  transcriptProjectId: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const [row] = await db.insert(audioTranslationsTable).values({
    userId: input.userId,
    transcriptProjectId: input.transcriptProjectId,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    status: "translating",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row!;
}

export async function updateTranslationRow(userId: number, translationId: string, patch: Partial<{
  status: string;
  translatedFullText: string | null;
  translatedSegments: unknown;
  errorMessage: string | null;
}>) {
  const [row] = await db.update(audioTranslationsTable).set({
    status: patch.status,
    translatedFullText: patch.translatedFullText ?? undefined,
    translatedSegments: patch.translatedSegments as never,
    errorMessage: patch.errorMessage ?? undefined,
    updatedAt: new Date(),
  }).where(and(eq(audioTranslationsTable.id, translationId), eq(audioTranslationsTable.userId, userId))).returning();
  return row ?? null;
}

export async function deleteAudioTranscriptProject(userId: number, projectId: string) {
  const [row] = await db.delete(audioTranscriptProjectsTable).where(and(eq(audioTranscriptProjectsTable.id, projectId), eq(audioTranscriptProjectsTable.userId, userId))).returning();
  return row ?? null;
}


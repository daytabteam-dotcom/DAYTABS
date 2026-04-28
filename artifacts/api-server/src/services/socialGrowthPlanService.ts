import { and, desc, eq } from "drizzle-orm";
import { db, socialGrowthPlanFeedbackTable, socialGrowthWeeklyPlansTable } from "@workspace/db";
import type { PlanPayload, SocialPlatform, SocialPostPerformanceFeedback, SocialWeeklyPlanCreateInput } from "../models/socialGrowthPlan";
import { randomUUID } from "node:crypto";

export async function listSocialWeeklyPlans(userId: number, platform: SocialPlatform) {
  return await db
    .select()
    .from(socialGrowthWeeklyPlansTable)
    .where(and(eq(socialGrowthWeeklyPlansTable.userId, userId), eq(socialGrowthWeeklyPlansTable.platform, platform)))
    .orderBy(desc(socialGrowthWeeklyPlansTable.startDate), desc(socialGrowthWeeklyPlansTable.id))
    .limit(12);
}

export async function getLatestSocialWeeklyPlan(userId: number, platform: SocialPlatform) {
  const [row] = await db
    .select()
    .from(socialGrowthWeeklyPlansTable)
    .where(and(eq(socialGrowthWeeklyPlansTable.userId, userId), eq(socialGrowthWeeklyPlansTable.platform, platform)))
    .orderBy(desc(socialGrowthWeeklyPlansTable.startDate), desc(socialGrowthWeeklyPlansTable.id))
    .limit(1);
  return row ?? null;
}

export async function createSocialWeeklyPlan(userId: number, input: SocialWeeklyPlanCreateInput) {
  const [row] = await db
    .insert(socialGrowthWeeklyPlansTable)
    .values({
      userId,
      platform: input.platform,
      weekNumber: isoWeekNumber(input.startDate) ?? 0,
      startDate: input.startDate,
      endDate: input.endDate,
      topic: input.topic,
      postsPerWeek: input.postsPerWeek,
      postingMode: input.postingMode ?? "manual",
      preferredWeekdays: (input.preferredWeekdays ?? []) as unknown as object,
      audience: input.audience ?? null,
      goal: input.goal ?? null,
      tone: input.tone ?? null,
      formatPreference: input.formatPreference ?? null,
      plan: input.plan as unknown as PlanPayload,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function saveSocialWeeklyPlanFeedback(
  userId: number,
  planId: number,
  platform: SocialPlatform,
  feedback: SocialPostPerformanceFeedback[],
) {
  const [row] = await db
    .insert(socialGrowthPlanFeedbackTable)
    .values({
      userId,
      planId,
      platform,
      feedback: feedback as unknown as object,
    })
    .returning();
  return row;
}

export async function getLatestFeedbackForPlan(planId: number) {
  const [row] = await db
    .select()
    .from(socialGrowthPlanFeedbackTable)
    .where(eq(socialGrowthPlanFeedbackTable.planId, planId))
    .orderBy(desc(socialGrowthPlanFeedbackTable.createdAt), desc(socialGrowthPlanFeedbackTable.id))
    .limit(1);
  return row ?? null;
}

export async function updateSocialPlanDay(userId: number, planId: number, dayId: string, patch: Record<string, unknown>) {
  const [plan] = await db
    .select()
    .from(socialGrowthWeeklyPlansTable)
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .limit(1);
  if (!plan) return null;

  const payload = (plan.plan ?? {}) as PlanPayload;
  const days = Array.isArray(payload.days) ? payload.days : [];
  const nextDays = days.map((day) => day.id === dayId ? ({ ...day, ...patch } as typeof day) : day);
  const nextPlan: PlanPayload = { ...payload, days: nextDays };

  const [updated] = await db
    .update(socialGrowthWeeklyPlansTable)
    .set({ plan: nextPlan as unknown as object, updatedAt: new Date() })
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function addSocialPlanDay(userId: number, planId: number, input: { date: string; day?: number; patch: Record<string, unknown> }) {
  const [plan] = await db
    .select()
    .from(socialGrowthWeeklyPlansTable)
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .limit(1);
  if (!plan) return null;

  const payload = (plan.plan ?? {}) as PlanPayload;
  const days = Array.isArray(payload.days) ? payload.days : [];
  const nextDayNumber = input.day && Number.isFinite(input.day) ? Number(input.day) : Math.max(0, ...days.map((item) => Number(item.day) || 0)) + 1;
  type PlanDay = NonNullable<PlanPayload["days"]>[number];
  const newDay = {
    id: randomUUID(),
    day: nextDayNumber,
    date: input.date,
    ...input.patch,
  } as unknown as PlanDay;

  const nextPlan: PlanPayload = { ...payload, days: [...days, newDay] };

  const [updated] = await db
    .update(socialGrowthWeeklyPlansTable)
    .set({ plan: nextPlan as unknown as object, updatedAt: new Date() })
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .returning();
  if (!updated) return null;
  return { plan: updated, day: newDay };
}

export async function deleteSocialPlanDay(userId: number, planId: number, dayId: string) {
  const [plan] = await db
    .select()
    .from(socialGrowthWeeklyPlansTable)
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .limit(1);
  if (!plan) return null;

  const payload = (plan.plan ?? {}) as PlanPayload;
  const days = Array.isArray(payload.days) ? payload.days : [];
  const nextDays = days.filter((day) => day.id !== dayId);
  const nextPlan: PlanPayload = { ...payload, days: nextDays };

  const [updated] = await db
    .update(socialGrowthWeeklyPlansTable)
    .set({ plan: nextPlan as unknown as object, updatedAt: new Date() })
    .where(and(eq(socialGrowthWeeklyPlansTable.id, planId), eq(socialGrowthWeeklyPlansTable.userId, userId)))
    .returning();
  return updated ?? null;
}

function isoWeekNumber(isoDate: string) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

import { db, userUsageTable, analysisJobsTable, scriptPlannerChatsTable, tokenLogsTable, usersTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";
import {
  normalizePlan,
  PLAN_LIMITS,
  buildMonthlyLimitError,
  buildScriptGenerationLimitError,
  buildVideoUsageLimitError,
  getVideoUsageCost,
} from "./planLimits";
import { getTokenProductArea } from "./tokenUsageProducts";
import type { SocialPlatform } from "../models/socialGrowthPlan";

// ─── Per-user billing cycle helpers ────────────────────────────────────────────

/**
 * Compute the start of the user's current billing cycle.
 *
 * The cycle day-of-month is taken from `baseDate` (signup or subscription date).
 * If the cycle day has already passed this month, the cycle started this month.
 * Otherwise it started last month (i.e. the user is in the tail of the previous cycle).
 *
 * Edge case: months shorter than the cycle day (e.g. cycle day = 31, February)
 * use the last day of that month instead.
 */
function getCurrentCycleStart(baseDate: Date): Date {
  const now = new Date();
  const cycleDay = baseDate.getDate();

  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const daysThisMonth = new Date(year, month + 1, 0).getDate();
  const dayThisMonth = Math.min(cycleDay, daysThisMonth);
  const cycleThisMonth = new Date(year, month, dayThisMonth, 0, 0, 0, 0);

  if (cycleThisMonth <= now) {
    return cycleThisMonth;
  }

  // Still before the cycle start this month — we're in the previous month's cycle
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const dayPrevMonth = Math.min(cycleDay, daysPrevMonth);
  return new Date(prevYear, prevMonth, dayPrevMonth, 0, 0, 0, 0);
}

/**
 * Returns true if the stored period start is before the current cycle start,
 * meaning the usage row needs to be reset.
 */
function isPeriodStale(storedPeriodStart: string, cycleStart: Date): boolean {
  const stored = new Date(storedPeriodStart + "T00:00:00");
  // Cycle start is midnight local — compare dates only
  const cycleStartMidnight = new Date(
    cycleStart.getFullYear(),
    cycleStart.getMonth(),
    cycleStart.getDate(),
  );
  return stored < cycleStartMidnight;
}

function dateToISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Seed helper ───────────────────────────────────────────────────────────────

/**
 * Count existing successful analysis jobs and script chats since a given date.
 * Used to seed the counter on first access.
 */
async function countUsageSince(userId: number, since: Date): Promise<{
  videoUsage: number;
  videoRuns: number;
  scriptGenerations: number;
  productTokens: {
    videoAnalysis: number;
    contentPlanner: number;
    youtubeGrowth: number;
  };
}> {
  const analysisRows = await db
    .select({
      result: analysisJobsTable.result,
    })
    .from(analysisJobsTable)
    .where(and(
      eq(analysisJobsTable.userId, userId),
      eq(analysisJobsTable.mode, "video-analyzer"),
      eq(analysisJobsTable.status, "complete"),
      gte(analysisJobsTable.createdAt, since),
    ));

  const [chatRow] = await db
    .select({ cnt: count() })
    .from(scriptPlannerChatsTable)
    .where(and(
      eq(scriptPlannerChatsTable.userId, userId),
      gte(scriptPlannerChatsTable.createdAt, since),
    ));

  const tokenRows = await db
    .select({
      feature: tokenLogsTable.feature,
      inputTokens: tokenLogsTable.inputTokens,
      outputTokens: tokenLogsTable.outputTokens,
    })
    .from(tokenLogsTable)
    .where(and(
      eq(tokenLogsTable.userId, userId),
      gte(tokenLogsTable.createdAt, since),
    ));

  const videoUsage = analysisRows.reduce((sum, row) => {
    const analysisOptions = row.result && typeof row.result === "object"
      ? (row.result as { analysisOptions?: { durationSeconds?: unknown } }).analysisOptions
      : undefined;
    const durationSeconds = Number(analysisOptions?.durationSeconds);
    return sum + getVideoUsageCost(durationSeconds);
  }, 0);

  const productTokens = tokenRows.reduce((totals, row) => {
    const productArea = getTokenProductArea(row.feature);
    if (!productArea) return totals;
    totals[productArea] += Number(row.inputTokens ?? 0) + Number(row.outputTokens ?? 0);
    return totals;
  }, {
    videoAnalysis: 0,
    contentPlanner: 0,
    youtubeGrowth: 0,
  });

  return {
    videoUsage,
    videoRuns: analysisRows.length,
    scriptGenerations: Number(chatRow?.cnt ?? 0),
    productTokens,
  };
}

// ─── Get or create usage row ───────────────────────────────────────────────────

/**
 * Get or create a user's usage row. Handles cycle-based reset automatically.
 *
 * Billing cycles are anchored to the user's cycleStartAt timestamp:
 *   - Free users:  cycleStartAt = createdAt (set on first usage access)
 *   - Paid users:  cycleStartAt = subscription activation date
 *
 * Resets happen exactly 1 month from the anchor date, not on calendar boundaries.
 */
export async function getOrCreateUsage(userId: number) {
  // Fetch user to get billing cycle anchor
  const [user] = await db
    .select({ createdAt: usersTable.createdAt, cycleStartAt: usersTable.cycleStartAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Determine the anchor date: paid subscription date or signup date
  const anchorDate = user?.cycleStartAt ?? user?.createdAt ?? new Date();

  // If the user has no cycleStartAt, set it to createdAt now (one-time migration)
  if (user && !user.cycleStartAt) {
    await db
      .update(usersTable)
      .set({ cycleStartAt: user.createdAt } as never)
      .where(eq(usersTable.id, userId));
  }

  const cycleStart = getCurrentCycleStart(anchorDate);
  const periodStartStr = dateToISODate(cycleStart);

  const [existing] = await db
    .select()
    .from(userUsageTable)
    .where(eq(userUsageTable.userId, userId))
    .limit(1);

  if (!existing) {
    // First access — seed from completed jobs in this cycle
    const { videoUsage, videoRuns, scriptGenerations, productTokens } = await countUsageSince(userId, cycleStart);
    const [row] = await db
      .insert(userUsageTable)
      .values({
        userId,
        periodStart: periodStartStr,
        periodEnd: dateToISODate(new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate())),
        videoAnalysesUsed: videoRuns,
        scriptPlannerChatsUsed: scriptGenerations,
        videoAnalysisRunsUsed: videoRuns,
        videoAnalysisUsageUsed: videoUsage,
        scriptGenerationsUsed: scriptGenerations,
        videoAnalysisTokensUsed: productTokens.videoAnalysis,
        contentPlannerTokensUsed: productTokens.contentPlanner,
        youtubeGrowthTokensUsed: productTokens.youtubeGrowth,
        socialGrowthPlansUsed: 0,
        lastUpdated: new Date(),
      })
      .returning();
    return row;
  }

  if (isPeriodStale(existing.periodStart, cycleStart)) {
    // New cycle started — reset counters, seed from completed jobs this cycle
    const { videoUsage, videoRuns, scriptGenerations, productTokens } = await countUsageSince(userId, cycleStart);
    const [row] = await db
      .update(userUsageTable)
      .set({
        periodStart: periodStartStr,
        periodEnd: dateToISODate(new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate())),
        videoAnalysesUsed: videoRuns,
        scriptPlannerChatsUsed: scriptGenerations,
        videoAnalysisRunsUsed: videoRuns,
        videoAnalysisUsageUsed: videoUsage,
        scriptGenerationsUsed: scriptGenerations,
        videoAnalysisTokensUsed: productTokens.videoAnalysis,
        contentPlannerTokensUsed: productTokens.contentPlanner,
        youtubeGrowthTokensUsed: productTokens.youtubeGrowth,
        socialGrowthPlansUsed: 0,
        lastUpdated: new Date(),
      })
      .where(eq(userUsageTable.userId, userId))
      .returning();
    return row;
  }

  return existing;
}

// ─── Video Analysis — check only (no increment) ───────────────────────────────

/**
 * Check whether the user is within their video analysis limit for the current cycle.
 * Does NOT increment the counter. Call incrementVideoAnalysis() after a successful pipeline.
 */
export async function checkVideoAnalysisLimit(userId: number, rawPlan: string, durationSeconds?: number | null): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  required: number;
  error?: ReturnType<typeof buildMonthlyLimitError>;
}> {
  const plan = normalizePlan(rawPlan);
  const displayLimit = PLAN_LIMITS[plan].video_analyses_display_limit;
  const usageLimit = PLAN_LIMITS[plan].video_usage_budget_per_month;
  const required = getVideoUsageCost(Number(durationSeconds ?? 0));

  const usage = await getOrCreateUsage(userId);
  const usedRuns = usage.videoAnalysisRunsUsed ?? usage.videoAnalysesUsed ?? 0;
  const usedUsage = usage.videoAnalysisUsageUsed ?? usage.videoAnalysesUsed ?? 0;

  if (usedRuns >= displayLimit) {
    return { allowed: false, used: usedRuns, limit: displayLimit, required, error: buildMonthlyLimitError(plan, usedRuns, displayLimit) };
  }

  if (usedUsage + required > usageLimit) {
    return {
      allowed: false,
      used: usedUsage,
      limit: usageLimit,
      required,
      error: buildVideoUsageLimitError(plan, usedUsage, usageLimit, required),
    };
  }

  return { allowed: true, used: usedUsage, limit: usageLimit, required };
}

// ─── Video Analysis — increment after successful pipeline ─────────────────────

/**
 * Increment the video analysis counter. Call this only after the pipeline
 * completes successfully and the report is generated.
 */
export async function incrementVideoAnalysis(userId: number, durationSeconds?: number | null): Promise<void> {
  const required = getVideoUsageCost(Number(durationSeconds ?? 0));
  const [existing] = await db
    .select()
    .from(userUsageTable)
    .where(eq(userUsageTable.userId, userId))
    .limit(1);

  if (!existing) {
    // Safety: create the row first
    await getOrCreateUsage(userId);
    const [fresh] = await db.select().from(userUsageTable).where(eq(userUsageTable.userId, userId)).limit(1);
    if (!fresh) return;
    await db.update(userUsageTable).set({
      videoAnalysesUsed: 1,
      videoAnalysisRunsUsed: 1,
      videoAnalysisUsageUsed: required,
      lastUpdated: new Date(),
    }).where(eq(userUsageTable.userId, userId));
    return;
  }

  await db
    .update(userUsageTable)
    .set({
      videoAnalysesUsed: (existing.videoAnalysesUsed ?? 0) + 1,
      videoAnalysisRunsUsed: (existing.videoAnalysisRunsUsed ?? existing.videoAnalysesUsed ?? 0) + 1,
      videoAnalysisUsageUsed: (existing.videoAnalysisUsageUsed ?? existing.videoAnalysesUsed ?? 0) + required,
      lastUpdated: new Date(),
    })
    .where(eq(userUsageTable.userId, userId));
}

// ─── Script generation limit check + increment ───────────────────────────────

export async function checkAndIncrementScriptGeneration(userId: number, rawPlan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  error?: ReturnType<typeof buildScriptGenerationLimitError>;
}> {
  const plan = normalizePlan(rawPlan);
  const planLimit = PLAN_LIMITS[plan].script_generations_per_month;

  const usage = await getOrCreateUsage(userId);
  const used = usage.scriptGenerationsUsed ?? usage.scriptPlannerChatsUsed ?? 0;

  if (used >= planLimit) {
    return { allowed: false, used, limit: planLimit, error: buildScriptGenerationLimitError(plan, used, planLimit) };
  }

  await db
    .update(userUsageTable)
    .set({
      scriptPlannerChatsUsed: used + 1,
      scriptGenerationsUsed: used + 1,
      lastUpdated: new Date(),
    })
    .where(eq(userUsageTable.userId, userId));

  return { allowed: true, used: used + 1, limit: planLimit };
}

// ─── Social Growth Planner limit check + increment ───────────────────────────

function socialGrowthPlanLimit(plan: ReturnType<typeof normalizePlan>) {
  // Weekly plan generations per billing cycle.
  // Free: trial is handled separately (1 week lifetime) in the social-growth routes.
  if (plan === "free") return 1;
  // Creator: up to a month across two platforms (4 weeks each) = 8 plans.
  if (plan === "creator") return 8;
  // Pro: generous cap (weekly across 3 platforms).
  if (plan === "pro") return 60;
  // Studio: very high cap.
  return 200;
}

export async function checkAndIncrementSocialGrowthPlan(userId: number, rawPlan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  error?: { error: string };
}> {
  const plan = normalizePlan(rawPlan);
  const limit = socialGrowthPlanLimit(plan);

  const usage = await getOrCreateUsage(userId);
  const used = usage.socialGrowthPlansUsed ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      error: {
        error: "You have reached your Growth Planner limit on your current plan. Upgrade your plan to create more weekly plans.",
      },
    };
  }

  await db
    .update(userUsageTable)
    .set({
      socialGrowthPlansUsed: used + 1,
      lastUpdated: new Date(),
    })
    .where(eq(userUsageTable.userId, userId));

  return { allowed: true, used: used + 1, limit };
}

export async function checkSocialGrowthPlanLimit(userId: number, rawPlan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  error?: { error: string };
}> {
  const plan = normalizePlan(rawPlan);
  const limit = socialGrowthPlanLimit(plan);

  const usage = await getOrCreateUsage(userId);
  const used = usage.socialGrowthPlansUsed ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      error: {
        error: "You have reached your Growth Planner limit on your current plan. Upgrade your plan to create more weekly plans.",
      },
    };
  }

  return { allowed: true, used, limit };
}

function socialGrowthManualIdeaLimit(plan: ReturnType<typeof normalizePlan>) {
  if (plan === "pro" || plan === "studio") return 30;
  return Infinity;
}

function socialGrowthImprovementLimit(plan: ReturnType<typeof normalizePlan>) {
  if (plan === "free") return 3;
  if (plan === "creator") return 15;
  if (plan === "pro") return 15;
  return Infinity;
}

function socialGrowthAdditionalIdeaLimit(plan: ReturnType<typeof normalizePlan>) {
  if (plan === "free") return 0;
  if (plan === "creator") return 8;
  if (plan === "pro") return 20;
  return Infinity;
}

function socialGrowthCounterKey(platform: SocialPlatform, kind: "manual" | "improvement" | "additional") {
  if (kind === "manual") {
    if (platform === "linkedin") return "socialGrowthManualIdeasUsedLinkedin" as const;
    if (platform === "instagram") return "socialGrowthManualIdeasUsedInstagram" as const;
    return "socialGrowthManualIdeasUsedTiktok" as const;
  }
  if (kind === "improvement") {
    if (platform === "linkedin") return "socialGrowthImprovementsUsedLinkedin" as const;
    if (platform === "instagram") return "socialGrowthImprovementsUsedInstagram" as const;
    return "socialGrowthImprovementsUsedTiktok" as const;
  }
  if (platform === "linkedin") return "socialGrowthAdditionalIdeasUsedLinkedin" as const;
  if (platform === "instagram") return "socialGrowthAdditionalIdeasUsedInstagram" as const;
  return "socialGrowthAdditionalIdeasUsedTiktok" as const;
}

export async function checkAndIncrementSocialGrowthManualIdea(
  userId: number,
  rawPlan: string,
  platform: SocialPlatform,
): Promise<{ allowed: boolean; used: number; limit: number; error?: { error: string } }> {
  const plan = normalizePlan(rawPlan);
  const limit = socialGrowthManualIdeaLimit(plan);
  const usage = await getOrCreateUsage(userId);
  const key = socialGrowthCounterKey(platform, "manual");
  const used = Number((usage as any)[key] ?? 0);
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit: Number.isFinite(limit) ? limit : used,
      error: { error: "You have reached the manual-idea limit for this platform on your current plan. Upgrade to create more ideas." },
    };
  }
  await db.update(userUsageTable).set({ [key]: used + 1, lastUpdated: new Date() } as any).where(eq(userUsageTable.userId, userId));
  return { allowed: true, used: used + 1, limit: Number.isFinite(limit) ? limit : used + 1 };
}

export async function checkAndIncrementSocialGrowthImprovement(
  userId: number,
  rawPlan: string,
  platform: SocialPlatform,
): Promise<{ allowed: boolean; used: number; limit: number; error?: { error: string } }> {
  const plan = normalizePlan(rawPlan);
  const limit = socialGrowthImprovementLimit(plan);
  const usage = await getOrCreateUsage(userId);
  const key = socialGrowthCounterKey(platform, "improvement");
  const used = Number((usage as any)[key] ?? 0);
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit: Number.isFinite(limit) ? limit : used,
      error: { error: "You have reached your AI improvement limit for this platform. Upgrade to improve more manual ideas." },
    };
  }
  await db.update(userUsageTable).set({ [key]: used + 1, lastUpdated: new Date() } as any).where(eq(userUsageTable.userId, userId));
  return { allowed: true, used: used + 1, limit: Number.isFinite(limit) ? limit : used + 1 };
}

export async function checkAndIncrementSocialGrowthAdditionalIdea(
  userId: number,
  rawPlan: string,
  platform: SocialPlatform,
): Promise<{ allowed: boolean; used: number; limit: number; error?: { error: string } }> {
  const plan = normalizePlan(rawPlan);
  const limit = socialGrowthAdditionalIdeaLimit(plan);
  const usage = await getOrCreateUsage(userId);
  const key = socialGrowthCounterKey(platform, "additional");
  const used = Number((usage as any)[key] ?? 0);
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit: Number.isFinite(limit) ? limit : used,
      error: { error: "You have reached your additional AI idea limit for this platform. Upgrade to generate more AI ideas." },
    };
  }
  await db.update(userUsageTable).set({ [key]: used + 1, lastUpdated: new Date() } as any).where(eq(userUsageTable.userId, userId));
  return { allowed: true, used: used + 1, limit: Number.isFinite(limit) ? limit : used + 1 };
}

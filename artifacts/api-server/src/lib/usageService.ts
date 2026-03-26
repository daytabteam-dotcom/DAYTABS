import { db, userUsageTable, analysisJobsTable, scriptPlannerChatsTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";
import { normalizePlan, PLAN_LIMITS, buildMonthlyLimitError, buildChatLimitError, type NormalizedPlan } from "./planLimits";

// ─── Period helpers ────────────────────────────────────────────────────────────
function currentPeriodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentPeriodEnd(): string {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
}

function isPeriodStale(periodStart: string): boolean {
  const [year, month] = periodStart.split("-").map(Number);
  const now = new Date();
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
}

/** Count existing analysis jobs and script chats for a user in the current month. */
async function countCurrentMonthUsage(userId: number): Promise<{ videoAnalyses: number; scriptChats: number }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [uploadRow] = await db
    .select({ cnt: count() })
    .from(analysisJobsTable)
    .where(and(
      eq(analysisJobsTable.userId, userId),
      eq(analysisJobsTable.mode, "video-analyzer"),
      gte(analysisJobsTable.createdAt, startOfMonth),
    ));

  const [chatRow] = await db
    .select({ cnt: count() })
    .from(scriptPlannerChatsTable)
    .where(and(
      eq(scriptPlannerChatsTable.userId, userId),
      gte(scriptPlannerChatsTable.createdAt, startOfMonth),
    ));

  return {
    videoAnalyses: Number(uploadRow?.cnt ?? 0),
    scriptChats: Number(chatRow?.cnt ?? 0),
  };
}

/**
 * Get or create a user's usage row. Handles monthly reset automatically.
 * On first access, initializes from existing analysis_jobs and script_planner_chats.
 */
export async function getOrCreateUsage(userId: number) {
  const periodStart = currentPeriodStart();
  const periodEnd = currentPeriodEnd();

  const [existing] = await db
    .select()
    .from(userUsageTable)
    .where(eq(userUsageTable.userId, userId))
    .limit(1);

  if (!existing) {
    // First access — initialize from existing data
    const { videoAnalyses, scriptChats } = await countCurrentMonthUsage(userId);
    const [row] = await db
      .insert(userUsageTable)
      .values({
        userId,
        periodStart,
        periodEnd,
        videoAnalysesUsed: videoAnalyses,
        scriptPlannerChatsUsed: scriptChats,
        lastUpdated: new Date(),
      })
      .returning();
    return row;
  }

  if (isPeriodStale(existing.periodStart)) {
    // New month — reset counters
    const [row] = await db
      .update(userUsageTable)
      .set({
        periodStart,
        periodEnd,
        videoAnalysesUsed: 0,
        scriptPlannerChatsUsed: 0,
        lastUpdated: new Date(),
      })
      .where(eq(userUsageTable.userId, userId))
      .returning();
    return row;
  }

  return existing;
}

// ─── Video Analysis limit check + increment ────────────────────────────────────
export async function checkAndIncrementVideoAnalysis(userId: number, rawPlan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  error?: ReturnType<typeof buildMonthlyLimitError>;
}> {
  const plan = normalizePlan(rawPlan);
  const planLimit = PLAN_LIMITS[plan].video_analyses_per_month;

  if (planLimit === Infinity) {
    return { allowed: true, used: 0, limit: -1 };
  }

  const usage = await getOrCreateUsage(userId);
  const used = usage.videoAnalysesUsed;

  if (used >= planLimit) {
    return { allowed: false, used, limit: planLimit, error: buildMonthlyLimitError(plan, used, planLimit) };
  }

  // Increment
  await db
    .update(userUsageTable)
    .set({ videoAnalysesUsed: used + 1, lastUpdated: new Date() })
    .where(eq(userUsageTable.userId, userId));

  return { allowed: true, used: used + 1, limit: planLimit };
}

/** Decrement video analyses used (rollback on pipeline failure). Minimum 0. */
export async function decrementVideoAnalysis(userId: number): Promise<void> {
  const [existing] = await db
    .select()
    .from(userUsageTable)
    .where(eq(userUsageTable.userId, userId))
    .limit(1);

  if (!existing || existing.videoAnalysesUsed <= 0) return;

  await db
    .update(userUsageTable)
    .set({ videoAnalysesUsed: existing.videoAnalysesUsed - 1, lastUpdated: new Date() })
    .where(eq(userUsageTable.userId, userId));
}

// ─── Script Chat limit check + increment ──────────────────────────────────────
export async function checkAndIncrementScriptChat(userId: number, rawPlan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  error?: ReturnType<typeof buildChatLimitError>;
}> {
  const plan = normalizePlan(rawPlan);
  const planLimit = PLAN_LIMITS[plan].script_planner_chats_per_month;

  if (planLimit === Infinity) {
    return { allowed: true, used: 0, limit: -1 };
  }

  const usage = await getOrCreateUsage(userId);
  const used = usage.scriptPlannerChatsUsed;

  if (used >= planLimit) {
    return { allowed: false, used, limit: planLimit, error: buildChatLimitError(plan, used, planLimit) };
  }

  // Increment
  await db
    .update(userUsageTable)
    .set({ scriptPlannerChatsUsed: used + 1, lastUpdated: new Date() })
    .where(eq(userUsageTable.userId, userId));

  return { allowed: true, used: used + 1, limit: planLimit };
}

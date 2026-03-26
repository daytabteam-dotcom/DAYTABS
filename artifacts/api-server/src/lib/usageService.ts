import { db, userUsageTable, analysisJobsTable, scriptPlannerChatsTable, usersTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";
import { normalizePlan, PLAN_LIMITS, buildMonthlyLimitError, buildChatLimitError, type NormalizedPlan } from "./planLimits";

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
async function countUsageSince(userId: number, since: Date): Promise<{ videoAnalyses: number; scriptChats: number }> {
  const [uploadRow] = await db
    .select({ cnt: count() })
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

  return {
    videoAnalyses: Number(uploadRow?.cnt ?? 0),
    scriptChats: Number(chatRow?.cnt ?? 0),
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
    const { videoAnalyses, scriptChats } = await countUsageSince(userId, cycleStart);
    const [row] = await db
      .insert(userUsageTable)
      .values({
        userId,
        periodStart: periodStartStr,
        periodEnd: dateToISODate(new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate())),
        videoAnalysesUsed: videoAnalyses,
        scriptPlannerChatsUsed: scriptChats,
        lastUpdated: new Date(),
      })
      .returning();
    return row;
  }

  if (isPeriodStale(existing.periodStart, cycleStart)) {
    // New cycle started — reset counters, seed from completed jobs this cycle
    const { videoAnalyses, scriptChats } = await countUsageSince(userId, cycleStart);
    const [row] = await db
      .update(userUsageTable)
      .set({
        periodStart: periodStartStr,
        periodEnd: dateToISODate(new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate())),
        videoAnalysesUsed: videoAnalyses,
        scriptPlannerChatsUsed: scriptChats,
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
export async function checkVideoAnalysisLimit(userId: number, rawPlan: string): Promise<{
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

  return { allowed: true, used, limit: planLimit };
}

// ─── Video Analysis — increment after successful pipeline ─────────────────────

/**
 * Increment the video analysis counter. Call this only after the pipeline
 * completes successfully and the report is generated.
 */
export async function incrementVideoAnalysis(userId: number): Promise<void> {
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
    await db.update(userUsageTable).set({ videoAnalysesUsed: 1, lastUpdated: new Date() }).where(eq(userUsageTable.userId, userId));
    return;
  }

  await db
    .update(userUsageTable)
    .set({ videoAnalysesUsed: existing.videoAnalysesUsed + 1, lastUpdated: new Date() })
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

  await db
    .update(userUsageTable)
    .set({ scriptPlannerChatsUsed: used + 1, lastUpdated: new Date() })
    .where(eq(userUsageTable.userId, userId));

  return { allowed: true, used: used + 1, limit: planLimit };
}

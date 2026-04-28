import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";
import { checkAndIncrementSocialGrowthPlan } from "../../lib/usageService";
import type { SocialPlatform, SocialPostPerformanceFeedback, SocialPlanDay } from "../../models/socialGrowthPlan";
import { generateSocialWeeklyPlanAi, regenerateSocialPlanDayAi } from "../../services/socialGrowthAiService";
import {
  createSocialWeeklyPlan,
  deleteSocialPlanDay,
  getLatestFeedbackForPlan,
  getLatestSocialWeeklyPlan,
  listSocialWeeklyPlans,
  saveSocialWeeklyPlanFeedback,
  updateSocialPlanDay,
} from "../../services/socialGrowthPlanService";

const router = Router();
router.use(requireAuth);

function isPlatform(value: unknown): value is SocialPlatform {
  return value === "linkedin" || value === "tiktok" || value === "instagram";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekUtc(date: Date) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

function weekRangeForStart(startDate: string) {
  return { startDate, endDate: addDaysIso(startDate, 6) };
}

router.get("/plans", async (req, res) => {
  const platform = req.query.platform;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }
  const plans = await listSocialWeeklyPlans(req.auth!.user_id, platform);
  res.json({ plans });
});

router.get("/plans/latest", async (req, res) => {
  const platform = req.query.platform;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }
  const plan = await getLatestSocialWeeklyPlan(req.auth!.user_id, platform);
  res.json({ plan });
});

router.post("/plans/generate", async (req, res) => {
  const {
    platform,
    topic,
    postsPerWeek,
    audience,
    goal,
    tone,
    formatPreference,
    startDate,
  } = req.body as Record<string, unknown>;

  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  const trimmedTopic = String(topic ?? "").trim();
  if (!trimmedTopic) {
    res.status(400).json({ error: "Topic is required." });
    return;
  }

  const posts = Math.max(1, Math.min(7, Number(postsPerWeek ?? 0) || 0));
  if (!posts) {
    res.status(400).json({ error: "postsPerWeek must be between 1 and 7." });
    return;
  }

  const rawPlan = req.auth!.plan ?? "free";
  const usageCheck = await checkAndIncrementSocialGrowthPlan(req.auth!.user_id, rawPlan);
  if (!usageCheck.allowed) {
    res.status(429).json({ ...usageCheck.error, limitReached: true, type: "growth_planner_limit" });
    return;
  }

  const computedStart = isIsoDate(startDate)
    ? startDate
    : startOfWeekUtc(new Date()).toISOString().slice(0, 10);
  const { endDate } = weekRangeForStart(computedStart);

  const model = PLAN_LIMITS[normalizePlan(rawPlan)].script_planner_model;

  const planPayload = await generateSocialWeeklyPlanAi({
    userId: req.auth!.user_id,
    model,
    platform,
    startDate: computedStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    audience: typeof audience === "string" ? audience : undefined,
    goal: typeof goal === "string" ? goal : undefined,
    tone: typeof tone === "string" ? tone : undefined,
    formatPreference: typeof formatPreference === "string" ? formatPreference : undefined,
    previousPlan: null,
    previousFeedback: null,
    skippedFeedback: false,
  });

  const row = await createSocialWeeklyPlan(req.auth!.user_id, {
    platform,
    startDate: computedStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    audience: typeof audience === "string" ? audience : undefined,
    goal: typeof goal === "string" ? goal : undefined,
    tone: typeof tone === "string" ? tone : undefined,
    formatPreference: typeof formatPreference === "string" ? formatPreference : undefined,
    plan: planPayload,
  });

  res.json({ plan: row });
});

router.post("/plans/:id/feedback", async (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }
  const { platform, feedback } = req.body as { platform?: unknown; feedback?: unknown };
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }
  if (!Array.isArray(feedback)) {
    res.status(400).json({ error: "feedback must be an array" });
    return;
  }

  const saved = await saveSocialWeeklyPlanFeedback(req.auth!.user_id, planId, platform, feedback as SocialPostPerformanceFeedback[]);
  res.json({ feedback: saved });
});

router.post("/plans/:id/generate-next-week", async (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }

  const {
    platform,
    topic,
    postsPerWeek,
    audience,
    goal,
    tone,
    formatPreference,
    feedback,
    skippedFeedback,
  } = req.body as Record<string, unknown>;

  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  const currentPlan = await getLatestSocialWeeklyPlan(req.auth!.user_id, platform);
  if (!currentPlan || currentPlan.id !== planId) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (todayIso <= currentPlan.endDate) {
    res.status(400).json({ error: "This week is still active. You can generate next week after this plan ends." });
    return;
  }

  const trimmedTopic = String(topic ?? currentPlan.topic ?? "").trim();
  if (!trimmedTopic) {
    res.status(400).json({ error: "Topic is required." });
    return;
  }

  const posts = Math.max(1, Math.min(7, Number(postsPerWeek ?? currentPlan.postsPerWeek ?? 0) || 0));
  const nextStart = addDaysIso(currentPlan.endDate, 1);
  const { endDate } = weekRangeForStart(nextStart);

  let normalizedFeedback: SocialPostPerformanceFeedback[] | null = null;
  const wantsSkip = Boolean(skippedFeedback);
  if (!wantsSkip && Array.isArray(feedback)) {
    normalizedFeedback = feedback as SocialPostPerformanceFeedback[];
    await saveSocialWeeklyPlanFeedback(req.auth!.user_id, planId, platform, normalizedFeedback);
  }

  const model = PLAN_LIMITS[normalizePlan(req.auth!.plan ?? "free")].script_planner_model;

  const planPayload = await generateSocialWeeklyPlanAi({
    userId: req.auth!.user_id,
    model,
    platform,
    startDate: nextStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    audience: typeof audience === "string" ? audience : (currentPlan.audience ?? undefined),
    goal: typeof goal === "string" ? goal : (currentPlan.goal ?? undefined),
    tone: typeof tone === "string" ? tone : (currentPlan.tone ?? undefined),
    formatPreference: typeof formatPreference === "string" ? formatPreference : (currentPlan.formatPreference ?? undefined),
    previousPlan: currentPlan.plan as any,
    previousFeedback: wantsSkip ? null : normalizedFeedback ?? ((await getLatestFeedbackForPlan(planId))?.feedback as any ?? null),
    skippedFeedback: wantsSkip,
  });

  const row = await createSocialWeeklyPlan(req.auth!.user_id, {
    platform,
    startDate: nextStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    audience: typeof audience === "string" ? audience : (currentPlan.audience ?? undefined),
    goal: typeof goal === "string" ? goal : (currentPlan.goal ?? undefined),
    tone: typeof tone === "string" ? tone : (currentPlan.tone ?? undefined),
    formatPreference: typeof formatPreference === "string" ? formatPreference : (currentPlan.formatPreference ?? undefined),
    plan: planPayload,
  });

  res.json({ plan: row, message: "Your feedback was saved. Creating next week's plan now." });
});

router.patch("/plans/:id/days/:dayId", async (req, res) => {
  const planId = Number(req.params.id);
  const dayId = String(req.params.dayId ?? "").trim();
  if (!Number.isFinite(planId) || planId <= 0 || !dayId) {
    res.status(400).json({ error: "Invalid plan id or day id" });
    return;
  }

  const { patch } = req.body as { patch?: unknown };
  const recordPatch = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : null;
  if (!recordPatch) {
    res.status(400).json({ error: "patch must be an object" });
    return;
  }

  const updated = await updateSocialPlanDay(req.auth!.user_id, planId, dayId, recordPatch);
  if (!updated) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json({ plan: updated });
});

router.delete("/plans/:id/days/:dayId", async (req, res) => {
  const planId = Number(req.params.id);
  const dayId = String(req.params.dayId ?? "").trim();
  if (!Number.isFinite(planId) || planId <= 0 || !dayId) {
    res.status(400).json({ error: "Invalid plan id or day id" });
    return;
  }

  const updated = await deleteSocialPlanDay(req.auth!.user_id, planId, dayId);
  if (!updated) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json({ plan: updated });
});

router.post("/plans/:id/days/:dayId/regenerate", async (req, res) => {
  const planId = Number(req.params.id);
  const dayId = String(req.params.dayId ?? "").trim();
  if (!Number.isFinite(planId) || planId <= 0 || !dayId) {
    res.status(400).json({ error: "Invalid plan id or day id" });
    return;
  }

  const platform = req.body?.platform;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  const currentPlan = await getLatestSocialWeeklyPlan(req.auth!.user_id, platform);
  if (!currentPlan || currentPlan.id !== planId) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const payload = currentPlan.plan as { days?: SocialPlanDay[] };
  const day = (payload.days ?? []).find((item) => item.id === dayId);
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }

  const model = PLAN_LIMITS[normalizePlan(req.auth!.plan ?? "free")].script_planner_model;
  const regenerated = await regenerateSocialPlanDayAi({
    userId: req.auth!.user_id,
    model,
    platform,
    topic: currentPlan.topic,
    day,
  });

  const updated = await updateSocialPlanDay(req.auth!.user_id, planId, dayId, regenerated as Record<string, unknown>);
  if (!updated) {
    res.status(500).json({ error: "Could not save regenerated day" });
    return;
  }
  res.json({ plan: updated });
});

export default router;


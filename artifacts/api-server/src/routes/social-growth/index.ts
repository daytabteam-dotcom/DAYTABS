import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";
import { checkAndIncrementSocialGrowthAdditionalIdea, checkAndIncrementSocialGrowthManualIdeaImprovement, checkAndIncrementSocialGrowthPlan, getOrCreateUsage } from "../../lib/usageService";
import type {
  SocialPlatform,
  SocialPostPerformanceFeedback,
  SocialPlanDay,
  SocialPostingMode,
  SocialWeekday,
} from "../../models/socialGrowthPlan";
import { buildSocialGrowthBehaviorSummary } from "../../lib/socialGrowthBehaviorSummary";
import { canGenerateAdditionalIdea, canImproveManualIdea, canUsePlatform, getNextWeekGenerationMode } from "../../lib/contentGrowthLimits";
import { generateSocialWeeklyPlanAi, regenerateSocialPlanDayAi } from "../../services/socialGrowthAiService";
import {
  createSocialWeeklyPlan,
  addSocialPlanDay,
  deleteSocialPlanDay,
  getLatestFeedbackForPlan,
  getLatestSocialWeeklyPlan,
  listSocialWeeklyPlans,
  listUsedSocialGrowthPlatforms,
  saveSocialWeeklyPlanFeedback,
  updateSocialPlanDay,
} from "../../services/socialGrowthPlanService";

const router = Router();
router.use(requireAuth);

function isPlatform(value: unknown): value is SocialPlatform {
  return value === "linkedin" || value === "tiktok" || value === "instagram";
}

function isPostingMode(value: unknown): value is SocialPostingMode {
  return value === "manual" || value === "ai_optimized";
}

function isWeekday(value: unknown): value is SocialWeekday {
  return value === "Mon" || value === "Tue" || value === "Wed" || value === "Thu" || value === "Fri" || value === "Sat" || value === "Sun";
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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

router.get("/usage", async (req, res) => {
  const usage = await getOrCreateUsage(req.auth!.user_id);
  const usedPlatforms = await listUsedSocialGrowthPlatforms(req.auth!.user_id);
  res.json({
    weeksGeneratedTotal: usage.socialGrowthPlansUsed ?? 0,
    usedPlatforms,
    aiImprovementsByPlatform: {
      linkedin: usage.socialGrowthAiImprovementsLinkedin ?? 0,
      tiktok: usage.socialGrowthAiImprovementsTiktok ?? 0,
      instagram: usage.socialGrowthAiImprovementsInstagram ?? 0,
    },
    additionalIdeasByPlatform: {
      linkedin: usage.socialGrowthAdditionalAiIdeasLinkedin ?? 0,
      tiktok: usage.socialGrowthAdditionalAiIdeasTiktok ?? 0,
      instagram: usage.socialGrowthAdditionalAiIdeasInstagram ?? 0,
    },
  });
});

router.post("/plans/:id/days", async (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }

  const {
    date,
    contentIdea,
    contentType,
    hook,
    notes,
    tags,
    bestPostingTime,
    platform,
  } = req.body as Record<string, unknown>;

  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }
  if (!isIsoDate(date)) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const title = normalizeString(contentIdea);
  if (!title) {
    res.status(400).json({ error: "Idea title is required" });
    return;
  }

  const hookText = normalizeString(hook) || title;
  const noteText = normalizeString(notes);
  const normalizedTags = Array.isArray(tags)
    ? tags.map((item) => normalizeString(item)).filter(Boolean).slice(0, 18)
    : normalizeString(tags).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 18);

  const created = await addSocialPlanDay(req.auth!.user_id, planId, {
    date,
    patch: {
      contentIdea: title,
      contentType: normalizeString(contentType) || undefined,
      hook: hookText,
      outline: [],
      postContext: noteText || undefined,
      bestPostingTime: normalizeString(bestPostingTime),
      rationale: "",
      tags: normalizedTags,
      descriptionSuggestion: noteText,
      thumbnailConcept: "",
      status: "not_finished",
      ideaOrigin: "manual",
      aiImproved: false,
    },
  });
  if (!created) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json({ plan: created.plan, day: created.day });
});

router.post("/plans/generate", async (req, res) => {
  const {
    platform,
    topic,
    postsPerWeek,
    followersCount,
    postingMode,
    preferredWeekdays,
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

  const rawPlan = req.auth!.plan ?? "free";
  const usedPlatforms = await listUsedSocialGrowthPlatforms(req.auth!.user_id);
  const platformDecision = canUsePlatform(rawPlan, platform, usedPlatforms);
  if (!platformDecision.allowed) {
    res.status(403).json({ error: platformDecision.message, code: platformDecision.code });
    return;
  }

  const trimmedTopic = String(topic ?? "").trim();
  if (!trimmedTopic) {
    res.status(400).json({ error: "Topic is required." });
    return;
  }

  const mode: SocialPostingMode = isPostingMode(postingMode) ? postingMode : "manual";
  const weekdays = Array.isArray(preferredWeekdays) ? preferredWeekdays.filter(isWeekday) : [];

  const posts = mode === "ai_optimized"
    ? Math.max(1, Math.min(7, Number(postsPerWeek ?? 5) || 5))
    : Math.max(1, Math.min(7, Number(postsPerWeek ?? 0) || 0));
  if (mode === "manual" && !posts) {
    res.status(400).json({ error: "postsPerWeek must be between 1 and 7." });
    return;
  }

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
  const normalizedFollowersCount = Number.isFinite(Number(followersCount))
    ? Math.max(0, Math.floor(Number(followersCount)))
    : null;

  const aiResult = await generateSocialWeeklyPlanAi({
    userId: req.auth!.user_id,
    model,
    platform,
    startDate: computedStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    postingMode: mode,
    preferredWeekdays: weekdays.length ? weekdays : undefined,
    audience: typeof audience === "string" ? audience : undefined,
    goal: typeof goal === "string" ? goal : undefined,
    tone: typeof tone === "string" ? tone : undefined,
    formatPreference: typeof formatPreference === "string" ? formatPreference : undefined,
    followersCount: normalizedFollowersCount,
    previousWeekBehaviorSummary: null,
    skippedFeedback: false,
  });

  const row = await createSocialWeeklyPlan(req.auth!.user_id, {
    platform,
    startDate: computedStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: aiResult.postsPerWeek,
    followersCount: normalizedFollowersCount,
    postingMode: mode,
    preferredWeekdays: weekdays.length ? weekdays : undefined,
    audience: typeof audience === "string" ? audience : undefined,
    goal: typeof goal === "string" ? goal : undefined,
    tone: typeof tone === "string" ? tone : undefined,
    formatPreference: typeof formatPreference === "string" ? formatPreference : undefined,
    plan: aiResult.plan,
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
    followersCount,
    postingMode,
    preferredWeekdays,
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

  const mode: SocialPostingMode = isPostingMode(postingMode) ? postingMode : "manual";
  const weekdays = Array.isArray(preferredWeekdays) ? preferredWeekdays.filter(isWeekday) : [];

  const currentPlan = await getLatestSocialWeeklyPlan(req.auth!.user_id, platform);
  if (!currentPlan || currentPlan.id !== planId) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const rawPlan = req.auth!.plan ?? "free";
  const usedPlatforms = await listUsedSocialGrowthPlatforms(req.auth!.user_id);
  const platformDecision = canUsePlatform(rawPlan, platform, usedPlatforms);
  if (!platformDecision.allowed) {
    res.status(403).json({ error: platformDecision.message, code: platformDecision.code });
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

  const posts = mode === "ai_optimized"
    ? Math.max(1, Math.min(7, Number(postsPerWeek ?? currentPlan.postsPerWeek ?? 5) || 5))
    : Math.max(1, Math.min(7, Number(postsPerWeek ?? currentPlan.postsPerWeek ?? 0) || 0));
  const nextStart = addDaysIso(currentPlan.endDate, 1);
  const { endDate } = weekRangeForStart(nextStart);

  const nextWeekMode = getNextWeekGenerationMode(rawPlan);
  const allowBehavior = nextWeekMode === "behavior_based";
  let normalizedFeedback: SocialPostPerformanceFeedback[] | null = null;
  const wantsSkip = nextWeekMode === "goal_based" ? true : Boolean(skippedFeedback);
  if (allowBehavior && !wantsSkip && Array.isArray(feedback)) {
    normalizedFeedback = feedback as SocialPostPerformanceFeedback[];
    await saveSocialWeeklyPlanFeedback(req.auth!.user_id, planId, platform, normalizedFeedback);
  }

  const usageCheck = await checkAndIncrementSocialGrowthPlan(req.auth!.user_id, rawPlan);
  if (!usageCheck.allowed) {
    res.status(429).json({ ...usageCheck.error, limitReached: true, type: "growth_planner_limit" });
    return;
  }

  const model = PLAN_LIMITS[normalizePlan(req.auth!.plan ?? "free")].script_planner_model;
  const normalizedFollowersCount = Number.isFinite(Number(followersCount))
    ? Math.max(0, Math.floor(Number(followersCount)))
    : (Number.isFinite(Number(currentPlan.followersCount)) ? Number(currentPlan.followersCount) : null);
  const priorFeedback = wantsSkip || !allowBehavior
    ? null
    : normalizedFeedback ?? ((await getLatestFeedbackForPlan(planId))?.feedback as any ?? null);
  const behaviorSummary = allowBehavior
    ? buildSocialGrowthBehaviorSummary({
      previousPlan: currentPlan.plan as any,
      previousFeedback: priorFeedback,
      skippedFeedback: wantsSkip,
    })
    : null;

  const aiResult = await generateSocialWeeklyPlanAi({
    userId: req.auth!.user_id,
    model,
    platform,
    startDate: nextStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: posts,
    postingMode: mode,
    preferredWeekdays: weekdays.length ? weekdays : undefined,
    audience: typeof audience === "string" ? audience : (currentPlan.audience ?? undefined),
    goal: typeof goal === "string" ? goal : (currentPlan.goal ?? undefined),
    tone: typeof tone === "string" ? tone : (currentPlan.tone ?? undefined),
    formatPreference: typeof formatPreference === "string" ? formatPreference : (currentPlan.formatPreference ?? undefined),
    followersCount: normalizedFollowersCount,
    previousWeekBehaviorSummary: behaviorSummary,
    skippedFeedback: wantsSkip,
    nextWeekMode,
  });

  const row = await createSocialWeeklyPlan(req.auth!.user_id, {
    platform,
    startDate: nextStart,
    endDate,
    topic: trimmedTopic,
    postsPerWeek: aiResult.postsPerWeek,
    followersCount: normalizedFollowersCount,
    postingMode: mode,
    preferredWeekdays: weekdays.length ? weekdays : undefined,
    audience: typeof audience === "string" ? audience : (currentPlan.audience ?? undefined),
    goal: typeof goal === "string" ? goal : (currentPlan.goal ?? undefined),
    tone: typeof tone === "string" ? tone : (currentPlan.tone ?? undefined),
    formatPreference: typeof formatPreference === "string" ? formatPreference : (currentPlan.formatPreference ?? undefined),
    plan: aiResult.plan,
  });

  res.json({ plan: row, message: allowBehavior ? "Your feedback was saved. Creating next week's plan now." : "Creating next week's plan now." });
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
  const intent = typeof req.body?.intent === "string" ? req.body.intent : undefined;
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

  const rawPlan = req.auth!.plan ?? "free";
  const usage = await getOrCreateUsage(req.auth!.user_id);
  const isManualImprovement = (day.ideaOrigin ?? "ai") === "manual" && typeof intent === "string" && intent.trim().length > 0;
  const aiDecision = isManualImprovement
    ? canImproveManualIdea(rawPlan, platform, {
      aiImprovementsByPlatform: {
        linkedin: usage.socialGrowthAiImprovementsLinkedin ?? 0,
        tiktok: usage.socialGrowthAiImprovementsTiktok ?? 0,
        instagram: usage.socialGrowthAiImprovementsInstagram ?? 0,
      },
    })
    : canGenerateAdditionalIdea(rawPlan, platform, {
      additionalIdeasByPlatform: {
        linkedin: usage.socialGrowthAdditionalAiIdeasLinkedin ?? 0,
        tiktok: usage.socialGrowthAdditionalAiIdeasTiktok ?? 0,
        instagram: usage.socialGrowthAdditionalAiIdeasInstagram ?? 0,
      },
    });
  if (!aiDecision.allowed) {
    res.status(403).json({ error: aiDecision.message, code: aiDecision.code, limitReached: true });
    return;
  }

  const usageCheck = isManualImprovement
    ? await checkAndIncrementSocialGrowthManualIdeaImprovement(req.auth!.user_id, rawPlan, platform)
    : await checkAndIncrementSocialGrowthAdditionalIdea(req.auth!.user_id, rawPlan, platform);
  if (!usageCheck.allowed) {
    res.status(403).json({ ...usageCheck.error, code: isManualImprovement ? "AI_IMPROVEMENT_LIMIT" : "ADDITIONAL_IDEA_LIMIT", limitReached: true });
    return;
  }

  const model = PLAN_LIMITS[normalizePlan(req.auth!.plan ?? "free")].script_planner_model;
  const regenerated = await regenerateSocialPlanDayAi({
    userId: req.auth!.user_id,
    model,
    platform,
    topic: currentPlan.topic,
    day,
    intent,
  });

  const updated = await updateSocialPlanDay(req.auth!.user_id, planId, dayId, regenerated as Record<string, unknown>);
  if (!updated) {
    res.status(500).json({ error: "Could not save regenerated day" });
    return;
  }
  res.json({ plan: updated });
});

export default router;

import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { getOrCreateUsage } from "../../lib/usageService";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";

const router: IRouter = Router();

router.use(requireAuth);

/**
 * GET /api/user/usage
 * Returns the user's current plan, usage counters, and feature flags.
 * Frontend calls this on app load and after each analysis completes.
 */
router.get("/usage", async (req, res) => {
  try {
    const userId = req.auth!.user_id;
    const rawPlan = req.auth!.plan ?? "free";
    const plan = normalizePlan(rawPlan);
    const limits = PLAN_LIMITS[plan];

    const usage = await getOrCreateUsage(userId);

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    const resetsOn = nextMonth.toISOString().split("T")[0];

    res.json({
      plan,
      usage: {
        video: {
          used: usage.videoAnalysisUsageUsed ?? usage.videoAnalysesUsed,
          limit: limits.video_usage_budget_per_month,
          analyses_used: usage.videoAnalysisRunsUsed ?? usage.videoAnalysesUsed,
          analyses_limit: limits.video_analyses_display_limit,
          resets_on: resetsOn,
        },
        scripts: {
          used: usage.scriptGenerationsUsed ?? usage.scriptPlannerChatsUsed,
          limit: limits.script_generations_per_month,
          resets_on: resetsOn,
        },
      },
      features: {
        quality_report: limits.features.quality_report,
        editing_report: limits.features.editing_report,
        publish_package: limits.features.publish_package,
        short_clip_ideas: limits.features.short_clip_ideas,
        subtitle_download: limits.features.subtitle_download,
        teleprompter: limits.features.teleprompter,
        dubbing: limits.features.dubbing,
        priority_processing: limits.features.priority_processing,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get usage");
    res.status(500).json({ error: "Failed to fetch usage data." });
  }
});

export default router;

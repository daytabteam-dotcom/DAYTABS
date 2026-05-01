import { normalizePlan } from "./planLimits";
import type { SocialPlatform } from "../models/socialGrowthPlan";

export type ContentGrowthPlan = "free" | "creator" | "pro" | "studio";

export type ContentGrowthLimitCode =
  | "PLATFORM_LIMIT"
  | "WEEK_LIMIT"
  | "AI_IMPROVEMENT_LIMIT"
  | "ADDITIONAL_IDEA_LIMIT"
  | "BEHAVIOR_BASED_NOT_AVAILABLE";

export const CONTENT_GROWTH_LIMIT_MESSAGES: Record<ContentGrowthLimitCode, string> = {
  PLATFORM_LIMIT: "You’ve reached the platform limit for your plan. Upgrade to unlock more platforms.",
  WEEK_LIMIT: "Free plan includes one Content Growth week. Upgrade to generate more plans.",
  AI_IMPROVEMENT_LIMIT: "You’ve used all AI improvements included in your plan.",
  ADDITIONAL_IDEA_LIMIT: "Additional AI-generated ideas are not included in your current plan.",
  BEHAVIOR_BASED_NOT_AVAILABLE: "Behavior-based next week planning is available on Pro and Studio plans.",
};

export type ContentGrowthUsage = {
  weeksGeneratedTotal?: number | null;
  aiImprovementsByPlatform?: Partial<Record<SocialPlatform, number | null>> | null;
  additionalIdeasByPlatform?: Partial<Record<SocialPlatform, number | null>> | null;
};

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; code: ContentGrowthLimitCode; message: string };

function asPlan(rawPlan: string): ContentGrowthPlan {
  return normalizePlan(rawPlan) as ContentGrowthPlan;
}

function platformCount(alreadyUsedPlatforms: SocialPlatform[] | null | undefined) {
  const set = new Set((alreadyUsedPlatforms ?? []).filter(Boolean));
  return set.size;
}

function getUsageNumber(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getByPlatform(map: ContentGrowthUsage["aiImprovementsByPlatform"] | ContentGrowthUsage["additionalIdeasByPlatform"], platform: SocialPlatform) {
  if (!map) return 0;
  return getUsageNumber(map[platform] ?? 0);
}

function sumPlatforms(map: ContentGrowthUsage["aiImprovementsByPlatform"] | ContentGrowthUsage["additionalIdeasByPlatform"]) {
  if (!map) return 0;
  return getUsageNumber(map.linkedin) + getUsageNumber(map.tiktok) + getUsageNumber(map.instagram);
}

export function getContentGrowthLimits(rawPlan: string) {
  const plan = asPlan(rawPlan);
  const maxPlatforms = plan === "free" ? 1 : plan === "creator" ? 2 : 3;
  const freeWeeksTotal = 1;
  const aiImprovementsFreeTotal = 3;
  const aiImprovementsPerPlatform = plan === "creator" ? 15 : plan === "pro" ? 30 : Infinity;
  const additionalIdeasPerPlatform = plan === "creator" ? 8 : plan === "pro" ? 20 : Infinity;
  const additionalIdeasAllowed = plan !== "free";
  const fullMonthAllowed = plan !== "free";
  const nextWeekMode = getNextWeekGenerationMode(rawPlan);

  return {
    plan,
    maxPlatforms,
    freeWeeksTotal,
    fullMonthAllowed,
    aiImprovementsFreeTotal,
    aiImprovementsPerPlatform,
    additionalIdeasAllowed,
    additionalIdeasPerPlatform,
    nextWeekMode,
    behaviorBasedNextWeek: nextWeekMode === "behavior_based",
    showPostPerformanceModal: shouldShowPostPerformanceModal(rawPlan),
  };
}

export function canUsePlatform(rawPlan: string, platform: SocialPlatform, alreadyUsedPlatforms: SocialPlatform[] | null | undefined): LimitDecision {
  const plan = asPlan(rawPlan);
  if (plan === "pro" || plan === "studio") return { allowed: true };

  const usedPlatforms = (alreadyUsedPlatforms ?? []).filter(Boolean);
  if (usedPlatforms.includes(platform)) return { allowed: true };

  const max = plan === "free" ? 1 : 2;
  if (platformCount(usedPlatforms) >= max) {
    return {
      allowed: false,
      code: "PLATFORM_LIMIT",
      message: plan === "free"
        ? "Free plan includes Content Growth for 1 platform only. Upgrade to unlock more platforms."
        : "Creator plan includes 2 platforms. Upgrade to Pro to unlock all platforms.",
    };
  }

  return { allowed: true };
}

export function canGenerateInitialPlan(rawPlan: string, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const plan = asPlan(rawPlan);
  if (plan !== "free") return { allowed: true };
  const weeks = getUsageNumber(usage?.weeksGeneratedTotal ?? 0);
  if (weeks >= 1) {
    return { allowed: false, code: "WEEK_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.WEEK_LIMIT };
  }
  return { allowed: true };
}

export function canGenerateFullMonth(rawPlan: string): LimitDecision {
  const plan = asPlan(rawPlan);
  if (plan === "free") {
    return { allowed: false, code: "WEEK_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.WEEK_LIMIT };
  }
  return { allowed: true };
}

export function canImproveManualIdea(rawPlan: string, platform: SocialPlatform, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const plan = asPlan(rawPlan);
  if (plan === "studio") return { allowed: true };

  const improvementsByPlatform = usage?.aiImprovementsByPlatform ?? null;
  if (plan === "free") {
    const usedTotal = sumPlatforms(improvementsByPlatform);
    if (usedTotal >= 3) {
      return { allowed: false, code: "AI_IMPROVEMENT_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.AI_IMPROVEMENT_LIMIT };
    }
    return { allowed: true };
  }

  const limit = plan === "creator" ? 15 : 30;
  const used = getByPlatform(improvementsByPlatform, platform);
  if (used >= limit) {
    return { allowed: false, code: "AI_IMPROVEMENT_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.AI_IMPROVEMENT_LIMIT };
  }
  return { allowed: true };
}

export function canGenerateAdditionalIdea(rawPlan: string, platform: SocialPlatform, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const plan = asPlan(rawPlan);
  if (plan === "free") {
    return { allowed: false, code: "ADDITIONAL_IDEA_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.ADDITIONAL_IDEA_LIMIT };
  }
  if (plan === "studio") return { allowed: true };

  const additionalByPlatform = usage?.additionalIdeasByPlatform ?? null;
  const limit = plan === "creator" ? 8 : 20;
  const used = getByPlatform(additionalByPlatform, platform);
  if (used >= limit) {
    return { allowed: false, code: "ADDITIONAL_IDEA_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.ADDITIONAL_IDEA_LIMIT };
  }
  return { allowed: true };
}

export function shouldUseBehaviorBasedNextWeek(rawPlan: string) {
  const plan = asPlan(rawPlan);
  return plan === "pro" || plan === "studio";
}

export function shouldShowPostPerformanceModal(rawPlan: string) {
  const plan = asPlan(rawPlan);
  return plan === "pro" || plan === "studio";
}

export function getNextWeekGenerationMode(rawPlan: string): "goal_based" | "behavior_based" {
  const plan = asPlan(rawPlan);
  if (plan === "creator") return "goal_based";
  if (plan === "pro" || plan === "studio") return "behavior_based";
  // Free users can only generate one week total, so this is mostly irrelevant.
  return "goal_based";
}

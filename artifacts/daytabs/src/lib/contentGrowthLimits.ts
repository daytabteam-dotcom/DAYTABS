export type ContentGrowthPlan = "free" | "creator" | "pro" | "studio";
export type ContentGrowthPlatform = "youtube" | "linkedin" | "tiktok" | "instagram";

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
  usedPlatforms?: Array<Exclude<ContentGrowthPlatform, "youtube">> | null;
  aiImprovementsByPlatform?: Partial<Record<Exclude<ContentGrowthPlatform, "youtube">, number | null>> | null;
  additionalIdeasByPlatform?: Partial<Record<Exclude<ContentGrowthPlatform, "youtube">, number | null>> | null;
};

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; code: ContentGrowthLimitCode; message: string; upgradePlan?: "creator" | "pro" | "studio" };

function normalizePlan(plan: string): ContentGrowthPlan {
  if (plan === "premium") return "creator";
  if (plan === "professional") return "studio";
  if (plan === "creator" || plan === "pro" || plan === "studio") return plan;
  return "free";
}

function asUsageNumber(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function platformCount(platforms: Array<string> | null | undefined) {
  return new Set((platforms ?? []).filter(Boolean)).size;
}

function sumPlatforms(map: ContentGrowthUsage["aiImprovementsByPlatform"] | ContentGrowthUsage["additionalIdeasByPlatform"]) {
  if (!map) return 0;
  return asUsageNumber(map.linkedin) + asUsageNumber(map.tiktok) + asUsageNumber(map.instagram);
}

function getByPlatform(map: ContentGrowthUsage["aiImprovementsByPlatform"] | ContentGrowthUsage["additionalIdeasByPlatform"], platform: Exclude<ContentGrowthPlatform, "youtube">) {
  if (!map) return 0;
  return asUsageNumber(map[platform] ?? 0);
}

export function getContentGrowthLimits(plan: string) {
  const normalized = normalizePlan(plan);
  return {
    normalizedPlan: normalized,
    maxPlatforms: normalized === "free" ? 1 : normalized === "creator" ? 2 : 3,
    freeWeeksTotal: 1,
    fullMonthAllowed: normalized !== "free",
    aiImprovementsFreeTotal: 3,
    aiImprovementsPerPlatform: normalized === "creator" ? 15 : normalized === "pro" ? 30 : Infinity,
    additionalIdeasAllowed: normalized !== "free",
    additionalIdeasPerPlatform: normalized === "creator" ? 8 : normalized === "pro" ? 20 : Infinity,
    nextWeekMode: getNextWeekGenerationMode(plan),
  };
}

export function canUsePlatform(plan: string, platform: ContentGrowthPlatform, alreadyUsedPlatforms: Array<Exclude<ContentGrowthPlatform, "youtube">> | null | undefined): LimitDecision {
  const normalized = normalizePlan(plan);
  if (platform === "youtube") {
    return { allowed: false, code: "PLATFORM_LIMIT", message: "YouTube Content Growth is coming soon." };
  }
  if (normalized === "pro" || normalized === "studio") return { allowed: true };

  const used = (alreadyUsedPlatforms ?? []).filter(Boolean);
  if (used.includes(platform)) return { allowed: true };

  const max = normalized === "free" ? 1 : 2;
  if (platformCount(used) >= max) {
    return {
      allowed: false,
      code: "PLATFORM_LIMIT",
      message: normalized === "free"
        ? "Free plan includes Content Growth for 1 platform only. Upgrade to unlock more platforms."
        : "Creator plan includes 2 platforms. Upgrade to Pro to unlock all platforms.",
      upgradePlan: normalized === "free" ? "creator" : "pro",
    };
  }

  return { allowed: true };
}

export function canGenerateInitialPlan(plan: string, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const normalized = normalizePlan(plan);
  if (normalized !== "free") return { allowed: true };
  const weeks = asUsageNumber(usage?.weeksGeneratedTotal ?? 0);
  if (weeks >= 1) {
    return { allowed: false, code: "WEEK_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.WEEK_LIMIT, upgradePlan: "creator" };
  }
  return { allowed: true };
}

export function canGenerateFullMonth(plan: string): LimitDecision {
  const normalized = normalizePlan(plan);
  if (normalized === "free") return { allowed: false, code: "WEEK_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.WEEK_LIMIT, upgradePlan: "creator" };
  return { allowed: true };
}

export function canImproveManualIdea(plan: string, platform: Exclude<ContentGrowthPlatform, "youtube">, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const normalized = normalizePlan(plan);
  if (normalized === "studio") return { allowed: true };

  const map = usage?.aiImprovementsByPlatform ?? null;
  if (normalized === "free") {
    if (sumPlatforms(map) >= 3) {
      return { allowed: false, code: "AI_IMPROVEMENT_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.AI_IMPROVEMENT_LIMIT, upgradePlan: "creator" };
    }
    return { allowed: true };
  }

  const limit = normalized === "creator" ? 15 : 30;
  const used = getByPlatform(map, platform);
  if (used >= limit) {
    return { allowed: false, code: "AI_IMPROVEMENT_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.AI_IMPROVEMENT_LIMIT, upgradePlan: normalized === "creator" ? "pro" : "studio" };
  }
  return { allowed: true };
}

export function canGenerateAdditionalIdea(plan: string, platform: Exclude<ContentGrowthPlatform, "youtube">, usage: ContentGrowthUsage | null | undefined): LimitDecision {
  const normalized = normalizePlan(plan);
  if (normalized === "free") {
    return { allowed: false, code: "ADDITIONAL_IDEA_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.ADDITIONAL_IDEA_LIMIT, upgradePlan: "creator" };
  }
  if (normalized === "studio") return { allowed: true };

  const map = usage?.additionalIdeasByPlatform ?? null;
  const limit = normalized === "creator" ? 8 : 20;
  const used = getByPlatform(map, platform);
  if (used >= limit) {
    return { allowed: false, code: "ADDITIONAL_IDEA_LIMIT", message: CONTENT_GROWTH_LIMIT_MESSAGES.ADDITIONAL_IDEA_LIMIT, upgradePlan: normalized === "creator" ? "pro" : "studio" };
  }
  return { allowed: true };
}

export function shouldUseBehaviorBasedNextWeek(plan: string) {
  const normalized = normalizePlan(plan);
  return normalized === "pro" || normalized === "studio";
}

export function shouldShowPostPerformanceModal(plan: string) {
  const normalized = normalizePlan(plan);
  return normalized === "pro" || normalized === "studio";
}

export function getNextWeekGenerationMode(plan: string): "goal_based" | "behavior_based" {
  const normalized = normalizePlan(plan);
  if (normalized === "creator") return "goal_based";
  if (normalized === "pro" || normalized === "studio") return "behavior_based";
  return "goal_based";
}


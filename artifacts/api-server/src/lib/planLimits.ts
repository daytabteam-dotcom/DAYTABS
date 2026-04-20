// ─── Single source of truth for all plan limits ──────────────────────────────
export type NormalizedPlan = "free" | "creator" | "pro" | "studio";

export interface PlanFeatures {
  quality_report: boolean;
  editing_report: boolean;
  publish_package: boolean;
  short_clip_ideas: boolean;
  subtitle_download: boolean;
  teleprompter: boolean;
  dubbing: boolean;
  priority_processing: boolean;
}

export interface PlanConfig {
  video_analyses_display_limit: number;
  video_usage_budget_per_month: number;
  max_video_size_bytes: number;
  max_video_duration_seconds: number;
  script_generations_per_month: number;
  script_planner_model: string;
  features: PlanFeatures;
}

export const PLAN_LIMITS: Record<NormalizedPlan, PlanConfig> = {
  free: {
    video_analyses_display_limit: 1,
    video_usage_budget_per_month: 1,
    max_video_size_bytes: 200 * 1024 * 1024,
    max_video_duration_seconds: 5 * 60,
    script_generations_per_month: 1,
    script_planner_model: "gpt-4o-mini",
    features: {
      quality_report: true,
      editing_report: true,
      publish_package: false,
      short_clip_ideas: false,
      subtitle_download: false,
      teleprompter: true,
      dubbing: false,
      priority_processing: false,
    },
  },
  creator: {
    video_analyses_display_limit: 10,
    video_usage_budget_per_month: 10,
    max_video_size_bytes: 1024 * 1024 * 1024,
    max_video_duration_seconds: 25 * 60,
    script_generations_per_month: 20,
    script_planner_model: "gpt-4o-mini",
    features: {
      quality_report: true,
      editing_report: true,
      publish_package: true,
      short_clip_ideas: true,
      subtitle_download: false,
      teleprompter: true,
      dubbing: false,
      priority_processing: false,
    },
  },
  pro: {
    video_analyses_display_limit: 25,
    video_usage_budget_per_month: 25,
    max_video_size_bytes: 5 * 1024 * 1024 * 1024,
    max_video_duration_seconds: 60 * 60,
    script_generations_per_month: 60,
    script_planner_model: "gpt-4o",
    features: {
      quality_report: true,
      editing_report: true,
      publish_package: true,
      short_clip_ideas: true,
      subtitle_download: true,
      teleprompter: true,
      dubbing: false,
      priority_processing: true,
    },
  },
  studio: {
    video_analyses_display_limit: 80,
    video_usage_budget_per_month: 80,
    max_video_size_bytes: 100 * 1024 * 1024 * 1024,
    max_video_duration_seconds: 90 * 60,
    script_generations_per_month: 200,
    script_planner_model: "gpt-4o",
    features: {
      quality_report: true,
      editing_report: true,
      publish_package: true,
      short_clip_ideas: true,
      subtitle_download: true,
      teleprompter: true,
      dubbing: false,
      priority_processing: true,
    },
  },
};

export function normalizePlan(plan: string): NormalizedPlan {
  if (plan === "premium") return "creator";
  if (plan === "professional") return "studio";
  if (plan === "creator" || plan === "pro" || plan === "studio") return plan as NormalizedPlan;
  return "free";
}

export function getLimits(plan: string): PlanConfig {
  return PLAN_LIMITS[normalizePlan(plan)];
}

export function getVideoUsageCost(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  if (durationSeconds <= 5 * 60) return 1;
  if (durationSeconds <= 15 * 60) return 2;
  if (durationSeconds <= 30 * 60) return 3;
  if (durationSeconds <= 60 * 60) return 4;
  return 5;
}

export function getAnalysisIntensityLabel(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 5 * 60) {
    return {
      id: "quick",
      title: "Quick analysis",
      message: "Great for a shorter upload and light monthly usage.",
    } as const;
  }
  if (durationSeconds <= 30 * 60) {
    return {
      id: "standard",
      title: "Standard analysis",
      message: "A balanced pass for a longer edit.",
    } as const;
  }
  return {
    id: "heavy",
    title: "Heavy analysis",
    message: "This will use more of your monthly usage.",
  } as const;
}

// ─── Structured error response builders ───────────────────────────────────────
function nextMonthFirst(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function mbLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function buildMonthlyLimitError(plan: NormalizedPlan, used: number, limit: number) {
  const resetDate = nextMonthFirst();
  if (plan === "free") {
    return {
      code: "MONTHLY_LIMIT_REACHED",
      title: "You've reached your monthly usage limit",
      message: `Your monthly usage resets on ${resetDate}. Upgrade to Creator to keep analyzing longer videos and more uploads.`,
      action: { label: "Upgrade to Creator — $19/mo", route: "/pricing?highlight=creator" },
      secondary_action: { label: `Resets on ${resetDate}`, disabled: true },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "creator") {
    return {
      code: "MONTHLY_LIMIT_REACHED",
      title: "You've reached your monthly usage limit",
      message: `Your monthly usage resets on ${resetDate}. Upgrade to Pro for more monthly usage and longer video support.`,
      action: { label: "Upgrade to Pro — $39/mo", route: "/pricing?highlight=pro" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "pro") {
    return {
      code: "MONTHLY_LIMIT_REACHED",
      title: "You've reached your monthly usage limit",
      message: `Your monthly usage resets on ${resetDate}. Upgrade to Studio for the highest monthly allowance.`,
      action: { label: "Upgrade to Studio — $89/mo", route: "/pricing?highlight=studio" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  return {
    code: "MONTHLY_LIMIT_REACHED",
    title: "You've reached your monthly usage limit",
    message: `Your monthly usage resets on ${resetDate}.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { used, limit, resets_on: resetDate },
  };
}

export function buildScriptGenerationLimitError(plan: NormalizedPlan, used: number, limit: number) {
  const resetDate = nextMonthFirst();
  if (plan === "free") {
    return {
      code: "SCRIPT_LIMIT_REACHED",
      title: "You've reached your monthly script limit",
      message: "Upgrade to Creator for more script generations every month.",
      action: { label: "Upgrade to Creator — $19/mo", route: "/pricing?highlight=creator" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "creator") {
    return {
      code: "SCRIPT_LIMIT_REACHED",
      title: "You've reached your monthly script limit",
      message: "Upgrade to Pro for more script generations every month.",
      action: { label: "Upgrade to Pro — $39/mo", route: "/pricing?highlight=pro" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  return {
    code: "SCRIPT_LIMIT_REACHED",
    title: "You've reached your monthly script limit",
    message: `Your script usage resets on ${resetDate}.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { used, limit, resets_on: resetDate },
  };
}

export function buildVideoUsageLimitError(plan: NormalizedPlan, used: number, limit: number, required: number) {
  const resetDate = nextMonthFirst();
  const upgradeTo = plan === "free" ? "creator" : plan === "creator" ? "pro" : "studio";
  const upgradeLabel = upgradeTo === "creator" ? "Upgrade to Creator — $19/mo" : upgradeTo === "pro" ? "Upgrade to Pro — $39/mo" : "Upgrade to Studio — $89/mo";
  return {
    code: "MONTHLY_LIMIT_REACHED",
    title: "You've reached your monthly usage limit",
    message: `This video needs more monthly usage than you have left. Your usage resets on ${resetDate}. Upgrade to continue.`,
    action: { label: upgradeLabel, route: `/pricing?highlight=${upgradeTo}` },
    secondary_action: { label: `Resets on ${resetDate}`, disabled: true },
    meta: { used, limit, required, resets_on: resetDate },
  };
}

export function buildNearUsageWarning(remaining: number, limit: number) {
  if (limit <= 0) return null;
  if (remaining > Math.max(2, Math.ceil(limit * 0.2))) return null;
  return {
    title: "You're getting close to your monthly usage limit",
    message: "Longer videos use more monthly usage, so save your next analysis for the uploads that matter most.",
  };
}

export function buildFileTooLargeError(plan: NormalizedPlan, fileSizeBytes: number) {
  const limit = PLAN_LIMITS[plan].max_video_size_bytes;
  const limitLabel = mbLabel(limit);
  const fileLabel = mbLabel(fileSizeBytes);
  if (plan === "free") {
    return {
      code: "FILE_TOO_LARGE",
      title: "Video file is too large",
      message: `Free plan supports videos up to ${limitLabel}. Your file is ${fileLabel}.`,
      action: { label: "Upgrade for larger files", route: "/pricing?highlight=creator" },
      meta: { file_size_bytes: fileSizeBytes, limit_bytes: limit },
    };
  }
  if (plan === "creator") {
    return {
      code: "FILE_TOO_LARGE",
      title: "Video file is too large",
      message: `Creator plan supports videos up to ${limitLabel}. Your file is ${fileLabel}.`,
      action: { label: "Upgrade to Pro for up to 5 GB", route: "/pricing?highlight=pro" },
      meta: { file_size_bytes: fileSizeBytes, limit_bytes: limit },
    };
  }
  return {
    code: "FILE_TOO_LARGE",
    title: "Video file is too large",
    message: `Your plan supports videos up to ${limitLabel}. Your file is ${fileLabel}.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { file_size_bytes: fileSizeBytes, limit_bytes: limit },
  };
}

export function buildVideoTooLongError(plan: NormalizedPlan, durationSeconds: number) {
  const limit = PLAN_LIMITS[plan].max_video_duration_seconds;
  const limitMin = Math.round(limit / 60);
  const durationMin = Math.round(durationSeconds / 60);
  if (plan === "free") {
    return {
      code: "VIDEO_TOO_LONG",
      title: "Video is too long for your plan",
      message: `Free includes videos up to ${limitMin} minutes. This video is ${durationMin} minutes long.`,
      action: { label: "Upgrade to Creator for 25 min videos", route: "/pricing?highlight=creator" },
      meta: { duration_seconds: durationSeconds, limit_seconds: limit },
    };
  }
  if (plan === "creator") {
    return {
      code: "VIDEO_TOO_LONG",
      title: "Video is too long for your plan",
      message: `Creator includes videos up to ${limitMin} minutes. This video is ${durationMin} minutes long.`,
      action: { label: "Upgrade to Pro for 60 min videos", route: "/pricing?highlight=pro" },
      meta: { duration_seconds: durationSeconds, limit_seconds: limit },
    };
  }
  if (plan === "pro") {
    return {
      code: "VIDEO_TOO_LONG",
      title: "Video is too long for your plan",
      message: `Pro includes videos up to ${limitMin} minutes. This video is ${durationMin} minutes long.`,
      action: { label: "Upgrade to Studio for 90 min videos", route: "/pricing?highlight=studio" },
      meta: { duration_seconds: durationSeconds, limit_seconds: limit },
    };
  }
  return {
    code: "VIDEO_TOO_LONG",
    title: "Video is too long for your plan",
    message: `Your plan supports videos up to ${limitMin} minutes. Your video is ${durationMin} minutes long.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { duration_seconds: durationSeconds, limit_seconds: limit },
  };
}

export function buildFeatureLockedError(feature: string, plan: NormalizedPlan) {
  const featureMessages: Record<string, { title: string; message: string; upgrade_to: string; label: string }> = {
    publish_package: {
      title: "Unlock publishing package",
      message: "See titles, tags, descriptions, and upload copy for every supported platform.",
      upgrade_to: "creator",
      label: "Upgrade to Creator — $19/mo",
    },
    short_clip_ideas: {
      title: "Unlock full breakdown",
      message: "See all clip opportunities and repurposing ideas across Shorts, Reels, and TikTok.",
      upgrade_to: "creator",
      label: "Upgrade to Creator — $19/mo",
    },
    subtitle_download: {
      title: "Unlock subtitle export",
      message: "Get a YouTube-ready subtitle file generated from your transcript.",
      upgrade_to: "pro",
      label: "Upgrade to Pro — $39/mo",
    },
  };
  const msg = featureMessages[feature] ?? {
    title: "Feature not available on your plan",
    message: "Upgrade to unlock this feature.",
    upgrade_to: "creator",
    label: "View Plans",
  };
  return {
    code: "FEATURE_LOCKED",
    title: msg.title,
    message: msg.message,
    action: { label: msg.label, route: `/pricing?highlight=${msg.upgrade_to}` },
    meta: { feature, current_plan: plan, upgrade_to: msg.upgrade_to },
  };
}

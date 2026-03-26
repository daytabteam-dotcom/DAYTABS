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
  video_analyses_per_month: number;
  max_video_size_bytes: number;
  max_video_duration_seconds: number;
  script_planner_chats_per_month: number;
  script_planner_messages_per_session: number;
  script_planner_model: string;
  features: PlanFeatures;
}

export const PLAN_LIMITS: Record<NormalizedPlan, PlanConfig> = {
  free: {
    video_analyses_per_month: 2,
    max_video_size_bytes: 200 * 1024 * 1024,
    max_video_duration_seconds: 5 * 60,
    script_planner_chats_per_month: 1,
    script_planner_messages_per_session: 3,
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
    video_analyses_per_month: 15,
    max_video_size_bytes: 500 * 1024 * 1024,
    max_video_duration_seconds: 15 * 60,
    script_planner_chats_per_month: 15,
    script_planner_messages_per_session: 10,
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
    video_analyses_per_month: 40,
    max_video_size_bytes: 1024 * 1024 * 1024,
    max_video_duration_seconds: 30 * 60,
    script_planner_chats_per_month: 40,
    script_planner_messages_per_session: 10,
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
    video_analyses_per_month: Infinity,
    max_video_size_bytes: 2 * 1024 * 1024 * 1024,
    max_video_duration_seconds: 60 * 60,
    script_planner_chats_per_month: Infinity,
    script_planner_messages_per_session: 10,
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
      title: "You've used both free analyses this month",
      message: `Your 2 free analyses reset on ${resetDate}. Upgrade to Creator for 15 analyses every month.`,
      action: { label: "Upgrade to Creator — $19/mo", route: "/pricing?highlight=creator" },
      secondary_action: { label: `Resets on ${resetDate}`, disabled: true },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "creator") {
    return {
      code: "MONTHLY_LIMIT_REACHED",
      title: "You've used all 15 analyses this month",
      message: `Your analyses reset on ${resetDate}. Upgrade to Pro for 40 analyses per month.`,
      action: { label: "Upgrade to Pro — $39/mo", route: "/pricing?highlight=pro" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "pro") {
    return {
      code: "MONTHLY_LIMIT_REACHED",
      title: "You've used all 40 analyses this month",
      message: `Your analyses reset on ${resetDate}. Upgrade to Studio for unlimited analyses.`,
      action: { label: "Upgrade to Studio — $89/mo", route: "/pricing?highlight=studio" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  return {
    code: "MONTHLY_LIMIT_REACHED",
    title: "Monthly limit reached",
    message: `You've used all ${limit} analyses this month. They reset on ${resetDate}.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { used, limit, resets_on: resetDate },
  };
}

export function buildChatLimitError(plan: NormalizedPlan, used: number, limit: number) {
  const resetDate = nextMonthFirst();
  if (plan === "free") {
    return {
      code: "CHAT_LIMIT_REACHED",
      title: "You've used your 1 free script chat this month",
      message: "Upgrade to Creator for 15 script planning sessions every month.",
      action: { label: "Upgrade to Creator — $19/mo", route: "/pricing?highlight=creator" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  if (plan === "creator") {
    return {
      code: "CHAT_LIMIT_REACHED",
      title: "You've used all 15 script chats this month",
      message: "Upgrade to Pro for 40 sessions with the more powerful GPT-4o model.",
      action: { label: "Upgrade to Pro — $39/mo", route: "/pricing?highlight=pro" },
      meta: { used, limit, resets_on: resetDate },
    };
  }
  return {
    code: "CHAT_LIMIT_REACHED",
    title: "Monthly chat limit reached",
    message: `You've used all ${limit} script chats this month. They reset on ${resetDate}.`,
    action: { label: "View Plans", route: "/pricing" },
    meta: { used, limit, resets_on: resetDate },
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
      action: { label: "Upgrade to Pro for up to 1 GB", route: "/pricing?highlight=pro" },
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
      message: `Free plan supports videos up to ${limitMin} minutes. Your video is ${durationMin} minutes long.`,
      action: { label: "Upgrade to Creator for 15 min videos", route: "/pricing?highlight=creator" },
      meta: { duration_seconds: durationSeconds, limit_seconds: limit },
    };
  }
  if (plan === "creator") {
    return {
      code: "VIDEO_TOO_LONG",
      title: "Video is too long for your plan",
      message: `Creator plan supports videos up to ${limitMin} minutes. Your video is ${durationMin} minutes long.`,
      action: { label: "Upgrade to Pro for 30 min videos", route: "/pricing?highlight=pro" },
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
      title: "Publish package is a Creator feature",
      message: "Get titles, descriptions, tags, and chapters optimized for every platform you target.",
      upgrade_to: "creator",
      label: "Upgrade to Creator — $19/mo",
    },
    short_clip_ideas: {
      title: "Short clip ideas require Creator plan",
      message: "Find the best moments to repurpose across TikTok, Reels, and Shorts.",
      upgrade_to: "creator",
      label: "Upgrade to Creator — $19/mo",
    },
    subtitle_download: {
      title: "Subtitle download is a Pro feature",
      message: "Get YouTube-compatible .srt files generated automatically from your transcript.",
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

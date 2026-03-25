import { useState, useEffect, useCallback } from "react";
import { useUser } from "./use-user";

export type PlanName = "free" | "creator" | "pro" | "studio" | "premium" | "professional";

export interface PlanInfo {
  plan: PlanName;
  normalizedPlan: "free" | "creator" | "pro" | "studio";
  uploadCounts: Record<string, number>;
  isPaid: boolean;
  isCreator: boolean;
  isPro: boolean;
  isStudio: boolean;
}

export interface PlanLimits {
  uploadLimit: number;
  uploadUsed: number;
  uploadsRemaining: number;
}

function normalizePlan(plan: string): "free" | "creator" | "pro" | "studio" {
  if (plan === "premium") return "creator";
  if (plan === "professional") return "studio";
  if (plan === "creator" || plan === "pro" || plan === "studio") return plan as "creator" | "pro" | "studio";
  return "free";
}

const UPLOAD_LIMITS: Record<string, Record<string, number>> = {
  free:    { "video-analyzer": 3, "pre-edit": 3, editing: 5, publish: 3 },
  creator: { "video-analyzer": 15, "pre-edit": 15, editing: 25, publish: 15 },
  pro:     { "video-analyzer": 40, "pre-edit": 40, editing: 60, publish: 40 },
  studio:  { "video-analyzer": -1, "pre-edit": -1, editing: -1, publish: -1 },
};

export const FILE_SIZE_LIMITS: Record<string, number> = {
  free:    200 * 1024 * 1024,
  creator: 500 * 1024 * 1024,
  pro:     1024 * 1024 * 1024,
  studio:  2 * 1024 * 1024 * 1024,
};

export const DURATION_LIMITS_SEC: Record<string, number> = {
  free:    5 * 60,
  creator: 15 * 60,
  pro:     30 * 60,
  studio:  60 * 60,
};

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free:         "Free",
  creator:      "Creator",
  pro:          "Pro",
  studio:       "Studio",
  premium:      "Creator",
  professional: "Studio",
};

export function getPlanLabel(plan: string): string {
  return `${PLAN_DISPLAY_NAMES[plan] ?? "Free"} Plan`;
}

export function getPlanColor(plan: string): string {
  const n = normalizePlan(plan);
  if (n === "studio") return "text-pink-400";
  if (n === "pro") return "text-emerald-400";
  if (n === "creator") return "text-amber-400";
  return "text-violet-400";
}

export function getPlanBadgeColor(plan: string): string {
  const n = normalizePlan(plan);
  if (n === "studio") return "bg-pink-500/15 text-pink-300 border-pink-500/20";
  if (n === "pro") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
  if (n === "creator") return "bg-amber-500/15 text-amber-300 border-amber-500/20";
  return "bg-violet-500/15 text-violet-300 border-violet-500/20";
}

export function getFileSizeLimit(plan: string): number {
  return FILE_SIZE_LIMITS[normalizePlan(plan)] ?? FILE_SIZE_LIMITS.free;
}

export function getFileSizeLimitLabel(plan: string): string {
  const bytes = getFileSizeLimit(plan);
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`
    : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function getDurationLimitLabel(plan: string): string {
  const secs = DURATION_LIMITS_SEC[normalizePlan(plan)] ?? DURATION_LIMITS_SEC.free;
  return `${Math.round(secs / 60)} min`;
}

export function getUploadLimitForMode(plan: string, mode: string): number {
  const n = normalizePlan(plan);
  return UPLOAD_LIMITS[n]?.[mode] ?? UPLOAD_LIMITS.free[mode] ?? 3;
}

export function usePlan() {
  const { user } = useUser();
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPlanInfo = useCallback(async () => {
    const token = localStorage.getItem("daytabs_token");
    if (!token) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json() as { plan: string; uploadCounts: Record<string, number> };
        const rawPlan = (data.plan || "free") as PlanName;
        const norm = normalizePlan(rawPlan);
        setPlanInfo({
          plan: rawPlan,
          normalizedPlan: norm,
          uploadCounts: data.uploadCounts || {},
          isPaid: norm !== "free",
          isCreator: norm === "creator",
          isPro: norm === "pro",
          isStudio: norm === "studio",
        });
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchPlanInfo();
  }, [user, fetchPlanInfo]);

  useEffect(() => {
    const handler = () => fetchPlanInfo();
    window.addEventListener("daytabs:plan-updated", handler);
    return () => window.removeEventListener("daytabs:plan-updated", handler);
  }, [fetchPlanInfo]);

  const rawPlan = (planInfo?.plan ?? user?.plan ?? "free") as PlanName;
  const norm = normalizePlan(rawPlan);
  const effectiveInfo: PlanInfo = planInfo ?? {
    plan: rawPlan,
    normalizedPlan: norm,
    uploadCounts: {},
    isPaid: norm !== "free",
    isCreator: norm === "creator",
    isPro: norm === "pro",
    isStudio: norm === "studio",
  };

  function getModeLimits(mode: string): PlanLimits {
    const limit = getUploadLimitForMode(effectiveInfo.plan, mode);
    const used = effectiveInfo.uploadCounts[mode] ?? 0;
    return {
      uploadLimit: limit,
      uploadUsed: used,
      uploadsRemaining: limit === -1 ? Infinity : Math.max(0, limit - used),
    };
  }

  return {
    plan: effectiveInfo,
    loading,
    getModeLimits,
    refetch: fetchPlanInfo,
  };
}

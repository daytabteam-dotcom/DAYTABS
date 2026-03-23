import { useState, useEffect, useCallback } from "react";
import { useUser } from "./use-user";

export type PlanName = "free" | "premium" | "professional";

export interface PlanInfo {
  plan: PlanName;
  uploadCounts: Record<string, number>;
  isPremium: boolean;
  isProfessional: boolean;
  isPaid: boolean;
}

export interface PlanLimits {
  uploadLimit: number;
  uploadUsed: number;
  uploadsRemaining: number;
}

const UPLOAD_LIMITS: Record<string, Record<string, number>> = {
  free:         { "pre-edit": 3, editing: 5, publish: 3 },
  premium:      { "pre-edit": 30, editing: 50, publish: 30 },
  professional: { "pre-edit": -1, editing: -1, publish: -1 },
};

// File size limits in bytes per plan
export const FILE_SIZE_LIMITS: Record<string, number> = {
  free:         200 * 1024 * 1024,      // 200 MB
  premium:      500 * 1024 * 1024,      // 500 MB
  professional: 1024 * 1024 * 1024,    // 1 GB
};

export function getFileSizeLimit(plan: string): number {
  return FILE_SIZE_LIMITS[plan] ?? FILE_SIZE_LIMITS.free;
}

export function getFileSizeLimitLabel(plan: string): string {
  const bytes = getFileSizeLimit(plan);
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`
    : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function getPlanLabel(plan: string): string {
  if (plan === "premium") return "Premium Plan";
  if (plan === "professional") return "Professional Plan";
  return "Free Plan";
}

export function getPlanColor(plan: string): string {
  if (plan === "premium") return "text-amber-400";
  if (plan === "professional") return "text-emerald-400";
  return "text-violet-400";
}

export function getUploadLimitForMode(plan: string, mode: string): number {
  return UPLOAD_LIMITS[plan]?.[mode] ?? UPLOAD_LIMITS.free[mode] ?? 3;
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
        const plan = (data.plan || "free") as PlanName;
        setPlanInfo({
          plan,
          uploadCounts: data.uploadCounts || {},
          isPremium: plan === "premium",
          isProfessional: plan === "professional",
          isPaid: plan === "premium" || plan === "professional",
        });
      }
    } catch {
      // silently ignore — fall back to JWT plan
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchPlanInfo();
  }, [user, fetchPlanInfo]);

  // Refetch whenever the Paddle checkout-complete handler updates the token
  useEffect(() => {
    const handler = () => fetchPlanInfo();
    window.addEventListener("daytabs:plan-updated", handler);
    return () => window.removeEventListener("daytabs:plan-updated", handler);
  }, [fetchPlanInfo]);

  // Derive planInfo from user JWT as immediate fallback while fetching
  const effectivePlan = (planInfo?.plan ?? user?.plan ?? "free") as PlanName;
  const effectiveInfo: PlanInfo = planInfo ?? {
    plan: effectivePlan,
    uploadCounts: {},
    isPremium: effectivePlan === "premium",
    isProfessional: effectivePlan === "professional",
    isPaid: effectivePlan === "premium" || effectivePlan === "professional",
  };

  function getModeLimits(mode: string): PlanLimits {
    const limit = getUploadLimitForMode(effectivePlan, mode);
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

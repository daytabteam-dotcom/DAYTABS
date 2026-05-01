import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";
import type { SocialPlatform, SocialPostPerformanceFeedback, SocialPostingMode, SocialWeekday, SocialWeeklyPlan } from "./types";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  return {
    ...(locale ? { "Accept-Language": locale } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = url.startsWith("/api/social-growth/") ? 75_000 : 15_000;
  const timeoutId = window.setTimeout(() => {
    try {
      controller.abort("Request timed out");
    } catch {
      controller.abort();
    }
  }, timeoutMs);
  const upstreamSignal = init?.signal;
  const abortUpstream = () => controller.abort();
  upstreamSignal?.addEventListener("abort", abortUpstream);
  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  }).finally(() => {
    window.clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortUpstream);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export async function fetchLatestSocialPlan(platform: SocialPlatform) {
  return await jsonFetch<{ plan: SocialWeeklyPlan | null }>(`/api/social-growth/plans/latest?platform=${platform}`);
}

export async function fetchSocialGrowthUsage() {
  return await jsonFetch<{
    weeksGeneratedTotal: number;
    usedPlatforms: SocialPlatform[];
    aiImprovementsByPlatform: Record<SocialPlatform, number>;
    additionalIdeasByPlatform: Record<SocialPlatform, number>;
  }>(`/api/social-growth/usage`);
}

export async function generateSocialPlan(input: {
  platform: SocialPlatform;
  topic: string;
  postsPerWeek: number;
  followersCount?: number | null;
  postingMode?: SocialPostingMode;
  preferredWeekdays?: SocialWeekday[];
  audience?: string;
  goal?: string;
  tone?: string;
  formatPreference?: string;
}) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchSocialDay(input: {
  planId: number;
  dayId: string;
  patch: Record<string, unknown>;
}) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/${input.planId}/days/${input.dayId}`, {
    method: "PATCH",
    body: JSON.stringify({ patch: input.patch }),
  });
}

export async function createSocialDay(input: {
  planId: number;
  platform: SocialPlatform;
  date: string;
  contentIdea: string;
  contentType?: string;
  hook?: string;
  notes?: string;
  tags?: string[];
  bestPostingTime?: string;
}) {
  return await jsonFetch<{ plan: SocialWeeklyPlan; day: { id: string } }>(`/api/social-growth/plans/${input.planId}/days`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteSocialDay(input: { planId: number; dayId: string }) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/${input.planId}/days/${input.dayId}`, {
    method: "DELETE",
  });
}

export async function regenerateSocialDay(input: { planId: number; dayId: string; platform: SocialPlatform; intent?: string }) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/${input.planId}/days/${input.dayId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ platform: input.platform, intent: input.intent }),
  });
}

export async function generateNextWeekSocialPlan(input: {
  planId: number;
  platform: SocialPlatform;
  topic?: string;
  postsPerWeek?: number;
  followersCount?: number | null;
  postingMode?: SocialPostingMode;
  preferredWeekdays?: SocialWeekday[];
  audience?: string;
  goal?: string;
  tone?: string;
  formatPreference?: string;
  feedback?: SocialPostPerformanceFeedback[];
  skippedFeedback?: boolean;
}) {
  return await jsonFetch<{ plan: SocialWeeklyPlan; message?: string }>(`/api/social-growth/plans/${input.planId}/generate-next-week`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

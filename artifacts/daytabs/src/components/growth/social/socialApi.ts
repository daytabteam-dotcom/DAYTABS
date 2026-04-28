import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";
import type { SocialPlatform, SocialPostPerformanceFeedback, SocialWeeklyPlan } from "./types";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  return {
    ...(locale ? { "Accept-Language": locale } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export async function fetchLatestSocialPlan(platform: SocialPlatform) {
  return await jsonFetch<{ plan: SocialWeeklyPlan | null }>(`/api/social-growth/plans/latest?platform=${platform}`);
}

export async function generateSocialPlan(input: {
  platform: SocialPlatform;
  topic: string;
  postsPerWeek: number;
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

export async function deleteSocialDay(input: { planId: number; dayId: string }) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/${input.planId}/days/${input.dayId}`, {
    method: "DELETE",
  });
}

export async function regenerateSocialDay(input: { planId: number; dayId: string; platform: SocialPlatform }) {
  return await jsonFetch<{ plan: SocialWeeklyPlan }>(`/api/social-growth/plans/${input.planId}/days/${input.dayId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ platform: input.platform }),
  });
}

export async function generateNextWeekSocialPlan(input: {
  planId: number;
  platform: SocialPlatform;
  topic?: string;
  postsPerWeek?: number;
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


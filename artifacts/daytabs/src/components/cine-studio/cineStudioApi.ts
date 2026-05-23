import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";
import type { CineAsset, CineCharacter, CineJob, CineProject, CineShot, CineStyle, CineStylePreset } from "./types";

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
  const timeoutMs = url.startsWith("/api/cine-studio/") ? 120_000 : 15_000;
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

export async function cineNotify(email: string) {
  return await jsonFetch<{ success: boolean }>("/api/cine-studio/notify", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function fetchCineCredits() {
  return await jsonFetch<{ credits: { remaining: number } }>("/api/cine-studio/credits");
}

export async function listCineProjects() {
  return await jsonFetch<{ projects: CineProject[] }>("/api/cine-studio/projects");
}

export async function listCineCharacters() {
  return await jsonFetch<{ characters: CineCharacter[] }>("/api/cine-studio/characters");
}

export async function listCineAssets(limit = 60) {
  return await jsonFetch<{ assets: CineAsset[] }>(`/api/cine-studio/assets?limit=${encodeURIComponent(String(limit))}`);
}

export async function createCineProject(input: { title: string; description?: string }) {
  return await jsonFetch<{ project: CineProject }>("/api/cine-studio/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCineProject(projectId: string) {
  return await jsonFetch<{
    project: CineProject;
    characters: CineCharacter[];
    assets: CineAsset[];
    jobs: CineJob[];
    credits: { remaining: number };
  }>(`/api/cine-studio/projects/${projectId}`);
}

export async function createCineCharacter(input: {
  project_id: string;
  name: string;
  base_prompt: string;
  style_preset: CineStylePreset;
  style_id?: string | null;
}) {
  return await jsonFetch<{ character: CineCharacter }>("/api/cine-studio/characters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setCharacterStyle(characterId: string, style_id: string | null) {
  return await jsonFetch<{ character: CineCharacter }>(`/api/cine-studio/characters/${characterId}/style`, {
    method: "PATCH",
    body: JSON.stringify({ style_id }),
  });
}

export async function setProjectStyle(projectId: string, style_id: string | null) {
  return await jsonFetch<{ project: CineProject }>(`/api/cine-studio/projects/${projectId}/style`, {
    method: "PATCH",
    body: JSON.stringify({ style_id }),
  });
}

export async function generateCharacterIdentity(characterId: string, details: Record<string, unknown>) {
  return await jsonFetch<{ identity_prompt: string; character: CineCharacter }>(`/api/cine-studio/characters/${characterId}/identity`, {
    method: "POST",
    body: JSON.stringify({ details }),
  });
}

export async function generateCharacterSheet(
  characterId: string,
  input: { aspect_ratio: "16:9" | "9:16" | "1:1"; style_id?: string | null; style_preset?: CineStylePreset },
) {
  return await jsonFetch<{ job: CineJob; assets: CineAsset[] }>(`/api/cine-studio/characters/${characterId}/sheet`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateCharacterAngle(characterId: string, input: {
  reference_image_url: string;
  angle: string;
  aspect_ratio: "16:9" | "9:16" | "1:1";
  style_id?: string | null;
  style_preset?: CineStylePreset;
}) {
  return await jsonFetch<{ job: CineJob; asset: CineAsset }>(`/api/cine-studio/characters/${characterId}/angle`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function lockCharacter(characterId: string, reference_image_url: string) {
  return await jsonFetch<{ character: CineCharacter }>(`/api/cine-studio/characters/${characterId}/lock`, {
    method: "POST",
    body: JSON.stringify({ reference_image_url }),
  });
}

export async function createScene(input: {
  project_id: string;
  character_id: string;
  scene_description: string;
  style_preset: CineStylePreset;
  style_id?: string | null;
  aspect_ratio: "16:9" | "9:16" | "1:1";
}) {
  return await jsonFetch<{ job: CineJob; asset: CineAsset; polishedPrompt: string }>("/api/cine-studio/scenes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateShotList(input: {
  project_id: string;
  character_id: string;
  scene_description: string;
}) {
  return await jsonFetch<{ job: CineJob; shots: CineShot[] }>("/api/cine-studio/shots/list", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateShotImage(input: {
  project_id: string;
  character_id: string;
  shot_prompt: string;
  style_id?: string | null;
  style_preset?: CineStylePreset;
  aspect_ratio: "16:9" | "9:16" | "1:1";
}) {
  return await jsonFetch<{ job: CineJob; asset: CineAsset }>("/api/cine-studio/shots/image", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateVideoFromImage(input: {
  project_id: string;
  asset_id: string;
  image_url: string;
  motion_prompt?: string;
  duration: "5s" | "10s" | "15s";
  quality: "fast" | "standard" | "HD";
  aspect_ratio: "16:9" | "9:16" | "1:1";
  camera_motion: string;
  custom_motion_prompt?: string;
  style_id?: string | null;
  style_preset?: CineStylePreset;
}) {
  return await jsonFetch<{ jobId: string; requestId: string; motionPrompt: string }>("/api/cine-studio/video/from-image", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCineJobStatus(jobId: string) {
  return await jsonFetch<{ job: CineJob; asset?: CineAsset; providerStatus?: unknown }>(`/api/cine-studio/jobs/${jobId}`);
}

// ─── Styles ────────────────────────────────────────────────────────────────
export async function listCineStyles() {
  return await jsonFetch<{ styles: CineStyle[] }>("/api/cine-studio/styles");
}

export async function createCineStyle(input: {
  name: string;
  description?: string;
  style_prompt: string;
  negative_prompt?: string;
  color_palette?: string[];
  mood_keywords?: string[];
  texture_keywords?: string[];
  lighting_keywords?: string[];
  reference_image_url?: string;
}) {
  return await jsonFetch<{ style: CineStyle }>("/api/cine-studio/styles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createStyleFromDescription(input: {
  name: string;
  description?: string;
  colors?: string[];
  mood?: string[];
  texture?: string[];
  lighting?: string[];
  negative_notes?: string;
}) {
  return await jsonFetch<{ style: CineStyle; plan: unknown }>("/api/cine-studio/styles/from-description", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createStyleFromReference(input: {
  name: string;
  description?: string;
  reference_image_url: string;
}) {
  return await jsonFetch<{ style: CineStyle; plan: unknown }>("/api/cine-studio/styles/from-reference", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCineStyle(styleId: string, patch: Record<string, unknown>) {
  return await jsonFetch<{ style: CineStyle }>(`/api/cine-studio/styles/${styleId}`, {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function deleteCineStyle(styleId: string) {
  return await jsonFetch<{ success: boolean }>(`/api/cine-studio/styles/${styleId}`, {
    method: "DELETE",
  });
}

import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";
import type { AudioTranscriptProject, AudioTranslation } from "./types";

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
  const timeoutMs = url.startsWith("/api/audio-transcript/") ? 180_000 : 15_000;
  const timeoutId = window.setTimeout(() => controller.abort("Request timed out"), timeoutMs);
  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  }).finally(() => window.clearTimeout(timeoutId));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export async function listAudioTranscriptProjects() {
  return await jsonFetch<{ projects: AudioTranscriptProject[] }>("/api/audio-transcript/projects");
}

export async function getAudioTranscriptProjectDetail(projectId: string) {
  return await jsonFetch<{ project: AudioTranscriptProject; translations: AudioTranslation[] }>(`/api/audio-transcript/projects/${projectId}`);
}

export async function createAudioTranscriptProject(input: { title: string; source_language: string; file: File }) {
  const form = new FormData();
  form.set("title", input.title);
  form.set("source_language", input.source_language);
  form.set("file", input.file);

  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  const res = await fetch("/api/audio-transcript/projects", {
    method: "POST",
    body: form,
    headers: {
      ...(locale ? { "Accept-Language": locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Upload failed");
  return data as { project: AudioTranscriptProject; job: { id: string } };
}

export async function translateTranscript(projectId: string, target_language: string) {
  return await jsonFetch<{ translation: AudioTranslation; job: { id: string; status: string }; cached?: boolean }>(`/api/audio-transcript/projects/${projectId}/translate`, {
    method: "POST",
    body: JSON.stringify({ target_language }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function getTranslation(translationId: string) {
  return await jsonFetch<{ translation: AudioTranslation }>(`/api/audio-transcript/translations/${translationId}`);
}

export async function deleteAudioTranscriptProject(projectId: string) {
  return await jsonFetch<{ success: boolean }>(`/api/audio-transcript/projects/${projectId}`, {
    method: "DELETE",
  });
}

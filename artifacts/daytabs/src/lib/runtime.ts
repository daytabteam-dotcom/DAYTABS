import { setBaseUrl } from "@workspace/api-client-react";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
const RAW_PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim() || "";

const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
const PUBLIC_SITE_URL = RAW_PUBLIC_SITE_URL.replace(/\/+$/, "");

function joinUrl(base: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

export function getApiBaseUrl() {
  return API_BASE_URL || null;
}

export function withApiBase(path: string) {
  return joinUrl(API_BASE_URL, path);
}

export function getApiHealthUrl() {
  return withApiBase("/api/healthz");
}

export function getPublicSiteUrl(path = "/login") {
  return joinUrl(PUBLIC_SITE_URL, path);
}

export function installApiBaseFetchShim() {
  if (!API_BASE_URL || typeof window === "undefined") return;

  setBaseUrl(API_BASE_URL);

  const fetchWithShim = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return fetchWithShim(withApiBase(input), init);
    }
    if (input instanceof URL && input.pathname.startsWith("/api")) {
      return fetchWithShim(new URL(withApiBase(`${input.pathname}${input.search}${input.hash}`)), init);
    }
    return fetchWithShim(input, init);
  }) as typeof window.fetch;
}

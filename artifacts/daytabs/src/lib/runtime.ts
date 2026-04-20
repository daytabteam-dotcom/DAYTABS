import { setBaseUrl } from "@workspace/api-client-react";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
const RAW_PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim() || "";
const DEFAULT_PUBLIC_SITE_URL = "https://www.daytabs.com";
const ADMIN_HOST = "ctrl-a3f9e21b.daytabs.com";

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

function getPublicSiteBaseUrl() {
  if (PUBLIC_SITE_URL) return PUBLIC_SITE_URL;
  if (typeof window === "undefined") return DEFAULT_PUBLIC_SITE_URL;

  const { hostname, origin } = window.location;
  if (hostname === "www.daytabs.com") return origin.replace(/\/+$/, "");
  if (hostname === "daytabs.com") return DEFAULT_PUBLIC_SITE_URL;
  if (hostname === ADMIN_HOST || hostname.endsWith(".daytabs.com")) return DEFAULT_PUBLIC_SITE_URL;
  return origin.replace(/\/+$/, "");
}

export function getPublicSiteUrl(path = "/login/") {
  const normalizedPath = path === "/login" ? "/login/" : path;
  return joinUrl(getPublicSiteBaseUrl(), normalizedPath);
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

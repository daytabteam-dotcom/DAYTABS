const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
const RAW_CORE_APP_URL = (import.meta.env.VITE_CORE_APP_URL as string | undefined)?.trim() || "/panel/";

const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
const CORE_APP_URL = RAW_CORE_APP_URL || "/panel/";

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

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

export function getCoreAppUrl(token?: string) {
  const url = new URL(CORE_APP_URL, window.location.origin);
  if (token) url.searchParams.set("token", token);
  if (!isAbsoluteUrl(CORE_APP_URL)) return `${url.pathname}${url.search}${url.hash}`;
  return url.toString();
}

export function getWakePageUrl(token?: string, target?: string) {
  if (target) return target;
  return getCoreAppUrl(token);
}

export function getApiHealthUrl() {
  return withApiBase("/api/healthz");
}

export function installApiBaseFetchShim() {
  if (!API_BASE_URL || typeof window === "undefined") return;

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

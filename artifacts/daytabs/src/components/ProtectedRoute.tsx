import { useEffect, useState } from "react";
import { getPublicSiteUrl } from "@/lib/runtime";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getValidToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");

  if (urlToken) {
    const payload = decodeJwtPayload(urlToken);
    if (payload) {
      localStorage.setItem("daytabs_token", urlToken);
      params.delete("token");
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
      return urlToken;
    }
  }

  const stored = localStorage.getItem("daytabs_token");
  if (stored) {
    if (decodeJwtPayload(stored)) return stored;
    localStorage.removeItem("daytabs_token");
  }

  return null;
}

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    const syncAuthStatus = () => {
      const token = getValidToken();
      setStatus(token ? "authenticated" : "unauthenticated");
    };

    syncAuthStatus();

    const handleVisibilityChange = () => {
      if (!document.hidden) syncAuthStatus();
    };

    window.addEventListener("focus", syncAuthStatus);
    window.addEventListener("storage", syncAuthStatus);
    window.addEventListener("daytabs:plan-updated", syncAuthStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", syncAuthStatus);
      window.removeEventListener("storage", syncAuthStatus);
      window.removeEventListener("daytabs:plan-updated", syncAuthStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    const rootLoginPath = getPublicSiteUrl("/login");

    return (
      <div className="min-h-screen bg-[#0d0a1a] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300 mb-3">DayTabs panel</p>
          <h1 className="text-2xl font-bold mb-2">Sign in to open your workspace.</h1>
          <p className="text-sm text-white/50 mb-5">
            You must log in to access your own plan, uploads, and workspace data. Preview accounts and shared fallback access are not available here.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href={rootLoginPath}
              className="rounded-lg bg-violet-400 px-4 py-3 text-center text-sm font-semibold text-violet-950 hover:bg-violet-300 transition-colors"
            >
              Go to login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

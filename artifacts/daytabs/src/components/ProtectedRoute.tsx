import { useEffect, useState } from "react";
import { getPublicSiteUrl } from "@/lib/runtime";

function createDevToken() {
  const payload = {
    user_id: 1,
    email: "studio-preview@daytabs.local",
    name: "Studio Preview",
    plan: "professional",
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `dev.${encoded}.preview`;
}

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
  if (stored && decodeJwtPayload(stored)) return stored;

  return null;
}

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    const token = getValidToken();
    if (token) {
      setStatus("authenticated");
    } else {
      setStatus("unauthenticated");
    }
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    const loginPath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/login`;
    const rootLoginPath = getPublicSiteUrl("/login");

    return (
      <div className="min-h-screen bg-[#0d0a1a] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300 mb-3">DayTabs panel</p>
          <h1 className="text-2xl font-bold mb-2">Sign in to open your workspace.</h1>
          <p className="text-sm text-white/50 mb-5">
            This panel runs under <span className="text-white/75">/panel/</span>. If you are testing locally, use Studio preview to open gated features without the landing auth server.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("daytabs_token", createDevToken());
                window.location.reload();
              }}
              className="rounded-lg bg-violet-400 px-4 py-3 text-sm font-semibold text-violet-950 hover:bg-violet-300 transition-colors"
            >
              Open Studio preview
            </button>
            <a
              href={rootLoginPath}
              className="rounded-lg border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white/70 hover:bg-white/5 transition-colors"
            >
              Go to login
            </a>
          </div>
          <p className="text-xs text-white/30 mt-4">
            If your dev server only hosts the panel app, <span className="text-white/50">{loginPath}</span> may show the app shell instead of the public login page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

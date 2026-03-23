import { useEffect, useState } from "react";

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
    window.location.replace("/login");
    return null;
  }

  return <>{children}</>;
}

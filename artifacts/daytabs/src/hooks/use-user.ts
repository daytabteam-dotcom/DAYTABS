import { useState, useEffect } from "react";

export interface UserInfo {
  userId: number;
  email: string;
  name: string;
  plan: string;
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

export function useUser() {
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");

    if (urlToken) {
      localStorage.setItem("daytabs_token", urlToken);
      params.delete("token");
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    const token = urlToken || localStorage.getItem("daytabs_token");
    if (!token) return;

    const payload = decodeJwtPayload(token);
    if (!payload) {
      localStorage.removeItem("daytabs_token");
      return;
    }

    const email = (payload.email as string) || "";
    const jwtName = (payload.name as string) || "";
    const name = jwtName || email.split("@")[0].replace(/[._]/g, " ");
    const plan = (payload.plan as string) || "free";

    setUser({ userId: payload.user_id as number, email, name, plan });
  }, []);

  const logout = () => {
    localStorage.removeItem("daytabs_token");
    localStorage.removeItem("daytabs_user_name");
    setUser(null);
    window.location.href = "/login";
  };

  return { user, logout };
}

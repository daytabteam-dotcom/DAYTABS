import { getCoreAppUrl, withApiBase } from "./runtime";

const API_BASE = withApiBase("/api/auth");

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string | null };
}

export interface ApiError {
  error: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as ApiError).error || "Request failed");
  return data as T;
}

export const authApi = {
  signup: (email: string, password: string, name: string) =>
    request<AuthResponse>("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  contact: (name: string, email: string, message: string) =>
    request<{ success: boolean; message: string }>("/contact", {
      method: "POST",
      body: JSON.stringify({ name, email, message }),
    }),

  googleLoginUrl: () => `${API_BASE}/google`,
};

export { getCoreAppUrl };

import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;",
};

function adminJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET environment variable is required");
  return new TextEncoder().encode(secret);
}

function normalizeAdminPath(value: string | undefined) {
  const raw = value?.trim() || "/_daytabs_ops_7m4k9x2q/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeadingSlash === "/") return "/";
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, adminJwtSecret());
    return true;
  } catch {
    return false;
  }
}

export function applyAdminSecurityHeaders(res: Response) {
  for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

export function getAdminHostname(req: Request) {
  return (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().split(":")[0];
}

function isAdminAuthPath(path: string) {
  return path === "/" || path.startsWith("/assets/") || path === "/api/auth/admin-login";
}

export async function adminHostMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminHost = process.env.ADMIN_HOST?.trim();
  const adminPath = normalizeAdminPath(process.env.ADMIN_PATH);
  if (!adminHost) {
    const isAdminPathRequest = req.path === adminPath || req.path.startsWith(`${adminPath}/`);
    const isAdminAssetPath = req.path.startsWith(`${adminPath}/assets/`);

    if (!isAdminPathRequest) {
      next();
      return;
    }

    applyAdminSecurityHeaders(res);

    if (req.path === adminPath || req.path === `${adminPath}/` || isAdminAssetPath || req.path === "/api/auth/admin-login") {
      next();
      return;
    }

    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token || !(await verifySession(token))) {
      res.redirect(302, `${adminPath}/`);
      return;
    }

    next();
    return;
  }

  const hostname = getAdminHostname(req);
  const isAdminHost = hostname === adminHost;
  const isAdminApiPath = req.path.startsWith("/api/admin") || req.path === "/api/auth/admin-login" || req.path === "/api/auth/admin-logout";

  if (!isAdminHost && isAdminApiPath) {
    res.status(404).end();
    return;
  }

  if (!isAdminHost) {
    next();
    return;
  }

  applyAdminSecurityHeaders(res);

  if (isAdminAuthPath(req.path)) {
    next();
    return;
  }

  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token || !(await verifySession(token))) {
    res.redirect(302, "/");
    return;
  }

  next();
}

export async function requireAdmin(req: Request, res: Response): Promise<true | Response> {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  if (!(await verifySession(token))) return res.status(401).json({ error: "Unauthorized" });
  return true;
}

export { ADMIN_SESSION_COOKIE };

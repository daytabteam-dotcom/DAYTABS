import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { SignJWT } from "jose";
import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";
import { ADMIN_SESSION_COOKIE } from "../../lib/adminAuth";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";
import { getOrCreateUsage } from "../../lib/usageService";
import { CONTACT_EMAIL, SMTP_USER, assertMailConfigured, createMailTransport, escapeHtml } from "../../lib/email";
import { syncUserPlanFromPaddle } from "../../lib/paddlePlanSync";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CORE_APP_URL = process.env.CORE_APP_URL || "/panel/";
const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");
const RENDER_HOST = "daytabs.onrender.com";
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;
const adminAttempts = new Map<string, { count: number; resetAt: number }>();

function getPublicBaseUrl(req: import("express").Request): string {
  const forwarded = req.get("x-forwarded-host");
  if (forwarded) return `${req.get("x-forwarded-proto") || "https"}://${forwarded}`;
  return `${req.protocol}://${req.get("host")}`;
}

function getGoogleRedirectUri(req: import("express").Request): string {
  const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (process.env.NODE_ENV === "production") {
    const callbackPath = configuredRedirectUri
      ? new URL(configuredRedirectUri, CANONICAL_APP_ORIGIN).pathname
      : GOOGLE_CALLBACK_PATH;
    return `${CANONICAL_APP_ORIGIN}${callbackPath}`;
  }

  if (configuredRedirectUri) return configuredRedirectUri;
  return `${getPublicBaseUrl(req)}${GOOGLE_CALLBACK_PATH}`;
}

function getCoreAppPath(): string {
  try {
    const url = new URL(CORE_APP_URL);
    return `${url.pathname}${url.search}${url.hash}` || "/panel/";
  } catch {
    return CORE_APP_URL || "/panel/";
  }
}

function appendRedirectParam(path: string, key: string, value: string): string {
  const url = new URL(path, "https://daytabs.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function getAppRedirect(req: import("express").Request, path: string): string {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  if (host === RENDER_HOST) return `${CANONICAL_APP_ORIGIN}${path}`;
  return path;
}

function signToken(userId: number, email: string, name?: string | null, plan = "free") {
  return jwt.sign(
    { user_id: userId, email, name: name || email.split("@")[0], plan },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = adminAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    adminAttempts.set(ip, { count: 1, resetAt: now + ADMIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= ADMIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function timingSafeStringEqual(value: string, expected: string) {
  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);
  const sameLength = valueBuffer.length === expectedBuffer.length;
  const safeValueBuffer = sameLength ? valueBuffer : Buffer.alloc(expectedBuffer.length);
  return expectedBuffer.length > 0 && timingSafeEqual(safeValueBuffer, expectedBuffer) && sameLength;
}

function adminJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET environment variable is required");
  return new TextEncoder().encode(secret);
}

router.post("/admin-login", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? "127.0.0.1";
  const rateLimitOk = checkRateLimit(ip);
  const { username = "", password = "" } = (req.body ?? {}) as { username?: string; password?: string };
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (!rateLimitOk) {
    res.status(429).json({ error: "Too many attempts" });
    return;
  }

  try {
    const usernameMatches = timingSafeStringEqual(username, process.env.ADMIN_USERNAME ?? "");
    const passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH ?? "");

    if (!usernameMatches || !passwordMatches) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(adminJwtSecret());

    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 8 * 1000,
      path: "/",
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Admin login error");
    res.status(401).json({ error: "Invalid credentials" });
  }
});

router.post("/admin-logout", (_req, res) => {
  res.cookie(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  res.json({ ok: true });
});

router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "An account with this email already exists" }); return; }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({ email, name: name || null, passwordHash }).returning();
    const token = signToken(user.id, user.email, user.name, user.plan);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan } });
  } catch (err) {
    req.log.error({ err }, "Signup error");
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !user.passwordHash) { res.status(401).json({ error: "Invalid email or password" }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }
    const token = signToken(user.id, user.email, user.name, user.plan);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan } });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.user_id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const { planToStore, synced, freshUser } = await syncUserPlanFromPaddle(user, req.log);
    const plan = normalizePlan(planToStore);
    const planConfig = PLAN_LIMITS[plan];
    const usage = await getOrCreateUsage(freshUser.id);
    const freshToken = synced
      ? signToken(freshUser.id, freshUser.email, freshUser.name, planToStore)
      : null;
    res.json({
      id: freshUser.id,
      email: freshUser.email,
      name: freshUser.name,
      plan: planToStore,
      freshToken,
      uploadCounts: { "video-analyzer": usage.videoAnalysesUsed },
      scriptPlannerChats: usage.scriptPlannerChatsUsed,
      features: planConfig.features,
      limits: {
        video_analyses_per_month: planConfig.video_analyses_per_month === Infinity ? -1 : planConfig.video_analyses_per_month,
        script_planner_chats_per_month: planConfig.script_planner_chats_per_month === Infinity ? -1 : planConfig.script_planner_chats_per_month,
        max_video_size_bytes: planConfig.max_video_size_bytes,
        max_video_duration_seconds: planConfig.max_video_duration_seconds,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ error: "Failed to get user info" });
  }
});

router.get("/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) { res.status(503).json({ error: "Google OAuth is not configured" }); return; }
  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  const redirectUri = getGoogleRedirectUri(req);
  const url = client.generateAuthUrl({ access_type: "offline", scope: ["profile", "email"], redirect_uri: redirectUri });
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    const coreAppPath = getCoreAppPath();
    if (!GOOGLE_CLIENT_ID) { res.redirect(getAppRedirect(req, appendRedirectParam(coreAppPath, "error", "google_not_configured"))); return; }
    const { code } = req.query as { code?: string };
    if (!code) { res.redirect(getAppRedirect(req, appendRedirectParam(coreAppPath, "error", "no_code"))); return; }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    const redirectUri = getGoogleRedirectUri(req);
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) { res.redirect(getAppRedirect(req, appendRedirectParam(coreAppPath, "error", "no_email"))); return; }
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, payload.email)).limit(1);
    if (!user) {
      [user] = await db.insert(usersTable).values({ email: payload.email, name: payload.name || null, googleId: payload.sub }).returning();
    } else if (!user.googleId) {
      await db.update(usersTable).set({ googleId: payload.sub }).where(eq(usersTable.id, user.id));
    }
    const token = signToken(user.id, user.email, user.name, user.plan);
    res.redirect(getAppRedirect(req, appendRedirectParam(coreAppPath, "token", token)));
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect(getAppRedirect(req, appendRedirectParam(getCoreAppPath(), "error", "oauth_failed")));
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body as { name?: string; email?: string; message?: string };
    if (!name || !email || !message) { res.status(400).json({ error: "Name, email, and message are required" }); return; }
    req.log.info({ name, email }, "Contact form submission received");
    const mailConfig = assertMailConfigured();
    if (!mailConfig.configured) {
      req.log.error({ missing: mailConfig.missing }, "Contact email is not configured");
      res.status(503).json({ error: "Email is not configured. Please contact support directly." });
      return;
    }

    const transport = createMailTransport();
    const info = await transport.sendMail({
      from: `"DayTabs Contact" <${SMTP_USER}>`,
      to: CONTACT_EMAIL,
      replyTo: `"${name}" <${email}>`,
      subject: `New contact message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#7c3aed">New Contact Message - DayTabs</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;font-weight:bold;color:#555">Name</td><td style="padding:8px">${escapeHtml(name)}</td></tr><tr><td style="padding:8px;font-weight:bold;color:#555">Email</td><td style="padding:8px"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr></table><div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap">${escapeHtml(message)}</div></div>`,
    });
    req.log.info({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, "Contact email sent");

    res.json({ success: true, message: "Message received. We'll get back to you soon!" });
  } catch (err) {
    req.log.error({ err }, "Contact email error");
    res.status(500).json({ error: "Failed to send message. Please try again." });
  }
});

export default router;

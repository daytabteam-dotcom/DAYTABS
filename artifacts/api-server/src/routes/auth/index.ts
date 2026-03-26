import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";
import { analysisJobsTable, scriptPlannerChatsTable } from "@workspace/db";
import { requireAuth } from "../../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "daytabs-dev-secret-change-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CORE_APP_URL = process.env.CORE_APP_URL || "/panel/";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || SMTP_USER;

function getPublicBaseUrl(req: import("express").Request): string {
  const forwarded = req.get("x-forwarded-host");
  if (forwarded) return `${req.get("x-forwarded-proto") || "https"}://${forwarded}`;
  const replitDomains = (process.env.REPLIT_DOMAINS || "").split(",").map(d => d.trim()).filter(Boolean);
  const replitDomain = process.env.NODE_ENV === "production"
    ? replitDomains[0]
    : (process.env.REPLIT_DEV_DOMAIN || replitDomains[0]);
  if (replitDomain) return `https://${replitDomain}`;
  return `${req.protocol}://${req.get("host")}`;
}

function getGoogleRedirectUri(req: import("express").Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${getPublicBaseUrl(req)}/api/auth/google/callback`;
}

router.get("/debug-oauth", (req, res) => {
  const redirectUri = getGoogleRedirectUri(req);
  res.json({
    redirectUri,
    authorizedJsOrigin: redirectUri.replace("/api/auth/google/callback", ""),
    authorizedRedirectUri: redirectUri,
    envDomains: process.env.REPLIT_DOMAINS || "(not set)",
    envDevDomain: process.env.REPLIT_DEV_DOMAIN || "(not set)",
  });
});

function signToken(userId: number, email: string, name?: string | null, plan = "free") {
  return jwt.sign(
    { user_id: userId, email, name: name || email.split("@")[0], plan },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function createMailTransport() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** Monthly usage counts for the dashboard */
async function getMonthlyUsageCounts(userId: number): Promise<{ uploadCounts: Record<string, number>; scriptPlannerChats: number }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [uploadRow] = await db
    .select({ cnt: count() })
    .from(analysisJobsTable)
    .where(
      and(
        eq(analysisJobsTable.userId, userId),
        eq(analysisJobsTable.mode, "video-analyzer"),
        gte(analysisJobsTable.createdAt, startOfMonth)
      )
    );

  const [chatRow] = await db
    .select({ cnt: count() })
    .from(scriptPlannerChatsTable)
    .where(
      and(
        eq(scriptPlannerChatsTable.userId, userId),
        gte(scriptPlannerChatsTable.createdAt, startOfMonth)
      )
    );

  return {
    uploadCounts: { "video-analyzer": Number(uploadRow?.cnt ?? 0) },
    scriptPlannerChats: Number(chatRow?.cnt ?? 0),
  };
}

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
    const { uploadCounts, scriptPlannerChats } = await getMonthlyUsageCounts(user.id);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      uploadCounts,
      scriptPlannerChats,
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
    if (!GOOGLE_CLIENT_ID) { res.redirect(`${CORE_APP_URL}?error=google_not_configured`); return; }
    const { code } = req.query as { code?: string };
    if (!code) { res.redirect(`${CORE_APP_URL}?error=no_code`); return; }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    const redirectUri = getGoogleRedirectUri(req);
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) { res.redirect(`${CORE_APP_URL}?error=no_email`); return; }
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, payload.email)).limit(1);
    if (!user) {
      [user] = await db.insert(usersTable).values({ email: payload.email, name: payload.name || null, googleId: payload.sub }).returning();
    } else if (!user.googleId) {
      await db.update(usersTable).set({ googleId: payload.sub }).where(eq(usersTable.id, user.id));
    }
    const token = signToken(user.id, user.email, user.name, user.plan);
    const destination = CORE_APP_URL.endsWith("/") ? CORE_APP_URL : `${CORE_APP_URL}/`;
    res.redirect(`${destination}?token=${token}`);
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect(`${CORE_APP_URL}?error=oauth_failed`);
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body as { name?: string; email?: string; message?: string };
    if (!name || !email || !message) { res.status(400).json({ error: "Name, email, and message are required" }); return; }
    req.log.info({ name, email }, "Contact form submission received");
    const transport = createMailTransport();
    if (transport && CONTACT_EMAIL) {
      await transport.sendMail({
        from: `"DayTabs Contact" <${SMTP_USER}>`,
        to: CONTACT_EMAIL,
        replyTo: `"${name}" <${email}>`,
        subject: `New contact message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#7c3aed">New Contact Message — DayTabs</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;font-weight:bold;color:#555">Name</td><td style="padding:8px">${name}</td></tr><tr><td style="padding:8px;font-weight:bold;color:#555">Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr></table><div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap">${message}</div></div>`,
      });
    }
    res.json({ success: true, message: "Message received. We'll get back to you soon!" });
  } catch (err) {
    req.log.error({ err }, "Contact email error");
    res.status(500).json({ error: "Failed to send message. Please try again." });
  }
});

export default router;

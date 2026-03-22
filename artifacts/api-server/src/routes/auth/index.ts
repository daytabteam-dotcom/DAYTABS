import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "daytabs-dev-secret-change-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CORE_APP_URL = process.env.CORE_APP_URL || "/";

function getPublicBaseUrl(req: import("express").Request): string {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN || (process.env.REPLIT_DOMAINS || "").split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const forwarded = req.get("x-forwarded-host");
  if (forwarded) return `${req.get("x-forwarded-proto") || "https"}://${forwarded}`;
  return `${req.protocol}://${req.get("host")}`;
}

function getGoogleRedirectUri(req: import("express").Request): string {
  return `${getPublicBaseUrl(req)}/api/auth/google/callback`;
}

function signToken(userId: number, email: string, name?: string | null) {
  return jwt.sign({ user_id: userId, email, name: name || email.split("@")[0] }, JWT_SECRET, { expiresIn: "7d" });
}

router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({ email, name: name || null, passwordHash }).returning();
    const token = signToken(user.id, user.email, user.name);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    req.log.error({ err }, "Signup error");
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = signToken(user.id, user.email, user.name);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google OAuth is not configured" });
    return;
  }
  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  const redirectUri = getGoogleRedirectUri(req);
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
    redirect_uri: redirectUri,
  });
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      res.redirect(`${CORE_APP_URL}?error=google_not_configured`);
      return;
    }
    const { code } = req.query as { code?: string };
    if (!code) {
      res.redirect(`${CORE_APP_URL}?error=no_code`);
      return;
    }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    const redirectUri = getGoogleRedirectUri(req);
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.redirect(`${CORE_APP_URL}?error=no_email`);
      return;
    }
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, payload.email)).limit(1);
    if (!user) {
      [user] = await db.insert(usersTable).values({
        email: payload.email,
        name: payload.name || null,
        googleId: payload.sub,
      }).returning();
    } else if (!user.googleId) {
      await db.update(usersTable).set({ googleId: payload.sub }).where(eq(usersTable.id, user.id));
    }
    const token = signToken(user.id, user.email, user.name);
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
    if (!name || !email || !message) {
      res.status(400).json({ error: "Name, email, and message are required" });
      return;
    }
    req.log.info({ name, email, message }, "Contact form submission");
    res.json({ success: true, message: "Message received. We'll get back to you soon!" });
  } catch (err) {
    req.log.error({ err }, "Contact error");
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;

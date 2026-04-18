import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db, youtubeChannelProfilesTable } from "@workspace/db";
import { requireAuth } from "../../middlewares/auth";
import {
  createYoutubeAuthUrl,
  discoverCompetitors,
  generateYoutubeWeeklyPlan,
  getYoutubeAppRedirect,
  getYoutubeRedirectUri,
  getYoutubeStatus,
  improveYoutubeIdea,
  savePlanResults,
  storeYoutubeTokens,
  syncYoutubeChannel,
} from "../../lib/youtube";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");
const RENDER_HOST = "daytabs.onrender.com";

function redirectForHost(req: import("express").Request, path: string) {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  if (host === RENDER_HOST) return `${CANONICAL_APP_ORIGIN}${path}`;
  return path;
}

router.get("/connect", requireAuth, (req, res) => {
  try {
    res.redirect(createYoutubeAuthUrl(req, req.auth!.user_id));
  } catch (err) {
    req.log.error({ err }, "YouTube connect URL error");
    res.status(503).json({ error: err instanceof Error ? err.message : "YouTube OAuth is not configured" });
  }
});

router.get("/connect-url", requireAuth, (req, res) => {
  try {
    res.json({ url: createYoutubeAuthUrl(req, req.auth!.user_id) });
  } catch (err) {
    req.log.error({ err }, "YouTube connect URL error");
    res.status(503).json({ error: err instanceof Error ? err.message : "YouTube OAuth is not configured" });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "missing_code")));
      return;
    }

    const decoded = jwt.verify(state, JWT_SECRET) as { user_id?: number; purpose?: string };
    if (decoded.purpose !== "youtube_connect" || !decoded.user_id) {
      res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "invalid_state")));
      return;
    }

    const client = new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, getYoutubeRedirectUri(req));
    const { tokens } = await client.getToken({ code, redirect_uri: getYoutubeRedirectUri(req) });
    await storeYoutubeTokens(decoded.user_id, tokens);
    await syncYoutubeChannel(decoded.user_id);
    res.redirect(redirectForHost(req, getYoutubeAppRedirect("connected")));
  } catch (err) {
    req.log.error({ err }, "YouTube OAuth callback error");
    res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "oauth_failed")));
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    res.json(await getYoutubeStatus(req.auth!.user_id));
  } catch (err) {
    req.log.error({ err }, "YouTube status error");
    res.status(500).json({ error: "Failed to load YouTube status" });
  }
});

router.post("/sync", requireAuth, async (req, res) => {
  try {
    const channel = await syncYoutubeChannel(req.auth!.user_id);
    res.json({ channel });
  } catch (err) {
    req.log.error({ err }, "YouTube sync error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to sync YouTube channel" });
  }
});

router.post("/competitors/discover", requireAuth, async (req, res) => {
  try {
    const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, req.auth!.user_id)).limit(1);
    if (!profile) {
      res.status(400).json({ error: "Connect YouTube before discovering competitors" });
      return;
    }
    const competitors = await discoverCompetitors(req.auth!.user_id, profile);
    res.json({ competitors });
  } catch (err) {
    req.log.error({ err }, "YouTube competitor discovery error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to discover competitors" });
  }
});

router.post("/plans/generate", requireAuth, async (req, res) => {
  try {
    const plan = await generateYoutubeWeeklyPlan(req.auth!.user_id);
    res.json({ plan });
  } catch (err) {
    req.log.error({ err }, "YouTube plan generation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate YouTube plan" });
  }
});

router.post("/plans/:planId/results", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const results = (Array.isArray(req.body?.results) ? req.body.results : []) as Array<{ dayIndex: number; plannedTitle: string; videoId?: string; videoUrl?: string }>;
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: "Valid plan ID is required" });
      return;
    }
    if (!results.length) {
      res.status(400).json({ error: "At least one video URL is required" });
      return;
    }
    const videoIds = results.map((result) => result?.videoId || result?.videoUrl).filter(Boolean);
    if (new Set(videoIds).size !== videoIds.length) {
      res.status(400).json({ error: "One YouTube video cannot be linked to more than one content idea" });
      return;
    }
    const saved = await savePlanResults(req.auth!.user_id, planId, results);
    res.json({ results: saved });
  } catch (err) {
    req.log.error({ err }, "YouTube plan result collection error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to collect YouTube results" });
  }
});

router.post("/ideas/improve", requireAuth, async (req, res) => {
  try {
    const idea = req.body?.idea && typeof req.body.idea === "object" ? req.body.idea : {};
    const improved = await improveYoutubeIdea(req.auth!.user_id, idea);
    res.json({ idea: improved });
  } catch (err) {
    req.log.error({ err }, "YouTube idea improvement error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to improve idea" });
  }
});

export default router;

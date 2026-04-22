import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db, youtubeChannelProfilesTable } from "@workspace/db";
import { requireAuth } from "../../middlewares/auth";
import {
  addYoutubeCompetitorByUrl,
  createYoutubePlanDay,
  createYoutubeAuthUrl,
  deleteYoutubePlanDay,
  discoverCompetitors,
  generateYoutubeWeeklyPlan,
  getYoutubeAppRedirect,
  getYoutubeRedirectUri,
  getYoutubeStatus,
  patchYoutubePlanDay,
  improveYoutubeIdea,
  regenerateYoutubePlanIdea,
  removeYoutubeCompetitor,
  savePlanResults,
  storeYoutubeTokens,
  syncYoutubeChannel,
  updateYoutubeIdeaFeedback,
  updateYoutubeSettings,
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

router.post("/settings", requireAuth, async (req, res) => {
  try {
    const preferredPostsPerWeek = Number(req.body?.preferredPostsPerWeek);
    if (!Number.isFinite(preferredPostsPerWeek) || preferredPostsPerWeek < 1) {
      res.status(400).json({ error: "preferredPostsPerWeek must be a positive number" });
      return;
    }
    const settings = await updateYoutubeSettings(req.auth!.user_id, { preferredPostsPerWeek });
    res.json({ settings });
  } catch (err) {
    req.log.error({ err }, "YouTube settings update error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update YouTube settings" });
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

router.post("/competitors", requireAuth, async (req, res) => {
  try {
    const channelUrl = typeof req.body?.channelUrl === "string" ? req.body.channelUrl.trim() : "";
    if (!channelUrl) {
      res.status(400).json({ error: "A YouTube channel URL is required" });
      return;
    }
    const competitor = await addYoutubeCompetitorByUrl(req.auth!.user_id, channelUrl);
    res.json({ competitor });
  } catch (err) {
    req.log.error({ err }, "YouTube competitor add error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add competitor" });
  }
});

router.delete("/competitors/:competitorId", requireAuth, async (req, res) => {
  try {
    const competitorId = Number(req.params.competitorId);
    if (!Number.isInteger(competitorId) || competitorId <= 0) {
      res.status(400).json({ error: "A valid competitor ID is required" });
      return;
    }
    const removed = await removeYoutubeCompetitor(req.auth!.user_id, competitorId);
    res.json(removed);
  } catch (err) {
    req.log.error({ err }, "YouTube competitor remove error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to remove competitor" });
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

router.post("/plans/:planId/days", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const day = req.body?.day && typeof req.body.day === "object" ? req.body.day : null;
    if (!Number.isInteger(planId) || planId <= 0 || !day) {
      res.status(400).json({ error: "Valid plan ID and day payload are required" });
      return;
    }
    const created = await createYoutubePlanDay(req.auth!.user_id, planId, day);
    res.json(created);
  } catch (err) {
    req.log.error({ err }, "YouTube day create error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create plan day" });
  }
});

router.patch("/plans/:planId/days/:dayIndex", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    const patch = req.body?.patch && typeof req.body.patch === "object" ? req.body.patch : {};
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await patchYoutubePlanDay(req.auth!.user_id, planId, dayIndex, patch);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube day patch error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update plan day" });
  }
});

router.delete("/plans/:planId/days/:dayIndex", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await deleteYoutubePlanDay(req.auth!.user_id, planId, dayIndex);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube day delete error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete plan day" });
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

router.post("/plans/:planId/days/:dayIndex/feedback", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    const feedback = req.body?.feedback;
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    if (![null, "liked", "disliked"].includes(feedback ?? null)) {
      res.status(400).json({ error: "feedback must be liked, disliked, or null" });
      return;
    }
    const updated = await updateYoutubeIdeaFeedback(req.auth!.user_id, planId, dayIndex, feedback ?? null);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube idea feedback error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save idea feedback" });
  }
});

router.post("/plans/:planId/days/:dayIndex/regenerate", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await regenerateYoutubePlanIdea(req.auth!.user_id, planId, dayIndex);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube idea regenerate error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to regenerate idea" });
  }
});

export default router;

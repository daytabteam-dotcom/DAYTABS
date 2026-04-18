import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { CONTACT_EMAIL, SMTP_USER, assertMailConfigured, createMailTransport, escapeHtml } from "../../lib/email";
import { fetchTrendingTopics, scrapePublicProfile } from "../../lib/enrichment";
import { GROWTH_PLANNER_JSON_SHAPE, GROWTH_PLANNER_SYSTEM_PROMPT } from "../../lib/growthPlannerPrompts";
import { openai } from "../../lib/openai";
import { normalizePlan } from "../../lib/planLimits";

const router = Router();

const GROWTH_PLANNER_USER_PROMPT = `Generate a realistic, trend-anchored Growth Planner calendar.

INPUTS AVAILABLE TO YOU:
1. profile - user's niche, goals, audience, uploaded context names, and brand details
2. platforms - selected platforms with posts_per_week targets and profile URLs
3. profileData - scraped from actual public profile pages during this request; use this for real numbers
4. trendData.googleTrendItems - parsed Google Trends titles pulled during this request
5. trendData.redditHot - top 10 posts from a relevant subreddit pulled during this request
6. trendData.youtubeTrending - parsed titles from YouTube Trending when available
7. previousCalendar, posted URLs, skipped ideas, and result notes for next-week mode

CALENDAR REQUIREMENTS:
- scheduled_date: ISO YYYY-MM-DD, starting from startDate
- At least 60% of posts must tie to a trend from trendData when trendData has usable items
- Each post needs: title, hook, format, platform, scheduled_date, rationale, cta
- rationale must explain why this topic and timing are strong based on real data
- Mark any field you cannot verify as discovery_needed: true
- posts_per_week must exactly match the selected cadence per platform

Return valid JSON matching this schema. No fabricated data:
${GROWTH_PLANNER_JSON_SHAPE}
`;

type PlannerGenerateMode = "initial" | "next-week" | "custom-idea";

function parseAiJson(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getProfileNiche(profile: unknown) {
  const record = objectRecord(profile);
  return typeof record.niche === "string" ? record.niche : "";
}

function getSelectedPlatformEntries(platforms: unknown) {
  const records = objectRecord(platforms);
  return Object.entries(records)
    .map(([platform, config]) => ({ platform, config: objectRecord(config) }))
    .filter(({ config }) => config.selected === true)
    .map(({ platform, config }) => ({
      platform,
      url: typeof config.url === "string" ? config.url.trim() : "",
      postsPerWeek: typeof config.postsPerWeek === "number" ? config.postsPerWeek : null,
    }));
}

router.post("/notify", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const mailConfig = assertMailConfigured();
    if (!mailConfig.configured) {
      req.log.error({ missing: mailConfig.missing, email }, "Growth Planner notification email is not configured");
      res.status(503).json({ error: "Email is not configured. Please contact support directly." });
      return;
    }

    const transport = createMailTransport();
    const info = await transport.sendMail({
      from: `"DayTabs" <${SMTP_USER}>`,
      to: CONTACT_EMAIL,
      subject: "Growth Planner Request",
      text: `A user has requested to be notified when Growth Planner launches.\n\nEmail: ${email}\n\nThis was submitted from the DayTabs Growth Planner waitlist.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0d0814; border-radius: 12px; border: 1px solid #2a1f3d; color: #fff;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #f9a8d4;">Growth Planner Request</h2>
          <p style="margin: 0 0 24px; color: #9ca3af; font-size: 14px;">A user signed up for the Growth Planner waitlist on DayTabs.</p>
          <div style="padding: 16px; background: #1a0f2e; border-radius: 8px; border: 1px solid #2a1f3d;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase;">Submitted Email</p>
            <p style="margin: 8px 0 0; font-size: 16px; font-weight: 600; color: #fbcfe8;">${escapeHtml(email)}</p>
          </div>
        </div>
      `,
    });
    req.log.info({ email, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, "Growth Planner notification email sent");

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Growth Planner notification email error");
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

router.post("/generate", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "Growth Planner AI generation is available on the Studio plan.",
      });
      return;
    }

    const {
      mode = "initial",
      profile,
      platforms,
      weekNumber,
      previousCalendar,
      customIdea,
      startDate,
    } = req.body as {
      mode?: PlannerGenerateMode;
      profile?: unknown;
      platforms?: unknown;
      weekNumber?: unknown;
      previousCalendar?: unknown;
      customIdea?: unknown;
      startDate?: unknown;
    };

    if (!profile || typeof profile !== "object") {
      res.status(400).json({ error: "Profile is required" });
      return;
    }

    const selectedPlatforms = getSelectedPlatformEntries(platforms);
    const profileUrls = selectedPlatforms.filter((entry) => entry.url);
    const [profileData, trendData] = await Promise.all([
      Promise.all(profileUrls.map((entry) => scrapePublicProfile(entry.url, entry.platform))),
      fetchTrendingTopics(getProfileNiche(profile), selectedPlatforms.map((entry) => entry.platform)),
    ]);

    req.log.info({
      profileResults: profileData.map((item) => ({
        platform: item.platform,
        username: item.username,
        normalizedUrl: item.normalizedUrl,
        hasFollowerCount: Boolean(item.followerCount ?? item.subscriberCount ?? item.possibleFollowerCount),
        hasDescription: Boolean(item.description ?? item.bio ?? item.metaDescription),
        error: item.error ?? null,
      })),
      trendResults: {
        googleTrendsItems: trendData.googleTrendItems.length,
        redditItems: trendData.redditHot.length,
        youtubeItems: trendData.youtubeTrending.length,
        errors: trendData.errors,
      },
    }, "Enrichment results before AI call");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: GROWTH_PLANNER_SYSTEM_PROMPT },
        { role: "user", content: GROWTH_PLANNER_USER_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            mode,
            profile,
            platforms,
            weekNumber,
            previousCalendar,
            customIdea,
            startDate,
            currentDate: new Date().toISOString().slice(0, 10),
            profileData,
            trendData,
            enrichment: {
              selectedPlatforms,
              profileUrlsRequested: profileUrls.length,
              profileUrlsFetched: profileData.filter((item) => !item.error).length,
              trendErrors: trendData.errors,
            },
          }),
        },
      ],
      max_completion_tokens: mode === "custom-idea" ? 2500 : 9000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let planner;
    try {
      planner = parseAiJson(raw);
    } catch (err) {
      req.log.error({ err, raw }, "Failed to parse Growth Planner AI response");
      res.status(500).json({ error: "Failed to parse AI planner data. Please try again." });
      return;
    }

    res.json({ planner, raw });
  } catch (err) {
    req.log.error({ err }, "Growth Planner AI generation error");
    res.status(500).json({ error: "Failed to generate Growth Planner data. Please try again." });
  }
});

export default router;

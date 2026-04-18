import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { CONTACT_EMAIL, SMTP_USER, assertMailConfigured, createMailTransport, escapeHtml } from "../../lib/email";
import { GROWTH_PLANNER_JSON_SHAPE, GROWTH_PLANNER_SYSTEM_PROMPT } from "../../lib/growthPlannerPrompts";
import { openai } from "../../lib/openai";
import { normalizePlan } from "../../lib/planLimits";

const router = Router();

const GROWTH_PLANNER_USER_PROMPT = `Generate Growth Planner data for the DayTabs app.

Return valid JSON only, matching this shape:
${GROWTH_PLANNER_JSON_SHAPE}

Important product behavior:
- You do not have browser access in this request. Use the user's provided profile URLs, post URLs, uploaded context names, niche, audience, goals, selected platforms, and posting cadence.
- For external facts you cannot verify, do not fabricate. Mark data limitations clearly.
- Still generate a useful production-ready calendar from the user's inputs, even when competitor/trend evidence is insufficient.
- Use source_inspirations only when the source is a user-provided URL or a safe platform search/profile URL clearly marked as discovery_needed.
- scheduled_date must be ISO YYYY-MM-DD.
- Calendar length should match selected platforms and their posts_per_week as closely as practical for one week.
- If this is next-week generation, use the previous calendar, posted URLs, skipped ideas, and result notes to adjust topics and avoid repeating weak ideas.`;

type PlannerGenerateMode = "initial" | "next-week" | "custom-idea";

function parseAiJson(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
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

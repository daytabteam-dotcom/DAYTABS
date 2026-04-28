import { openai } from "../lib/openai";
import { logTokenUsage, usageTokens } from "../lib/logTokens";
import type { PlanPayload, SocialPlatform, SocialPostPerformanceFeedback, SocialPlanDay } from "../models/socialGrowthPlan";

function parseAiJson(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateWindow(startDate: string) {
  return Array.from({ length: 7 }, (_, index) => addDaysIso(startDate, index));
}

function datesForCadence(startDate: string, postsPerWeek: number) {
  const count = Math.max(1, Math.min(7, postsPerWeek));
  const dates = dateWindow(startDate);
  if (count === 7) return dates;

  const weekday = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const preferredByCount: Record<number, number[]> = {
    1: [2, 3, 1, 4, 5, 0, 6],
    2: [2, 4, 1, 3, 5, 0, 6],
    3: [1, 3, 5, 2, 4, 0, 6],
    4: [1, 2, 4, 5, 3, 0, 6],
    5: [1, 2, 3, 4, 5, 0, 6],
    6: [1, 2, 3, 4, 5, 0, 6],
  };
  const preferred = preferredByCount[count] ?? [1, 2, 3, 4, 5, 0, 6];
  const ranked = [...dates].sort((a, b) => {
    const aRank = preferred.indexOf(weekday(a));
    const bRank = preferred.indexOf(weekday(b));
    if (aRank !== bRank) return aRank - bRank;
    return dates.indexOf(a) - dates.indexOf(b);
  });
  return ranked.slice(0, count).sort((a, b) => dates.indexOf(a) - dates.indexOf(b));
}

function platformRules(platform: SocialPlatform) {
  if (platform === "linkedin") {
    return [
      "Generate professional, founder-led, educational, or story-based posts.",
      "Focus on strong first 2 lines, a clear insight, personal experience, business value, and a conversation-starting ending.",
      "Use a non-salesy CTA.",
      "descriptionSuggestion should be post direction or a draft outline for the post.",
      "thumbnailConcept should be an optional visual or carousel concept.",
    ].join("\n");
  }
  if (platform === "tiktok") {
    return [
      "Generate short-form video ideas.",
      "Focus on the first 1 to 2 second hook, fast pacing, visual action, text overlay, simple script, trend-aware structure, and a loopable ending.",
      "outline must be scene-by-scene structure.",
      "tags must be hashtags.",
      "descriptionSuggestion should be a caption.",
      "thumbnailConcept should be a cover frame idea.",
      "soundSuggestion should be included when relevant.",
    ].join("\n");
  }
  return [
    "Generate Reels, carousel, story, or post ideas.",
    "Focus on visual concept, saveable content, strong cover title, caption hook, engagement CTA, and hashtags.",
    "outline must be reel scenes, carousel slides, or post structure.",
    "tags must be hashtags.",
    "descriptionSuggestion should be a caption.",
    "thumbnailConcept should be a cover or visual concept.",
    "soundSuggestion should only be used for Reels style ideas.",
  ].join("\n");
}

function jsonShape(postsPerWeek: number) {
  return `{
  "summary": "string",
  "days": [
    {
      "id": "string",
      "day": number,
      "date": "YYYY-MM-DD",
      "contentIdea": "string",
      "hook": "string",
      "outline": ["string"],
      "bestPostingTime": "string",
      "rationale": "string",
      "tags": ["string"],
      "descriptionSuggestion": "string",
      "thumbnailConcept": "string",
      "soundSuggestion": "string | null",
      "status": "not_finished"
    }
  ]
}

Rules:
- Return exactly ${postsPerWeek} items in days.
- day is 1..${postsPerWeek}.
- date must be one of the scheduled dates provided to you.
- Keep JSON valid.`;
}

export async function generateSocialWeeklyPlanAi(params: {
  userId: number;
  model: string;
  platform: SocialPlatform;
  startDate: string;
  endDate: string;
  topic: string;
  postsPerWeek: number;
  audience?: string;
  goal?: string;
  tone?: string;
  formatPreference?: string;
  previousPlan?: PlanPayload | null;
  previousFeedback?: SocialPostPerformanceFeedback[] | null;
  skippedFeedback?: boolean;
}) {
  const scheduledDates = datesForCadence(params.startDate, params.postsPerWeek);
  const sys = `You are a Growth Planner assistant for ${params.platform}.

OUTPUT:
- Return valid JSON with fields described in the JSON shape below.
- Do not include markdown.
- Do not include extra keys outside the shape.

PLATFORM RULES:
${platformRules(params.platform)}
`;

  const userPrompt = `Generate a weekly content plan for ${params.platform}.

Platform:
${params.platform}

Date range:
${params.startDate} to ${params.endDate}

Scheduled dates (use only these dates):
${scheduledDates.join(", ")}

Posts per week:
${params.postsPerWeek}

Current topic:
${params.topic}

Audience:
${params.audience || ""}

Goal:
${params.goal || ""}

Tone:
${params.tone || ""}

Format preference:
${params.formatPreference || ""}

Previous week plan:
${params.previousPlan ? JSON.stringify(params.previousPlan) : "null"}

Previous week manual performance feedback:
${params.skippedFeedback ? "User skipped feedback. Use prior plan context and topic only." : params.previousFeedback ? JSON.stringify(params.previousFeedback) : "null"}

Rules:
- Use the feedback to improve next week's ideas.
- If a post performed great or good, create a fresh related angle, not a duplicate.
- If a post performed poorly, avoid repeating the same hook, format, or angle.
- If the user skipped or did not finish a post, do not assume it failed.
- Follow the native content criteria of ${params.platform}.
- Do not generate generic content.
- Return valid JSON matching the shape.

JSON shape:
${jsonShape(params.postsPerWeek)}
`;

  const completion = await openai.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2600,
  });

  await logTokenUsage({
    userId: params.userId,
    feature: "socialGrowthPlan",
    model: params.model,
    ...usageTokens(completion.usage),
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = parseAiJson(raw) as PlanPayload;
  const days = Array.isArray(parsed.days) ? parsed.days : [];

  const normalizedDays: SocialPlanDay[] = days
    .slice(0, params.postsPerWeek)
    .map((day, index) => ({
      id: typeof day.id === "string" && day.id.trim() ? day.id.trim() : `day-${index + 1}-${Math.random().toString(16).slice(2)}`,
      day: index + 1,
      date: isIsoDate(day.date) ? day.date : scheduledDates[index % scheduledDates.length]!,
      contentIdea: String(day.contentIdea ?? "").trim(),
      hook: String(day.hook ?? "").trim(),
      outline: Array.isArray(day.outline) ? day.outline.map((line) => String(line)).filter(Boolean).slice(0, 12) : [],
      bestPostingTime: String(day.bestPostingTime ?? "").trim() || "Time TBD",
      rationale: String(day.rationale ?? "").trim(),
      tags: Array.isArray(day.tags) ? day.tags.map((tag) => String(tag)).filter(Boolean).slice(0, 18) : [],
      descriptionSuggestion: String(day.descriptionSuggestion ?? "").trim(),
      thumbnailConcept: String(day.thumbnailConcept ?? "").trim(),
      soundSuggestion: day.soundSuggestion == null ? null : String(day.soundSuggestion),
      status: "not_finished",
    }));

  // Force the scheduled cadence dates in order, to keep UI predictable.
  const forced = normalizedDays.map((d, index) => ({ ...d, date: scheduledDates[index % scheduledDates.length]! }));

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  return { summary, days: forced } satisfies PlanPayload;
}

export async function regenerateSocialPlanDayAi(params: {
  userId: number;
  model: string;
  platform: SocialPlatform;
  topic: string;
  day: SocialPlanDay;
}) {
  const sys = `You are a Growth Planner assistant for ${params.platform}.
Return valid JSON for one idea card only. No markdown.`;

  const userPrompt = `Regenerate a single weekly plan idea for ${params.platform}.

Topic:
${params.topic}

Current idea (replace with a better one):
${JSON.stringify(params.day)}

Rules:
${platformRules(params.platform)}

Return JSON with:
{
  "contentIdea": "string",
  "hook": "string",
  "outline": ["string"],
  "bestPostingTime": "string",
  "rationale": "string",
  "tags": ["string"],
  "descriptionSuggestion": "string",
  "thumbnailConcept": "string",
  "soundSuggestion": "string | null"
}`;

  const completion = await openai.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1400,
  });

  await logTokenUsage({
    userId: params.userId,
    feature: "socialGrowthRegenerate",
    model: params.model,
    ...usageTokens(completion.usage),
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = parseAiJson(raw) as Partial<SocialPlanDay>;
  return {
    contentIdea: String(parsed.contentIdea ?? "").trim(),
    hook: String(parsed.hook ?? "").trim(),
    outline: Array.isArray(parsed.outline) ? parsed.outline.map((line) => String(line)).filter(Boolean).slice(0, 12) : [],
    bestPostingTime: String(parsed.bestPostingTime ?? "").trim() || "Time TBD",
    rationale: String(parsed.rationale ?? "").trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag)).filter(Boolean).slice(0, 18) : [],
    descriptionSuggestion: String(parsed.descriptionSuggestion ?? "").trim(),
    thumbnailConcept: String(parsed.thumbnailConcept ?? "").trim(),
    soundSuggestion: parsed.soundSuggestion == null ? null : String(parsed.soundSuggestion),
  } satisfies Partial<SocialPlanDay>;
}


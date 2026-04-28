import { openai } from "../lib/openai";
import { logTokenUsage, usageTokens } from "../lib/logTokens";
import type {
  GrowthTask,
  PlanPayload,
  SocialPlatform,
  SocialPostPerformanceFeedback,
  SocialPlanDay,
  SocialPostingMode,
  SocialWeekday,
} from "../models/socialGrowthPlan";

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

function weekdayShort(isoDate: string): SocialWeekday {
  const value = new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  if (value === "Mon" || value === "Tue" || value === "Wed" || value === "Thu" || value === "Fri" || value === "Sat") return value;
  return "Sun";
}

function datesForCadence(startDate: string, postsPerWeek: number, preferredWeekdays?: SocialWeekday[]) {
  const count = Math.max(1, Math.min(7, postsPerWeek));
  const dates = dateWindow(startDate);
  if (count === 7) return dates;

  const preferredNormalized = (preferredWeekdays ?? []).filter(Boolean);
  if (preferredNormalized.length) {
    const preferred = new Set(preferredNormalized);
    const matches = dates.filter((date) => preferred.has(weekdayShort(date)));
    if (matches.length >= count) return matches.slice(0, count);
    const missing = count - matches.length;
    const fallback = dates.filter((date) => !preferred.has(weekdayShort(date))).slice(0, missing);
    return [...matches, ...fallback];
  }

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

function socialGrowthSystemPrompt() {
  return `You are DayTabs, an expert content growth strategist and execution planner.

Your job is to create weekly content plans that are specific, practical, and platform-native.

Do not generate generic ideas.
Do not only provide topics.
For every idea, provide enough detail so the user can create the content immediately.

You must consider:
- selected platform
- weekly topic
- user goal
- target audience
- tone
- posting frequency or AI-optimized posting mode
- platform-native formats
- viral content patterns
- previous week feedback when available

Growth tasks must be ethical, practical, and related to the selected platform.
Never suggest spam, fake engagement, bots, buying followers, or mass copy-paste commenting.

Return valid JSON only.
Do not include markdown.
Do not include explanations outside JSON.`;
}

function platformPrompt(platform: SocialPlatform) {
  if (platform === "linkedin") {
    return [
      "LinkedIn content should feel useful, credible, and human.",
      "Prioritize professional storytelling, founder journey, lessons learned, practical frameworks, educational posts, and opinion posts.",
      "The first 2 lines must be strong because they decide whether people click see more.",
      "Avoid generic motivational writing and over-polished corporate language.",
      "If the goal is product signups, make the post valuable first and promotional second.",
      "Use soft CTAs, questions, or conversation starters.",
      "Allowed contentType values: founder_story, lesson_learned, practical_framework, opinion, educational_post, carousel, build_in_public_update, case_study.",
    ].join("\n");
  }
  if (platform === "tiktok") {
    return [
      "TikTok content must be fast, visual, and easy to understand in the first 1 to 2 seconds.",
      "Prioritize hooks, visual action, simple scripts, text overlays, and loopable endings.",
      "Every idea should be executable by one creator with a phone.",
      "Avoid long educational explanations unless broken into fast scenes.",
      "Allowed contentType values: talking_head_video, demo_video, before_after, mini_story, trend_adaptation, image_post, carousel, story, reply_to_comment.",
    ].join("\n");
  }
  return [
    "Instagram content must be visual, saveable, shareable, or personal.",
    "Use native formats: Reels, carousels, posts, and stories.",
    "Prioritize strong cover titles, visual clarity, captions, and engagement CTAs.",
    "If the idea is educational, make it saveable.",
    "If the idea is promotional, make it value-first.",
    "Allowed contentType values: reel, carousel, image_post, story, behind_the_scenes, educational_carousel, personal_story, product_demo.",
  ].join("\n");
}

function jsonShape() {
  return `{
  "summary": "string",
  "recommendedPostingStrategy": "string",
  "days": [
    {
      "id": "string",
      "day": number,
      "date": "YYYY-MM-DD",
      "contentIdea": "string",
      "contentType": "string",
      "hook": "string",
      "outline": ["string"],
      "postContext": "string",
      "postDraft": "string",
      "script": "string",
      "shotList": ["string"],
      "visualDirection": "string",
      "carouselSlides": [
        { "slide": number, "title": "string", "text": "string", "visual": "string" }
      ],
      "storySequence": [
        { "step": number, "type": "question|poll|photo|video|text|link", "content": "string", "visualDirection": "string" }
      ],
      "recordingSuggestions": ["string"],
      "textOverlays": ["string"],
      "bestPostingTime": "string",
      "rationale": "string",
      "tags": ["string"],
      "descriptionSuggestion": "string",
      "thumbnailConcept": "string",
      "caption": "string",
      "cta": "string",
      "growthTasks": [
        {
          "platform": "linkedin|tiktok|instagram",
          "taskType": "comment|connect|follow|reply|dm|research|save|engage_with_hashtag|join_conversation",
          "title": "string",
          "description": "string",
          "suggestedTiming": "string",
          "reason": "string",
          "targetProfileType": "string",
          "targetTopicOrHashtag": "string"
        }
      ],
      "soundSuggestion": "string | null",
      "status": "not_finished"
    }
  ]
}`;
}

export async function generateSocialWeeklyPlanAi(params: {
  userId: number;
  model: string;
  platform: SocialPlatform;
  startDate: string;
  endDate: string;
  topic: string;
  postsPerWeek: number;
  postingMode: SocialPostingMode;
  preferredWeekdays?: SocialWeekday[];
  audience?: string;
  goal?: string;
  tone?: string;
  formatPreference?: string;
  previousPlan?: PlanPayload | null;
  previousFeedback?: SocialPostPerformanceFeedback[] | null;
  skippedFeedback?: boolean;
}) {
  const scheduledDates = params.postingMode === "manual"
    ? datesForCadence(params.startDate, params.postsPerWeek, params.preferredWeekdays)
    : dateWindow(params.startDate);
  const sys = `${socialGrowthSystemPrompt()}

Platform rules:
${platformPrompt(params.platform)}
`;

  const userPrompt = `Generate a weekly content plan for ${params.platform}.

Platform:
${params.platform}

Date range:
${params.startDate} to ${params.endDate}

Posting mode:
${params.postingMode}

Posts per week:
${params.postingMode === "ai_optimized" ? "Choose a realistic number of posts for this week based on the platform and topic." : params.postsPerWeek}

Preferred weekdays:
${(params.preferredWeekdays ?? []).join(", ")}

Scheduled dates (these are the dates you may choose from):
${scheduledDates.join(", ")}

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
- Include growthTasks for each day, keep them ethical and non-spammy.
- Return valid JSON matching the shape.

JSON shape:
${jsonShape()}
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

  const withinWindow = (iso: string) => iso >= params.startDate && iso <= params.endDate;

  const normalizeGrowthTasks = (tasks: unknown): GrowthTask[] => {
    if (!Array.isArray(tasks)) return [];
    return tasks
      .map((task) => (task && typeof task === "object" ? task as Record<string, unknown> : null))
      .filter(Boolean)
      .map((task) => ({
        id: typeof task!.id === "string" ? task!.id : undefined,
        platform: params.platform,
        taskType: String(task!.taskType ?? "").trim() as GrowthTask["taskType"],
        title: String(task!.title ?? "").trim(),
        description: String(task!.description ?? "").trim(),
        suggestedTiming: String(task!.suggestedTiming ?? "").trim(),
        reason: String(task!.reason ?? "").trim(),
        relatedToIdea: typeof task!.relatedToIdea === "string" ? task!.relatedToIdea : undefined,
        targetProfileType: typeof task!.targetProfileType === "string" ? task!.targetProfileType : undefined,
        targetTopicOrHashtag: typeof task!.targetTopicOrHashtag === "string" ? task!.targetTopicOrHashtag : undefined,
        completed: Boolean(task!.completed),
      }))
      .filter((task) => task.title && task.description && task.suggestedTiming && task.reason)
      .slice(0, 10);
  };

  const normalizedDays: SocialPlanDay[] = days
    .slice(0, 7)
    .map((day, index) => ({
      id: typeof day.id === "string" && day.id.trim() ? day.id.trim() : `day-${index + 1}-${Math.random().toString(16).slice(2)}`,
      day: index + 1,
      date: isIsoDate(day.date) && withinWindow(day.date) ? day.date : scheduledDates[index % scheduledDates.length]!,
      contentIdea: String(day.contentIdea ?? "").trim(),
      contentType: typeof day.contentType === "string" ? day.contentType.trim() : undefined,
      hook: String(day.hook ?? "").trim(),
      outline: Array.isArray(day.outline) ? day.outline.map((line) => String(line)).filter(Boolean).slice(0, 12) : [],
      postContext: typeof day.postContext === "string" ? day.postContext.trim() : undefined,
      postDraft: typeof day.postDraft === "string" ? day.postDraft.trim() : undefined,
      script: typeof day.script === "string" ? day.script.trim() : undefined,
      shotList: Array.isArray(day.shotList) ? day.shotList.map((line) => String(line)).filter(Boolean).slice(0, 16) : undefined,
      visualDirection: typeof day.visualDirection === "string" ? day.visualDirection.trim() : undefined,
      carouselSlides: Array.isArray((day as any).carouselSlides)
        ? (day as any).carouselSlides
          .map((slide: unknown) => (slide && typeof slide === "object" ? (slide as Record<string, unknown>) : null))
          .filter(Boolean)
          .map((slide: Record<string, unknown>, slideIndex: number) => ({
            slide: Number(slide!.slide ?? slideIndex + 1) || slideIndex + 1,
            title: String(slide!.title ?? "").trim(),
            text: String(slide!.text ?? "").trim(),
            visual: String(slide!.visual ?? "").trim(),
          }))
          .filter((slide: { title: string; text: string; visual: string }) => slide.title || slide.text || slide.visual)
          .slice(0, 10)
        : undefined,
      storySequence: Array.isArray((day as any).storySequence)
        ? (day as any).storySequence
          .map((step: unknown) => (step && typeof step === "object" ? (step as Record<string, unknown>) : null))
          .filter(Boolean)
          .map((step: Record<string, unknown>, stepIndex: number) => ({
            step: Number(step!.step ?? stepIndex + 1) || stepIndex + 1,
            type: String(step!.type ?? "text") as any,
            content: String(step!.content ?? "").trim(),
            visualDirection: typeof step!.visualDirection === "string" ? step!.visualDirection.trim() : undefined,
          }))
          .filter((step: { content: string }) => step.content)
          .slice(0, 12)
        : undefined,
      recordingSuggestions: Array.isArray(day.recordingSuggestions) ? day.recordingSuggestions.map((line) => String(line)).filter(Boolean).slice(0, 10) : undefined,
      textOverlays: Array.isArray(day.textOverlays) ? day.textOverlays.map((line) => String(line)).filter(Boolean).slice(0, 10) : undefined,
      bestPostingTime: String(day.bestPostingTime ?? "").trim() || "Time TBD",
      rationale: String(day.rationale ?? "").trim(),
      tags: Array.isArray(day.tags) ? day.tags.map((tag) => String(tag)).filter(Boolean).slice(0, 18) : [],
      descriptionSuggestion: String(day.descriptionSuggestion ?? "").trim(),
      thumbnailConcept: String(day.thumbnailConcept ?? "").trim(),
      caption: typeof day.caption === "string" ? day.caption.trim() : undefined,
      cta: typeof day.cta === "string" ? day.cta.trim() : undefined,
      growthTasks: normalizeGrowthTasks((day as any).growthTasks),
      soundSuggestion: day.soundSuggestion == null ? null : String(day.soundSuggestion),
      status: "not_finished",
    }));

  const finalDays = (params.postingMode === "manual"
    ? normalizedDays.slice(0, Math.max(1, Math.min(7, params.postsPerWeek)))
      .map((d, index) => ({ ...d, date: scheduledDates[index % scheduledDates.length]! }))
    : normalizedDays
      .slice(0, Math.max(3, Math.min(7, normalizedDays.length || 0)) || 5)
      .map((d) => ({ ...d, date: isIsoDate(d.date) ? d.date : params.startDate }))
  ).slice(0, 7);

  const sortedDays = finalDays.slice().sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day).map((day, index) => ({ ...day, day: index + 1 }));

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const recommendedPostingStrategy = typeof parsed.recommendedPostingStrategy === "string" ? parsed.recommendedPostingStrategy : "";
  return { plan: { summary, recommendedPostingStrategy, days: sortedDays } satisfies PlanPayload, postsPerWeek: sortedDays.length };
}

export async function regenerateSocialPlanDayAi(params: {
  userId: number;
  model: string;
  platform: SocialPlatform;
  topic: string;
  day: SocialPlanDay;
  intent?: string;
}) {
  const sys = `You are a Growth Planner assistant for ${params.platform}.
Return valid JSON for one idea card only. No markdown.`;

  const userPrompt = `Regenerate a single weekly plan idea for ${params.platform}.

Topic:
${params.topic}

Current idea (replace with a better one):
${JSON.stringify(params.day)}

Rules:
${platformPrompt(params.platform)}

Improvement intent:
${params.intent ? params.intent : "Make it more actionable and execution-ready."}

Return JSON with:
{
  "contentIdea": "string",
  "contentType": "string",
  "hook": "string",
  "outline": ["string"],
  "postContext": "string",
  "postDraft": "string",
  "script": "string",
  "shotList": ["string"],
  "visualDirection": "string",
  "carouselSlides": [{ "slide": 1, "title": "string", "text": "string", "visual": "string" }],
  "storySequence": [{ "step": 1, "type": "text", "content": "string", "visualDirection": "string" }],
  "recordingSuggestions": ["string"],
  "textOverlays": ["string"],
  "bestPostingTime": "string",
  "rationale": "string",
  "tags": ["string"],
  "descriptionSuggestion": "string",
  "thumbnailConcept": "string",
  "caption": "string",
  "cta": "string",
  "growthTasks": [{ "platform": "${params.platform}", "taskType": "comment", "title": "string", "description": "string", "suggestedTiming": "string", "reason": "string", "targetProfileType": "string", "targetTopicOrHashtag": "string" }],
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
    contentType: typeof parsed.contentType === "string" ? parsed.contentType.trim() : undefined,
    hook: String(parsed.hook ?? "").trim(),
    outline: Array.isArray(parsed.outline) ? parsed.outline.map((line) => String(line)).filter(Boolean).slice(0, 12) : [],
    postContext: typeof parsed.postContext === "string" ? parsed.postContext.trim() : undefined,
    postDraft: typeof parsed.postDraft === "string" ? parsed.postDraft.trim() : undefined,
    script: typeof parsed.script === "string" ? parsed.script.trim() : undefined,
    shotList: Array.isArray(parsed.shotList) ? parsed.shotList.map((line) => String(line)).filter(Boolean).slice(0, 16) : undefined,
    visualDirection: typeof parsed.visualDirection === "string" ? parsed.visualDirection.trim() : undefined,
    carouselSlides: Array.isArray(parsed.carouselSlides) ? parsed.carouselSlides as any : undefined,
    storySequence: Array.isArray(parsed.storySequence) ? parsed.storySequence as any : undefined,
    recordingSuggestions: Array.isArray(parsed.recordingSuggestions) ? parsed.recordingSuggestions.map((line) => String(line)).filter(Boolean).slice(0, 10) : undefined,
    textOverlays: Array.isArray(parsed.textOverlays) ? parsed.textOverlays.map((line) => String(line)).filter(Boolean).slice(0, 10) : undefined,
    bestPostingTime: String(parsed.bestPostingTime ?? "").trim() || "Time TBD",
    rationale: String(parsed.rationale ?? "").trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag)).filter(Boolean).slice(0, 18) : [],
    descriptionSuggestion: String(parsed.descriptionSuggestion ?? "").trim(),
    thumbnailConcept: String(parsed.thumbnailConcept ?? "").trim(),
    caption: typeof parsed.caption === "string" ? parsed.caption.trim() : undefined,
    cta: typeof parsed.cta === "string" ? parsed.cta.trim() : undefined,
    growthTasks: Array.isArray((parsed as any).growthTasks) ? (parsed as any).growthTasks as any : undefined,
    soundSuggestion: parsed.soundSuggestion == null ? null : String(parsed.soundSuggestion),
  } satisfies Partial<SocialPlanDay>;
}

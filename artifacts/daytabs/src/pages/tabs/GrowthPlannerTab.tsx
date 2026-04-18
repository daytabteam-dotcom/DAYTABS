import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Columns3,
  FileUp,
  Globe2,
  Instagram,
  Linkedin,
  Loader2,
  Lock,
  Music2,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlan } from "@/hooks/use-plan";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft, PanelEyebrow } from "@/components/panel-system";

type PlatformId = "tiktok" | "instagram" | "youtube" | "linkedin" | "x";
type PlannerStep = "profile" | "platforms" | "cadence" | "links";
type ReviewScope = "all" | "today" | "overdue";
type ContentStage = "idea" | "recording" | "editing" | "published" | "draft";
type PlannerViewMode = "calendar" | "planner" | "trends" | "competitors";

interface BrandProfile {
  name: string;
  niche: string;
  audience: string;
  goals: string;
  attachments: string[];
}

interface PlatformConfig {
  selected: boolean;
  postsPerWeek: number;
  url: string;
}

interface PlannerState {
  profile: BrandProfile;
  platforms: Record<PlatformId, PlatformConfig>;
  weekNumber: number;
  calendar: CalendarItem[];
}

interface CalendarItem {
  id: string;
  platform: PlatformId;
  weekId?: number;
  day: string;
  date?: string;
  title: string;
  format: string;
  angle: string;
  thumbnail: string;
  song: string;
  status?: "posted" | "not-posted";
  result?: string;
  postUrl?: string;
  stage?: ContentStage;
  custom?: boolean;
}

interface CompetitorProfile {
  name: string;
  focus: string;
  url: string;
  avatar: string;
}

const STORAGE_KEY = "daytabs:growth-planner";

const CONTENT_STAGES: Array<{ id: ContentStage; label: string; helper: string }> = [
  { id: "idea", label: "Idea", helper: "Concepts ready to shape." },
  { id: "recording", label: "Recording", helper: "Scripts, footage, or assets in progress." },
  { id: "editing", label: "Editing", helper: "Cuts, captions, and polish." },
  { id: "published", label: "Published", helper: "Live posts with URLs attached." },
  { id: "draft", label: "Draft / Not doing", helper: "Rejected, paused, or saved for later." },
];

const PLATFORM_META: Record<PlatformId, { label: string; short: string; icon: React.ElementType; color: string }> = {
  tiktok: { label: "TikTok", short: "TT", icon: Music2, color: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  instagram: { label: "Instagram", short: "IG", icon: Instagram, color: "border-pink-400/30 bg-pink-400/10 text-pink-200" },
  youtube: { label: "YouTube", short: "YT", icon: Youtube, color: "border-red-400/30 bg-red-400/10 text-red-200" },
  linkedin: { label: "LinkedIn", short: "LI", icon: Linkedin, color: "border-sky-400/30 bg-sky-400/10 text-sky-200" },
  x: { label: "X", short: "X", icon: Globe2, color: "border-zinc-300/30 bg-zinc-300/10 text-zinc-100" },
};

const COMPETITORS: Record<string, CompetitorProfile[]> = {
  career: [
    {
      name: "Erin McGoff",
      focus: "Career advice and work-life content",
      url: "https://www.erinmcgoff.com/",
      avatar: "https://unavatar.io/instagram/advicewitherin",
    },
    {
      name: "Austin Belcak",
      focus: "Job search and LinkedIn strategy",
      url: "https://www.linkedin.com/in/abelcak",
      avatar: "https://unavatar.io/linkedin/abelcak",
    },
    {
      name: "Jeff Su",
      focus: "Professional productivity systems",
      url: "https://www.youtube.com/@JeffSu",
      avatar: "https://unavatar.io/youtube/@JeffSu",
    },
  ],
  creative: [
    {
      name: "Kelsey Rodriguez",
      focus: "Artist business and studio process",
      url: "https://www.kelseyrodriguez.com/about",
      avatar: "https://unavatar.io/youtube/@kelseyrodriguez",
    },
    {
      name: "Ten Hundred",
      focus: "Art process and product drops",
      url: "https://www.youtube.com/@TenHundred",
      avatar: "https://unavatar.io/youtube/@TenHundred",
    },
    {
      name: "Kel Lauren",
      focus: "Design critique and brand identity",
      url: "https://www.youtube.com/@KelLauren",
      avatar: "https://unavatar.io/youtube/@KelLauren",
    },
  ],
  business: [
    {
      name: "Alex Hormozi",
      focus: "Offers, sales, and business education",
      url: "https://www.youtube.com/@AlexHormozi",
      avatar: "https://unavatar.io/youtube/@AlexHormozi",
    },
    {
      name: "Lenny Rachitsky",
      focus: "Product, growth, and startup systems",
      url: "https://www.linkedin.com/in/lennyrachitsky",
      avatar: "https://unavatar.io/linkedin/lennyrachitsky",
    },
    {
      name: "Aprilynne Alter",
      focus: "Creator business and YouTube growth",
      url: "https://www.youtube.com/@AprilynneAlter",
      avatar: "https://unavatar.io/youtube/@AprilynneAlter",
    },
  ],
  lifestyle: [
    {
      name: "Ali Abdaal",
      focus: "Lifestyle productivity and learning",
      url: "https://www.youtube.com/@aliabdaal",
      avatar: "https://unavatar.io/youtube/@aliabdaal",
    },
    {
      name: "Natacha Oceane",
      focus: "Fitness storytelling and evidence-led content",
      url: "https://www.youtube.com/@natachaoceane",
      avatar: "https://unavatar.io/youtube/@natachaoceane",
    },
    {
      name: "Chris Heria",
      focus: "Fitness tutorials and transformation hooks",
      url: "https://www.youtube.com/@CHRISHERIA",
      avatar: "https://unavatar.io/youtube/@CHRISHERIA",
    },
  ],
  education: [
    {
      name: "Dan Koe",
      focus: "Creator education and digital writing",
      url: "https://www.youtube.com/@DanKoeTalks",
      avatar: "https://unavatar.io/youtube/@DanKoeTalks",
    },
    {
      name: "Thomas Frank",
      focus: "Learning systems and creator productivity",
      url: "https://www.youtube.com/@Thomasfrank",
      avatar: "https://unavatar.io/youtube/@Thomasfrank",
    },
    {
      name: "Justin Welsh",
      focus: "Solo business and LinkedIn content",
      url: "https://www.linkedin.com/in/justinwelsh",
      avatar: "https://unavatar.io/linkedin/justinwelsh",
    },
  ],
};


const defaultPlatforms: Record<PlatformId, PlatformConfig> = {
  tiktok: { selected: true, postsPerWeek: 5, url: "" },
  instagram: { selected: true, postsPerWeek: 4, url: "" },
  youtube: { selected: true, postsPerWeek: 2, url: "" },
  linkedin: { selected: false, postsPerWeek: 3, url: "" },
  x: { selected: false, postsPerWeek: 5, url: "" },
};

function loadState(): PlannerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlannerState) : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getGrowthPlannerNotificationCounts() {
  const state = loadState();
  const calendar = state?.calendar ?? [];
  return {
    today: calendar.filter((item) => getCalendarItemAttention(item) === "today").length,
    overdue: calendar.filter((item) => getCalendarItemAttention(item) === "overdue").length,
  };
}

export function getGrowthPlannerNotifications() {
  const state = loadState();
  const calendar = state?.calendar ?? [];
  return calendar
    .map((item) => {
      const attention = getCalendarItemAttention(item);
      if (attention !== "today" && attention !== "overdue") return null;
      const formatted = formatCalendarDay(item.date);
      return {
        id: item.id,
        type: attention,
        title: item.title,
        platform: PLATFORM_META[item.platform]?.label ?? item.platform,
        date: formatted.date ? `${formatted.day}, ${formatted.date}` : "Unscheduled",
        stage: CONTENT_STAGES.find((stage) => stage.id === item.stage)?.label ?? "Idea",
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function saveState(state: PlannerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("daytabs:growth-planner-updated"));
}

function classifyNiche(niche: string) {
  const value = niche.toLowerCase();
  if (/(career|job|resume|recruit|interview|professional)/.test(value)) return "career";
  if (/(art|artist|design|illustration|music|photo|creative)/.test(value)) return "creative";
  if (/(business|startup|saas|app|founder|software|agency)/.test(value)) return "business";
  if (/(fitness|food|beauty|travel|lifestyle|fashion)/.test(value)) return "lifestyle";
  return "education";
}

function recommendedPlatforms(profile: BrandProfile): Record<PlatformId, PlatformConfig> {
  const category = classifyNiche(`${profile.niche} ${profile.goals}`);
  const next = structuredClone(defaultPlatforms);
  if (category === "career") {
    next.linkedin = { selected: true, postsPerWeek: 4, url: "" };
    next.youtube = { selected: true, postsPerWeek: 2, url: "" };
    next.tiktok = { selected: true, postsPerWeek: 3, url: "" };
    next.instagram.selected = false;
  }
  if (category === "creative") {
    next.instagram = { selected: true, postsPerWeek: 5, url: "" };
    next.tiktok = { selected: true, postsPerWeek: 5, url: "" };
    next.youtube = { selected: true, postsPerWeek: 2, url: "" };
  }
  if (category === "business") {
    next.linkedin = { selected: true, postsPerWeek: 4, url: "" };
    next.x = { selected: true, postsPerWeek: 5, url: "" };
    next.youtube = { selected: true, postsPerWeek: 2, url: "" };
    next.tiktok.postsPerWeek = 3;
  }
  return next;
}

function trendLines(profile: BrandProfile) {
  const category = classifyNiche(`${profile.niche} ${profile.goals}`);
  const base = profile.niche || "your niche";
  const map = {
    career: [
      "Hiring-manager POV hooks, salary transparency, and portfolio teardown posts are pulling attention.",
      "Short proof-heavy stories beat generic advice: before, after, metric, lesson.",
      "Comment prompts around interviews and resume mistakes are strong conversion moments.",
    ],
    creative: [
      "Process reveals, material breakdowns, and unfinished-to-finished transformations are moving fastest.",
      "Creators are pairing tactile visuals with direct pricing and client-story captions.",
      "Carousel case studies and fast studio cuts are outperforming static portfolio posts.",
    ],
    business: [
      "Founder build logs, customer problem clips, and practical teardown threads are working well.",
      "Audiences are rewarding specific numbers, clear screenshots, and concise lessons.",
      "Competitor comparison angles are useful when they stay educational instead of combative.",
    ],
    lifestyle: [
      "Routine resets, personal rules, and low-friction recommendation formats are trending.",
      "Native-feeling short video with one useful takeaway is outperforming polished ads.",
      "Community prompts around tradeoffs, budgets, and taste are generating saves.",
    ],
    education: [
      "Myth-busting, templates, and step-by-step frameworks are still the most reliable formats.",
      "Audiences are sharing posts that make a hard topic feel immediately usable.",
      "Strong hooks now use a problem statement before credentials.",
    ],
  } as const;
  return [`For ${base}, the biggest opening is a repeatable proof series.`, ...map[category]];
}

function competitorProfiles(profile: BrandProfile, platform: PlatformId) {
  const category = classifyNiche(`${profile.niche} ${profile.goals}`);
  const profiles = COMPETITORS[category] ?? COMPETITORS.education;
  return platform === "linkedin" || platform === "x" ? profiles.slice().reverse() : profiles;
}

function platformSummary(profile: BrandProfile, platform: PlatformId, url: string) {
  const label = PLATFORM_META[platform].label;
  const hasUrl = url.trim().length > 0;
  const seed = profile.niche.length + platform.length + (hasUrl ? url.length : 7);
  const posts = hasUrl ? 20 + (seed % 180) : 0;
  const followers = hasUrl ? 300 + seed * 47 : 0;
  const engagement = hasUrl ? (2.4 + (seed % 28) / 10).toFixed(1) : "0.0";
  return {
    title: hasUrl ? `${label} profile review` : `${label} profile pending`,
    stats: [
      { label: "Posts reviewed", value: posts.toLocaleString() },
      { label: "Estimated followers", value: followers.toLocaleString() },
      { label: "Avg engagement", value: `${engagement}%` },
    ],
    worked: hasUrl
      ? "Clear niche proof, strong first-person lessons, and posts that name a specific audience are likely carrying the best results."
      : "Add the profile URL to compare real posting patterns, engagement signals, and audience fit.",
    missed: hasUrl
      ? "The biggest gap is probably inconsistent series packaging: more recurring formats would make wins easier to repeat."
      : "No live profile URL is connected yet, so the planner is using niche and goal signals only.",
  };
}

function getPlatformTrendScan(profile: BrandProfile, platform: PlatformId) {
  const category = classifyNiche(`${profile.niche} ${profile.goals}`);
  const audience = profile.audience || "your audience";
  const niche = profile.niche || "your niche";
  const platformFormats: Record<PlatformId, string[]> = {
    tiktok: ["talking-head stitch", "POV skit", "fast teardown", "screen-record lesson", "comment reply video", "before/after reveal", "green-screen reaction", "3-part list"],
    instagram: ["reel", "carousel", "story poll", "before/after reel", "caption-first reel", "creator diary", "template carousel", "collab post"],
    youtube: ["short", "8-minute breakdown", "thumbnail teardown", "community post", "reaction short", "tutorial", "case study", "trend recap"],
    linkedin: ["document carousel", "text post", "case-study post", "contrarian lesson", "framework graphic", "founder note", "poll", "before/after proof"],
    x: ["thread", "single insight", "visual teardown", "poll", "quote post", "build-in-public update", "checklist", "before/after post"],
  };
  const categoryAngles: Record<string, string[]> = {
    career: [
      "resume line rewrite",
      "interview answer that gets callbacks",
      "recruiter red flag",
      "salary negotiation script",
      "portfolio proof teardown",
      "LinkedIn headline before/after",
      "first 30 days in a new role",
      "job search mistake nobody notices",
    ],
    creative: [
      "unfinished-to-finished artwork reveal",
      "pricing breakdown",
      "client brief teardown",
      "studio workflow timelapse",
      "materials that changed the result",
      "style evolution story",
      "commission mistake lesson",
      "portfolio piece audit",
    ],
    business: [
      "customer problem teardown",
      "offer page before/after",
      "founder build log",
      "pricing lesson",
      "competitor positioning breakdown",
      "landing page roast",
      "metric-backed decision",
      "tool stack reveal",
    ],
    lifestyle: [
      "routine reset",
      "budget swap",
      "what I stopped doing",
      "weekly transformation",
      "mistake-to-rule story",
      "taste test",
      "habit stack",
      "realistic day breakdown",
    ],
    education: [
      "myth-busting lesson",
      "simple framework",
      "beginner mistake",
      "template walkthrough",
      "one-minute explainer",
      "case-study breakdown",
      "cheat sheet",
      "common question answer",
    ],
  };
  const reasons = [
    "It opens with a visible problem before asking for attention.",
    "It compresses a useful lesson into a repeatable format.",
    "It gives proof quickly, which makes the claim feel earned.",
    "It invites comments by making the audience compare their own situation.",
    "It uses a clear before/after structure that is easy to save.",
    "It feels native to the platform instead of overproduced.",
    "It turns a broad topic into one specific decision or mistake.",
    "It creates a series viewers can recognize and come back for.",
  ];
  const thumbnails: Record<string, string[]> = {
    career: [
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
    ],
    creative: [
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=900&q=80",
    ],
    business: [
      "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=900&q=80",
    ],
    lifestyle: [
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    ],
    education: [
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?auto=format&fit=crop&w=900&q=80",
    ],
  };
  const creators: Record<PlatformId, string[]> = {
    tiktok: ["@nichebreakdown", "@fastgrowthlab", "@creatorproof", "@trendteardown"],
    instagram: ["@reelstrategy", "@carousellab", "@creatorstudio", "@growthnotes"],
    youtube: ["Niche Lab", "Creator Breakdown", "Proof Channel", "Weekly Teardown"],
    linkedin: ["Growth Operator", "Niche Strategist", "Creator Analyst", "Proof Builder"],
    x: ["@growththread", "@nicheoperator", "@buildsignal", "@creatorangle"],
  };
  const formats = platformFormats[platform];
  const angles = categoryAngles[category] ?? categoryAngles.education;
  const categoryThumbnails = thumbnails[category] ?? thumbnails.education;
  const platformCreators = creators[platform];
  return angles.map((angle, index) => ({
    title: `${angle} for ${audience}`,
    format: formats[index % formats.length],
    creator: platformCreators[index % platformCreators.length],
    thumbnail: categoryThumbnails[index % categoryThumbnails.length],
    postType: platform === "youtube" ? "Video" : platform === "linkedin" || platform === "x" ? "Post" : "Short video",
    searchUrl: getPlatformSearchUrl(platform, `${niche} ${angle}`),
    signal: platform === "tiktok" || platform === "instagram"
      ? `${80 + index * 17}K+ views pattern`
      : platform === "youtube"
      ? `${12 + index * 6}K+ view topic cluster`
      : `${3 + index * 2}x normal engagement pattern`,
    why: `${reasons[index % reasons.length]} For ${niche}, adapt it with a concrete example and one measurable takeaway.`,
  }));
}

function getPlatformSearchUrl(platform: PlatformId, query: string) {
  const encoded = encodeURIComponent(query);
  if (platform === "tiktok") return `https://www.tiktok.com/search?q=${encoded}`;
  if (platform === "instagram") return `https://www.instagram.com/explore/search/keyword/?q=${encoded}`;
  if (platform === "youtube") return `https://www.youtube.com/results?search_query=${encoded}`;
  if (platform === "linkedin") return `https://www.linkedin.com/search/results/content/?keywords=${encoded}`;
  return `https://x.com/search?q=${encoded}&src=typed_query&f=live`;
}

function improveCustomIdeaWithContext({
  profile,
  platform,
  title,
  angle,
}: {
  profile: BrandProfile;
  platform: PlatformId;
  title: string;
  angle: string;
}) {
  const trend = getPlatformTrendScan(profile, platform)[0];
  const platformNotes: Record<PlatformId, string> = {
    tiktok: "Open in the first 2 seconds with a visible problem, then use quick cuts and a comment-bait ending.",
    instagram: "Make it saveable: strong first frame, clear text overlay, and a carousel/reel structure people can revisit.",
    youtube: "Package it with a retention promise, clear payoff, and a title/thumbnail contrast.",
    linkedin: "Lead with proof or a professional tension, then make the lesson useful enough for comments.",
    x: "Turn it into a sharp thesis with a short thread or a single visual that people can quote.",
  };
  const baseTitle = title.trim() || trend.title;
  const userAngle = angle.trim();
  return {
    title: `${baseTitle} (${PLATFORM_META[platform].label} version)`,
    angle: [
      userAngle ? `Original idea: ${userAngle}` : `Original idea: ${baseTitle}`,
      `Trend angle to borrow: ${trend.title}.`,
      `Why it fits ${profile.audience || "your audience"}: it gives them one concrete problem, one proof point, and one action they can take immediately.`,
      `Platform pattern: ${platformNotes[platform]}`,
      `Suggested structure: Hook with the pain point. Show the example or proof. Explain the mistake or shift. End with a save/comment CTA.`,
      `Visual direction: ${trend.format}; use a first-frame text overlay that names the exact outcome.`,
    ].join("\n\n"),
  };
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatCalendarDay(value?: string) {
  const date = fromIsoDate(value);
  if (!date) return { day: "Day", date: "" };
  return {
    day: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
    date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
  };
}

function getNextCalendarStartDate(previous: CalendarItem[] = []) {
  const dates = previous
    .map((item) => fromIsoDate(item.date))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return new Date();
  return addDays(dates[dates.length - 1], 1);
}

function buildCalendarDays(calendar: CalendarItem[]) {
  const dates = calendar
    .map((item) => fromIsoDate(item.date))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const start = dates[0] ?? new Date();
  return Array.from({ length: 7 }, (_, index) => toIsoDate(addDays(start, index)));
}

function resolveItemDate(item: CalendarItem, fallbackDate: string) {
  if (item.date && fromIsoDate(item.date)) return item.date;
  return fallbackDate;
}

function generateCalendar(profile: BrandProfile, platforms: Record<PlatformId, PlatformConfig>, weekNumber: number, previous: CalendarItem[] = []) {
  const category = classifyNiche(`${profile.niche} ${profile.goals}`);
  const hooks = {
    career: ["Fix this resume line", "The interview answer that lands", "Portfolio before and after", "One recruiter red flag"],
    creative: ["From sketch to final", "How this piece was priced", "Palette breakdown", "Mistakes hidden in the first draft"],
    business: ["Build log lesson", "Customer problem teardown", "Why this offer converts", "Tool stack breakdown"],
    lifestyle: ["Three-rule routine", "Budget-friendly swap", "What I would repeat", "One habit that changed the week"],
    education: ["Stop doing this", "A simple framework", "Beginner mistake teardown", "The fastest way to understand it"],
  } as const;
  const formats: Record<PlatformId, string[]> = {
    tiktok: ["30s talking head", "POV skit", "screen-record tutorial"],
    instagram: ["reel", "carousel", "story prompt"],
    youtube: ["short", "8-minute breakdown", "community post"],
    linkedin: ["text post", "document carousel", "case study"],
    x: ["thread", "single insight", "poll"],
  };
  const songs: Record<PlatformId, string[]> = {
    tiktok: ["use a rising creator-business sound", "low-volume sped-up pop instrumental", "trend sound under 10K uses"],
    instagram: ["soft viral reel audio", "upbeat editorial sound", "voiceover with light percussion"],
    youtube: ["no copyrighted music", "subtle lo-fi bed", "voice-first edit"],
    linkedin: ["no music", "native silent captions", "presentation clip audio"],
    x: ["no music", "native clip audio", "silent visual"],
  };
  const existingAngles = new Set(previous.filter((item) => item.status === "posted").map((item) => item.angle));
  const selected = (Object.keys(platforms) as PlatformId[]).filter((id) => platforms[id].selected);
  const startDate = getNextCalendarStartDate(previous);
  const generated = selected.flatMap((platform) => {
    const count = Math.max(1, Math.min(7, platforms[platform].postsPerWeek));
    return Array.from({ length: count }, (_, index) => {
      const hookPool = hooks[category];
      const hook = hookPool[(index + weekNumber + platform.length) % hookPool.length];
      const dayOffset = Math.floor((index * 7) / count);
      const scheduledDate = addDays(startDate, dayOffset);
      const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(scheduledDate);
      const angle = existingAngles.has(hook)
        ? `${hook}: updated with last week's result`
        : hook;
      return {
        id: crypto.randomUUID(),
        platform,
        weekId: weekNumber,
        day,
        date: toIsoDate(scheduledDate),
        title: `${hook} for ${profile.audience || "your audience"}`,
        format: formats[platform][index % formats[platform].length],
        angle,
        thumbnail: `Open with a clear ${category} outcome, then show the proof in the first frame.`,
        song: songs[platform][index % songs[platform].length],
        stage: "idea",
      } satisfies CalendarItem;
    });
  });
  const primaryPlatform = selected[0] ?? "instagram";
  const coveredDates = new Set(generated.map((item) => item.date));
  const workdayFillers = Array.from({ length: 7 }, (_, index) => addDays(startDate, index))
    .filter((date) => {
      const day = date.getDay();
      return day >= 1 && day <= 5 && !coveredDates.has(toIsoDate(date));
    })
    .map((date, index) => {
      const hookPool = hooks[category];
      const hook = hookPool[(index + weekNumber) % hookPool.length];
      return {
        id: crypto.randomUUID(),
        platform: primaryPlatform,
        weekId: weekNumber,
        day: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
        date: toIsoDate(date),
        title: `${hook} for ${profile.audience || "your audience"}`,
        format: formats[primaryPlatform][index % formats[primaryPlatform].length],
        angle: `Workday filler: ${hook}`,
        thumbnail: `Use one strong proof point for ${profile.niche || "this niche"} in the first frame.`,
        song: songs[primaryPlatform][index % songs[primaryPlatform].length],
        stage: "idea",
      } satisfies CalendarItem;
    });
  return [...generated, ...workdayFillers];
}

function getCalendarItemAttention(item: CalendarItem) {
  if (item.status === "posted") return "posted";
  if (item.status === "not-posted" || item.stage === "draft") return "skipped";
  const scheduledDate = fromIsoDate(item.date);
  if (!scheduledDate) return "upcoming";
  const today = fromIsoDate(toIsoDate(new Date()))!;
  if (scheduledDate.getTime() === today.getTime()) return "today";
  if (scheduledDate.getTime() < today.getTime()) return "overdue";
  return "upcoming";
}

function getCalendarCardClass(attention: string) {
  if (attention === "posted") return "border-emerald-400/35 bg-emerald-400/10 hover:border-emerald-300/60";
  if (attention === "today" || attention === "overdue") return "border-amber-400/45 bg-amber-400/10 hover:border-amber-300/70";
  if (attention === "skipped") return "border-white/10 bg-white/[0.035] opacity-65";
  return "border-white/10 bg-background/60 hover:border-primary/35";
}

function resolveContentStage(item: CalendarItem): ContentStage {
  if (item.stage) return item.stage;
  if (item.status === "posted") return "published";
  if (item.status === "not-posted") return "draft";
  return "idea";
}

function onboardingPercent(step: PlannerStep) {
  return { profile: 25, platforms: 50, cadence: 75, links: 100 }[step];
}

function getWorkspaceTitle(viewMode: PlannerViewMode, selectedWeekId: number, visibleWeek: number | "all") {
  if (viewMode === "calendar") return `${visibleWeek === "all" ? "All history" : `Week ${selectedWeekId}`} calendar`;
  if (viewMode === "planner") return `${visibleWeek === "all" ? "All history" : `Week ${selectedWeekId}`} planner`;
  if (viewMode === "trends") return "Trends and platform analysis";
  return "Recommended competitors";
}

function getWorkspaceDescription(viewMode: PlannerViewMode) {
  if (viewMode === "calendar") return "Cards are grouped by day. Drag unpublished ideas between dates or click a card for details.";
  if (viewMode === "planner") return "Drag cards through production stages. Drop on Published to attach the post URL.";
  if (viewMode === "trends") return "Review platform patterns, trend examples, and profile signals for the selected platform.";
  return "Review niche competitors by platform without crowding the calendar.";
}

function getWorkspaceIcon(viewMode: PlannerViewMode) {
  if (viewMode === "calendar") return CalendarDays;
  if (viewMode === "planner") return Columns3;
  if (viewMode === "trends") return BarChart3;
  return Target;
}

function GrowthPlannerComingSoon() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const features = [
    { label: "Weekly content calendar tailored to your niche" },
    { label: "Platform-by-platform cadence and post mix" },
    { label: "Competitor inspiration and trend prompts" },
    { label: "Next-week refresh from posted results" },
  ];

  const handleNotify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("daytabs_token");
      const res = await fetch("/api/growth-planner/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Failed to submit");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelPage className="max-w-4xl py-8">
      <PanelCard className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center gap-3">
              <div className="panel-card-soft relative flex h-11 w-11 items-center justify-center">
                <CalendarDays className="w-5 h-5 text-pink-300" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-300 text-amber-950 flex items-center justify-center">
                  <Clock className="w-3 h-3" />
                </span>
              </div>
              <div>
                <PanelEyebrow>Coming soon</PanelEyebrow>
                <PanelTitle>Growth Planner</PanelTitle>
              </div>
            </div>
            <PanelSubtitle className="mt-0">
              Build a niche-aware content system with weekly calendars, platform mix, competitor ideas, and next-step planning from your results.
            </PanelSubtitle>
            <div className="grid sm:grid-cols-2 gap-3">
              {features.map((feature) => (
                <PanelCardSoft key={feature.label} className="flex items-center gap-3 p-3 text-sm text-white/60">
                  <Check className="w-4 h-4 text-pink-300 shrink-0" />
                  {feature.label}
                </PanelCardSoft>
              ))}
            </div>
          </div>

          <div className="w-full md:w-[320px]">
            {submitted ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-sm font-medium">
                <Check className="w-4 h-4" />
                We'll notify you when Growth Planner launches.
              </div>
            ) : (
              <form onSubmit={handleNotify} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                  className="panel-input w-full px-4 py-3 disabled:opacity-50"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full border-pink-400/35 bg-pink-500 text-white hover:bg-pink-400">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                  {loading ? "Submitting..." : "Notify me"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </PanelCard>
    </PanelPage>
  );
}

export default function GrowthPlannerTab() {
  const { plan } = usePlan();
  const saved = useMemo(loadState, []);
  const [profile, setProfile] = useState<BrandProfile>(saved?.profile ?? { name: "", niche: "", audience: "", goals: "", attachments: [] });
  const [platforms, setPlatforms] = useState<Record<PlatformId, PlatformConfig>>(saved?.platforms ?? defaultPlatforms);
  const [calendar, setCalendar] = useState<CalendarItem[]>(saved?.calendar ?? []);
  const [weekNumber, setWeekNumber] = useState(saved?.weekNumber ?? 1);
  const [step, setStep] = useState<PlannerStep>(saved ? "links" : "profile");
  const [setupOpen, setSetupOpen] = useState(!saved && plan.isStudio);
  const [filter, setFilter] = useState<PlatformId | "all">("all");
  const [activePlatform, setActivePlatform] = useState<PlatformId>("tiktok");
  const [selectedCard, setSelectedCard] = useState<CalendarItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [reviewScope, setReviewScope] = useState<ReviewScope>("all");
  const [customIdea, setCustomIdea] = useState({ platform: "tiktok" as PlatformId, date: toIsoDate(new Date()), title: "", angle: "" });
  const [visibleWeek, setVisibleWeek] = useState<number | "all">(saved?.weekNumber ?? 1);
  const [viewMode, setViewMode] = useState<PlannerViewMode>("calendar");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [competitorPlatform, setCompetitorPlatform] = useState<PlatformId>("tiktok");
  const isAllowed = plan.isStudio;

  const selectedPlatforms = (Object.keys(platforms) as PlatformId[]).filter((id) => platforms[id].selected);
  const activeCompetitorPlatform = selectedPlatforms.includes(competitorPlatform) ? competitorPlatform : selectedPlatforms[0] ?? "tiktok";
  const trends = trendLines(profile);
  const weekIds = Array.from(new Set(calendar.map((item) => item.weekId ?? 1))).sort((a, b) => a - b);
  const latestWeekId = weekIds[weekIds.length - 1] ?? 1;
  const currentWeekId = weekIds.includes(weekNumber) ? weekNumber : latestWeekId;
  const selectedWeekId = visibleWeek === "all"
    ? latestWeekId
    : weekIds.includes(visibleWeek)
    ? visibleWeek
    : latestWeekId;
  const currentWeekItems = calendar.filter((item) => (item.weekId ?? 1) === currentWeekId);
  const weekScopedCalendar = visibleWeek === "all" ? calendar : calendar.filter((item) => (item.weekId ?? 1) === selectedWeekId);
  const visibleCalendar = weekScopedCalendar.filter((item) => filter === "all" || item.platform === filter);
  const incompleteResults = currentWeekItems.filter((item) => !item.status || (item.status === "posted" && !item.postUrl?.trim()));
  const calendarDays = buildCalendarDays(weekScopedCalendar);
  const fallbackCalendarDate = calendarDays[0] ?? toIsoDate(new Date());
  const dueTodayItems = currentWeekItems.filter((item) => getCalendarItemAttention(item) === "today");
  const overdueItems = currentWeekItems.filter((item) => getCalendarItemAttention(item) === "overdue");
  const reviewItems = reviewScope === "today"
    ? dueTodayItems
    : reviewScope === "overdue"
    ? overdueItems
    : currentWeekItems;
  const reviewIncompleteResults = reviewItems.filter((item) => !item.status || (item.status === "posted" && !item.postUrl?.trim()));
  const WorkspaceIcon = getWorkspaceIcon(viewMode);

  useEffect(() => {
    function handleFocusCard(event: Event) {
      const cardId = (event as CustomEvent<{ cardId?: string }>).detail?.cardId;
      if (!cardId) return;
      const item = calendar.find((entry) => entry.id === cardId);
      if (item?.weekId) setVisibleWeek(item.weekId);
      setViewMode("calendar");
      setHighlightedCardId(cardId);
      window.setTimeout(() => {
        document.getElementById(`growth-card-${cardId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 80);
      window.setTimeout(() => setHighlightedCardId((current) => current === cardId ? null : current), 2600);
    }

    window.addEventListener("daytabs:growth-planner-focus-card", handleFocusCard);
    return () => window.removeEventListener("daytabs:growth-planner-focus-card", handleFocusCard);
  }, [calendar]);

  function persist(nextCalendar = calendar, nextWeek = weekNumber) {
    saveState({ profile, platforms, calendar: nextCalendar, weekNumber: nextWeek });
  }

  function applyRecommendations() {
    setPlatforms((prev) => {
      const recs = recommendedPlatforms(profile);
      return (Object.keys(recs) as PlatformId[]).reduce((acc, id) => {
        acc[id] = { ...recs[id], url: prev[id]?.url ?? "" };
        return acc;
      }, {} as Record<PlatformId, PlatformConfig>);
    });
  }

  function completeSetup() {
    const next = calendar.length ? calendar : generateCalendar(profile, platforms, 1, []);
    setCalendar(next);
    setWeekNumber(1);
    saveState({ profile, platforms, calendar: next, weekNumber: 1 });
    setVisibleWeek(1);
    setActivePlatform(selectedPlatforms[0] ?? "tiktok");
    setSetupOpen(false);
  }

  function nextStep() {
    if (step === "profile") {
      applyRecommendations();
      setStep("platforms");
      return;
    }
    if (step === "platforms") setStep("cadence");
    if (step === "cadence") setStep("links");
    if (step === "links") completeSetup();
  }

  function previousStep() {
    if (step === "platforms") setStep("profile");
    if (step === "cadence") setStep("platforms");
    if (step === "links") setStep("cadence");
  }

  function updatePlatform(id: PlatformId, patch: Partial<PlatformConfig>) {
    setPlatforms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function addCustomIdea() {
    if (!customIdea.title.trim()) return;
    const formattedDay = formatCalendarDay(customIdea.date);
    const customCard: CalendarItem = {
      id: crypto.randomUUID(),
      platform: customIdea.platform,
      day: formattedDay.day,
      date: customIdea.date,
        weekId: visibleWeek === "all" ? currentWeekId : selectedWeekId,
      title: customIdea.title,
      format: "custom post",
      angle: customIdea.angle || "User-added idea",
      thumbnail: "Use the strongest personal proof or visual asset available.",
      song: customIdea.platform === "tiktok" || customIdea.platform === "instagram" ? "pick a current native trend sound" : "no music",
      stage: "idea",
      custom: true,
    };
    const next = [...calendar, customCard];
    setCalendar(next);
    persist(next);
    setCustomIdea({ platform: "tiktok", date: toIsoDate(new Date()), title: "", angle: "" });
    setCustomOpen(false);
  }

  function improveCustomIdea() {
    const improved = improveCustomIdeaWithContext({
      profile,
      platform: customIdea.platform,
      title: customIdea.title,
      angle: customIdea.angle,
    });
    setCustomIdea((prev) => ({ ...prev, ...improved }));
  }

  function updateCalendarItem(id: string, patch: Partial<CalendarItem>) {
    const next = calendar.map((item) => item.id === id ? { ...item, ...patch } : item);
    setCalendar(next);
    persist(next);
  }

  function updateResult(id: string, patch: Partial<Pick<CalendarItem, "status" | "result" | "postUrl" | "stage">>) {
    updateCalendarItem(id, patch);
  }

  function rescheduleItem(id: string, date: string) {
    const formatted = formatCalendarDay(date);
    updateCalendarItem(id, { date, day: formatted.day });
  }

  function moveStage(item: CalendarItem, stage: ContentStage) {
    if (item.stage === "published") return;
    if (stage === "published") {
      setSelectedCard(item);
      return;
    }
    updateCalendarItem(item.id, { stage });
  }

  function generateNextWeek() {
    if (incompleteResults.length > 0) return;
    const nextWeek = latestWeekId + 1;
    const nextCalendar = generateCalendar(profile, platforms, nextWeek, calendar);
    setWeekNumber(nextWeek);
    const combinedCalendar = [...calendar, ...nextCalendar];
    setCalendar(combinedCalendar);
    setVisibleWeek(nextWeek);
    saveState({ profile, platforms, calendar: combinedCalendar, weekNumber: nextWeek });
    setFeedbackOpen(false);
  }

  function openReview(scope: ReviewScope) {
    setReviewScope(scope);
    setFeedbackOpen(true);
  }

  function handleStageDrop(event: React.DragEvent<HTMLDivElement>, stage: ContentStage) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("application/daytabs-card-id") || event.dataTransfer.getData("text/plain");
    const item = calendar.find((entry) => entry.id === itemId);
    if (!item) return;
    moveStage(item, stage);
  }

  function handleCalendarDateDrop(event: React.DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("application/daytabs-card-id") || event.dataTransfer.getData("text/plain");
    const item = calendar.find((entry) => entry.id === itemId);
    if (!item || item.status === "posted" || item.stage === "published") return;
    rescheduleItem(itemId, date);
  }

  function setDragPayload(event: React.DragEvent<HTMLElement>, itemId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/daytabs-card-id", itemId);
    event.dataTransfer.setData("text/plain", itemId);
  }

  if (!isAllowed) {
    return <GrowthPlannerComingSoon />;
  }

  return (
    <PanelPage className="max-w-7xl space-y-8">
      <PanelHeader className="gap-5 justify-between lg:items-end">
        <div>
          <Badge className="bg-pink-500/15 text-pink-200 border-pink-500/20 hover:brightness-100">Studio Growth Planner</Badge>
          <PanelTitle className="mt-4 text-4xl">Plan the next week from what is working now.</PanelTitle>
          <PanelSubtitle className="max-w-3xl">
            Profile setup, platform recommendations, competitor angles, social audits, and a weekly calendar that improves after each round of results.
          </PanelSubtitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-lg" onClick={() => setSetupOpen(true)}>Edit setup</Button>
          <Button className="rounded-lg bg-primary text-primary-foreground" onClick={() => openReview("all")}>
            Generate next week
          </Button>
        </div>
      </PanelHeader>

      {calendar.length === 0 ? (
        <PanelCard className="p-8 text-center">
          <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl text-white">Start with your niche and goals.</h2>
          <p className="text-white/45 mt-2">DayTabs will suggest channels, cadence, competitor angles, and the first week of posts.</p>
          <Button className="mt-5 rounded-lg" onClick={() => setSetupOpen(true)}>Open setup</Button>
        </PanelCard>
      ) : (
        <>
          <PanelCard className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <WorkspaceIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-xl text-white">{getWorkspaceTitle(viewMode, selectedWeekId, visibleWeek)}</h2>
                </div>
                <p className="text-sm text-white/40 mt-1">{getWorkspaceDescription(viewMode)}</p>
              </div>
              <div className="flex items-center justify-end md:ml-auto shrink-0">
                <div className="panel-card-soft flex p-1">
                  {[
                    { id: "calendar" as PlannerViewMode, label: "Calendar", icon: CalendarDays },
                    { id: "planner" as PlannerViewMode, label: "Planner", icon: Columns3 },
                    { id: "trends" as PlannerViewMode, label: "Trends", icon: BarChart3 },
                    { id: "competitors" as PlannerViewMode, label: "Competitors", icon: Target },
                  ].map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setViewMode(view.id)}
                      className={`rounded-md px-3 py-2 ${viewMode === view.id ? "bg-primary/20 text-primary" : "text-white/45 hover:text-white"}`}
                      aria-label={`${view.label} view`}
                    >
                      <view.icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {(viewMode === "calendar" || viewMode === "planner") && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFilter("all")} className={`rounded-lg px-3 py-2 text-sm border ${filter === "all" ? "border-primary/40 text-primary bg-primary/15" : "border-white/10 text-white/45"}`}>All</button>
                  {selectedPlatforms.map((platform) => (
                    <button key={platform} onClick={() => setFilter(platform)} className={`rounded-lg px-3 py-2 text-sm border ${filter === platform ? "border-primary/40 text-primary bg-primary/15" : "border-white/10 text-white/45"}`} aria-label={PLATFORM_META[platform].label}>
                      {React.createElement(PLATFORM_META[platform].icon, { className: "w-4 h-4" })}
                    </button>
                  ))}
                </div>
                <Button variant="secondary" className="rounded-lg sm:ml-auto" onClick={() => setCustomOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add idea
                </Button>
              </div>
            )}
            {(viewMode === "calendar" || viewMode === "planner") && weekIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-xs uppercase tracking-wider text-white/35">Weeks</span>
                {weekIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => setVisibleWeek(id)}
                    className={`rounded-lg px-3 py-2 text-sm border ${visibleWeek !== "all" && selectedWeekId === id ? "border-primary/40 text-primary bg-primary/15" : "border-white/10 text-white/45 hover:text-white"}`}
                  >
                    Week {id}
                  </button>
                ))}
                <button
                  onClick={() => setVisibleWeek("all")}
                  className={`rounded-lg px-3 py-2 text-sm border ${visibleWeek === "all" ? "border-primary/40 text-primary bg-primary/15" : "border-white/10 text-white/45 hover:text-white"}`}
                >
                  All history
                </button>
              </div>
            )}
            {viewMode === "calendar" && (
              <>
            {(dueTodayItems.length > 0 || overdueItems.length > 0) && (
              <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      {dueTodayItems.length > 0
                        ? `${dueTodayItems.length} post${dueTodayItems.length === 1 ? "" : "s"} should go live today.`
                        : "No posts are due today."}
                    </p>
                    {overdueItems.length > 0 && (
                      <p className="text-xs text-amber-100/70 mt-1">
                        {overdueItems.length} earlier post{overdueItems.length === 1 ? "" : "s"} still need a posted URL or draft choice.
                      </p>
                    )}
                  </div>
                  <Button size="sm" className="rounded-lg bg-amber-300 text-amber-950 hover:bg-amber-200" onClick={() => openReview(dueTodayItems.length > 0 ? "today" : "overdue")}>
                    Review {dueTodayItems.length > 0 ? "today's posts" : "overdue posts"}
                  </Button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto pb-2">
            <div className="grid grid-cols-7 gap-3 min-w-[980px]">
              {calendarDays.map((date) => {
                const dayLabel = formatCalendarDay(date);
                const itemsForDate = visibleCalendar.filter((item) => resolveItemDate(item, fallbackCalendarDate) === date);
                return (
                <div
                  key={date}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => handleCalendarDateDrop(event, date)}
                  className="min-h-[220px] rounded-xl border border-white/8 bg-white/[0.025] p-3 min-w-0"
                >
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-wider text-white/35">{dayLabel.day}</p>
                    <p className="text-sm font-semibold text-white/75">{dayLabel.date}</p>
                  </div>
                  <div className="space-y-2">
                    {itemsForDate.map((item) => {
                      const attention = getCalendarItemAttention(item);
                      return (
                        <button
                          id={`growth-card-${item.id}`}
                          key={item.id}
                          draggable={item.status !== "posted" && item.stage !== "published"}
                          onDragStart={(event) => setDragPayload(event, item.id)}
                          onClick={() => setSelectedCard(item)}
                          className={`w-full min-w-0 text-left rounded-lg border p-3 transition-all overflow-hidden ${item.status !== "posted" && item.stage !== "published" ? "cursor-grab active:cursor-grabbing" : ""} ${highlightedCardId === item.id ? "ring-2 ring-amber-300 shadow-lg shadow-amber-300/20" : ""} ${getCalendarCardClass(attention)}`}
                        >
                          <div className="flex flex-wrap items-start gap-1.5 mb-2 min-w-0">
                            <PlatformBadge platform={item.platform} />
                            <div className="flex flex-wrap items-center gap-1 min-w-0">
                              {attention === "posted" && <Badge className="bg-emerald-400/15 text-emerald-100 border-emerald-400/20 hover:brightness-100">Posted</Badge>}
                              {attention === "today" && <Badge className="bg-amber-400/15 text-amber-100 border-amber-400/20 hover:brightness-100">Today</Badge>}
                              {attention === "overdue" && <Badge className="bg-amber-400/15 text-amber-100 border-amber-400/20 hover:brightness-100">Needs update</Badge>}
                              {attention === "skipped" && <Badge className="bg-white/10 text-white/45 border-white/10 hover:brightness-100">Draft</Badge>}
                              {item.custom && <Badge className="bg-amber-500/10 text-amber-200 border-amber-500/20 hover:brightness-100">Custom</Badge>}
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-white/85 leading-snug break-words">{item.title}</p>
                          <p className="text-xs text-white/35 mt-2 break-words">{item.format}</p>
                          {item.stage && (
                            <p className="text-[11px] uppercase tracking-wider text-white/30 mt-2">{CONTENT_STAGES.find((stage) => stage.id === item.stage)?.label}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
            </div>
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Ready for the next week?</p>
                <p className="text-xs text-white/45 mt-1">Add post results, move rejected ideas to draft, then generate a fresh calendar from what actually happened.</p>
              </div>
              <Button className="rounded-lg bg-primary text-primary-foreground" onClick={() => openReview("all")}>
                <RefreshCcw className="w-4 h-4 mr-2" /> Generate next week calendar
              </Button>
            </div>
              </>
            )}
            {viewMode === "trends" && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {selectedPlatforms.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setActivePlatform(platform)}
                      className={`rounded-lg px-3 py-2 text-sm border transition-all ${activePlatform === platform ? "bg-primary/20 border-primary/40 text-primary" : "border-white/10 text-white/45 hover:text-white"}`}
                    >
                      <span className="flex items-center gap-2">
                        {React.createElement(PLATFORM_META[platform].icon, { className: "w-4 h-4" })}
                        {PLATFORM_META[platform].label}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-white/35">Trend read</p>
                      <h3 className="text-lg text-white mt-1">What to pay attention to this week</h3>
                    </div>
                    <Badge className="bg-white/8 text-white/55 border-white/10 hover:brightness-100">Strategy summary</Badge>
                  </div>
                  <div className="divide-y divide-white/8">
                    {trends.map((trend, index) => {
                      const labels = ["Main opening", "Content pattern", "Engagement lever", "Risk to avoid"];
                      return (
                        <div key={trend} className="grid sm:grid-cols-[150px_1fr] gap-2 py-3 first:pt-0 last:pb-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-white/35">{labels[index] ?? `Signal ${index + 1}`}</p>
                          <p className="text-sm text-white/70 leading-relaxed">{trend}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <PlatformPanel profile={profile} platform={activePlatform} url={platforms[activePlatform]?.url ?? ""} />
              </div>
            )}
            {viewMode === "competitors" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {selectedPlatforms.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setCompetitorPlatform(platform)}
                      className={`rounded-lg px-3 py-2 text-sm border transition-all ${activeCompetitorPlatform === platform ? "bg-emerald-400/15 border-emerald-400/35 text-emerald-200" : "border-white/10 text-white/45 hover:text-white"}`}
                    >
                      <span className="flex items-center gap-2">
                        {React.createElement(PLATFORM_META[platform].icon, { className: "w-4 h-4" })}
                        {PLATFORM_META[platform].label}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <PlatformBadge platform={activeCompetitorPlatform} />
                  <div className="grid sm:grid-cols-3 gap-2 mt-3">
                    {competitorProfiles(profile, activeCompetitorPlatform).map((competitor) => (
                      <a
                        key={`${activeCompetitorPlatform}-${competitor.name}`}
                        href={competitor.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-white/8 bg-background/55 p-3 hover:border-primary/35 hover:bg-primary/5 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={competitor.avatar}
                            alt={competitor.name}
                            className="w-9 h-9 rounded-lg object-cover border border-white/10 bg-white/10"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white/85 truncate">{competitor.name}</p>
                            <p className="text-[11px] text-white/35 leading-tight">{competitor.focus}</p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </PanelCard>

          {viewMode === "planner" && (
          <PanelCard className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl text-white">Planner board</h2>
                <p className="text-sm text-white/40 mt-1">Move cards from idea to recording to editing. Published cards need a post URL and then lock in place.</p>
              </div>
            </div>
            <div className="grid md:grid-cols-5 gap-3">
              {CONTENT_STAGES.map((stage) => {
                const items = weekScopedCalendar.filter((item) => resolveContentStage(item) === stage.id);
                return (
                  <div
                    key={stage.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => handleStageDrop(event, stage.id)}
                    className="rounded-xl border border-white/8 bg-white/[0.025] p-3 min-w-0"
                  >
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-white">{stage.label}</p>
                      <p className="text-xs text-white/35">{stage.helper}</p>
                    </div>
                    <div className="space-y-2">
                      {items.length === 0 && <p className="text-xs text-white/30 rounded-lg border border-white/8 p-3">No cards here yet.</p>}
                      {items.map((item) => (
                        <div
                          key={item.id}
                          draggable={item.stage !== "published" && item.status !== "posted"}
                          onDragStart={(event) => setDragPayload(event, item.id)}
                          className={`rounded-lg border p-3 min-w-0 ${
                            resolveContentStage(item) === "published"
                              ? "border-emerald-400/25 bg-emerald-400/10"
                              : resolveContentStage(item) === "draft"
                              ? "border-white/10 bg-white/[0.03] opacity-70 cursor-grab active:cursor-grabbing"
                              : "border-white/10 bg-background/60 cursor-grab active:cursor-grabbing"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <PlatformBadge platform={item.platform} />
                            {item.date && <span className="text-[11px] text-white/35">{formatCalendarDay(item.date).date}</span>}
                          </div>
                          <p className="text-sm font-semibold text-white/85 break-words">{item.title}</p>
                          {item.postUrl && (
                            <a href={item.postUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all mt-2 block">
                              {item.postUrl}
                            </a>
                          )}
                          {resolveContentStage(item) !== "published" && (
                            <div className="grid gap-2 mt-3">
                              <p className="text-[11px] text-white/35">Drag to move status</p>
                              <DatePickerButton
                                value={item.date}
                                onChange={(date) => rescheduleItem(item.id, date)}
                              />
                              {resolveContentStage(item) !== "draft" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="rounded-lg"
                                  onClick={() => updateResult(item.id, { status: "not-posted", result: "Moved to draft.", postUrl: "", stage: "draft" })}
                                >
                                  Move to draft
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>
          )}
        </>
      )}

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-3xl rounded-2xl border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Growth Planner setup</DialogTitle>
            <DialogDescription>Share your niche once, then adjust the AI-filled platform and posting plan.</DialogDescription>
          </DialogHeader>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${onboardingPercent(step)}%` }} />
          </div>
          {step === "profile" && (
            <div className="grid gap-4">
              <Input placeholder="What should we call this brand or creator?" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              <Input placeholder="What is your content about?" value={profile.niche} onChange={(e) => setProfile({ ...profile, niche: e.target.value })} />
              <Input placeholder="Who are you trying to reach?" value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} />
              <Textarea placeholder="What do you want this content system to achieve?" value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} />
              <label className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 cursor-pointer">
                <div className="flex items-center gap-3 text-white/65">
                  <FileUp className="w-5 h-5" />
                  <span className="text-sm">Attach resumes, artwork, logos, screenshots, or brand notes</span>
                </div>
                <input
                  className="hidden"
                  type="file"
                  multiple
                  onChange={(e) => setProfile({ ...profile, attachments: Array.from(e.target.files ?? []).map((file) => file.name) })}
                />
              </label>
              {profile.attachments.length > 0 && <p className="text-xs text-white/40">{profile.attachments.join(", ")}</p>}
            </div>
          )}
          {step === "platforms" && (
            <div className="grid sm:grid-cols-2 gap-3">
              {(Object.keys(platforms) as PlatformId[]).map((platform) => (
                <PlatformSelectCard key={platform} platform={platform} config={platforms[platform]} onChange={(patch) => updatePlatform(platform, patch)} />
              ))}
            </div>
          )}
          {step === "cadence" && (
            <div className="space-y-3">
              {selectedPlatforms.map((platform) => (
                <div key={platform} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <PlatformBadge platform={platform} />
                    <div className="flex items-center gap-2">
                      <Input className="w-20" type="number" min={1} max={7} value={platforms[platform].postsPerWeek} onChange={(e) => updatePlatform(platform, { postsPerWeek: Number(e.target.value) })} />
                      <span className="text-sm font-semibold text-white/55">/ week</span>
                    </div>
                  </div>
                  <p className="text-xs text-white/35 mt-2">Suggested from niche cadence and viral creator patterns. You can change it.</p>
                </div>
              ))}
            </div>
          )}
          {step === "links" && (
            <div className="space-y-3">
              {selectedPlatforms.map((platform) => (
                <div key={platform} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <PlatformBadge platform={platform} />
                  <Input className="mt-3" placeholder={`Paste your ${PLATFORM_META[platform].label} profile URL`} value={platforms[platform].url} onChange={(e) => updatePlatform(platform, { url: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between gap-3 pt-2">
            <Button variant="secondary" className="rounded-lg" onClick={previousStep} disabled={step === "profile"}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button className="rounded-lg" onClick={nextStep} disabled={step === "profile" && !profile.niche.trim()}>
              {step === "links" ? "Build planner" : "Continue"} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-2xl rounded-2xl border-white/10 bg-card">
          {selectedCard && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedCard.title}</DialogTitle>
                <DialogDescription>{PLATFORM_META[selectedCard.platform].label} · {selectedCard.day} · {selectedCard.format}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Brief label="Content angle" value={selectedCard.angle} />
                <Brief label="Thumbnail or footage idea" value={selectedCard.thumbnail} />
                <Brief label="Song or audio idea" value={selectedCard.song} />
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35 mb-2">Result after posting</p>
                  <p className="text-sm text-white/50 mb-3">
                    If this went live, paste the post URL. DayTabs will use that link to analyze impressions, likes, comments, saves, reach, and what worked before building the next week.
                  </p>
                  <Input
                    placeholder="https://..."
                    value={selectedCard.postUrl ?? ""}
                    onChange={(e) => setSelectedCard({ ...selectedCard, postUrl: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" className="rounded-lg" disabled={!selectedCard.postUrl?.trim()} onClick={() => { updateResult(selectedCard.id, { status: "posted", postUrl: selectedCard.postUrl, result: "Posted. Analyze post URL for performance.", stage: "published" }); setSelectedCard(null); }}>
                      <Check className="w-4 h-4 mr-1" /> Posted
                    </Button>
                    <Button size="sm" variant="secondary" className="rounded-lg" onClick={() => { updateResult(selectedCard.id, { status: "not-posted", result: "Moved to draft.", postUrl: "", stage: "draft" }); setSelectedCard(null); }}>
                      Move to draft
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Add your own idea</DialogTitle>
            <DialogDescription>It will be included when next week is generated from results.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={customIdea.platform} onChange={(e) => setCustomIdea({ ...customIdea, platform: e.target.value as PlatformId })}>
                {selectedPlatforms.map((platform) => <option key={platform} value={platform}>{PLATFORM_META[platform].label}</option>)}
              </select>
              <DatePickerButton value={customIdea.date} onChange={(date) => setCustomIdea({ ...customIdea, date })} />
            </div>
            <Input placeholder="Content title" value={customIdea.title} onChange={(e) => setCustomIdea({ ...customIdea, title: e.target.value })} />
            <Textarea placeholder="Angle, visual, or note" value={customIdea.angle} onChange={(e) => setCustomIdea({ ...customIdea, angle: e.target.value })} />
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="secondary" className="rounded-lg flex-1" onClick={improveCustomIdea} disabled={!customIdea.title.trim() && !customIdea.angle.trim()}>
                <Sparkles className="w-4 h-4 mr-2" /> Improve with AI
              </Button>
              <Button className="rounded-lg flex-1" onClick={addCustomIdea}>Add to calendar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-3xl rounded-2xl border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>
              {reviewScope === "today" ? "Today's posts" : reviewScope === "overdue" ? "Overdue posts" : "Generate next week"}
            </DialogTitle>
            <DialogDescription>
              {reviewScope === "all"
                ? "Choose posted or move each rejected idea to draft. If it was posted, paste the post URL so AI can analyze public performance signals and use what worked for the next calendar."
                : "Choose posted or move to draft for these scheduled posts. If one went live, paste the post URL for AI analysis."}
            </DialogDescription>
          </DialogHeader>
          {reviewIncompleteResults.length > 0 && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
              {reviewIncompleteResults.length} post{reviewIncompleteResults.length === 1 ? "" : "s"} in this review still need a posted URL or draft choice.
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-2">
            {reviewItems.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
                Nothing needs review in this group.
              </div>
            )}
            {reviewItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <PlatformBadge platform={item.platform} />
                  {item.date && <span className="text-xs text-white/35">{formatCalendarDay(item.date).day}, {formatCalendarDay(item.date).date}</span>}
                  <p className="text-sm text-white/80">{item.title}</p>
                </div>
                <div className="grid gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      variant={item.status === "posted" ? "default" : "secondary"}
                      onClick={() => updateResult(item.id, { status: "posted", result: "Posted. Analyze post URL for performance." })}
                    >
                      Posted
                    </Button>
                    <Button
                      size="sm"
                      variant={item.stage === "draft" ? "default" : "secondary"}
                      className="rounded-lg"
                      onClick={() => updateResult(item.id, { status: "not-posted", result: "Moved to draft.", postUrl: "", stage: "draft" })}
                    >
                      Move to draft
                    </Button>
                  </div>
                  {item.status === "posted" && (
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-white/45">Post URL for AI analysis</span>
                      <Input
                        placeholder={`Paste the ${PLATFORM_META[item.platform].label} post URL`}
                        value={item.postUrl ?? ""}
                        onChange={(e) => updateResult(item.id, { status: "posted", postUrl: e.target.value, stage: e.target.value.trim() ? "published" : item.stage })}
                      />
                    </label>
                  )}
                  {item.stage === "draft" && (
                    <p className="text-xs text-white/35">This will move into Draft / Not doing and be excluded from posting reminders.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {reviewScope !== "all" && (
            <Button variant="secondary" className="rounded-lg" onClick={() => setReviewScope("all")}>
              Review all posts for next week
            </Button>
          )}
          <Button className="rounded-lg" onClick={generateNextWeek} disabled={incompleteResults.length > 0}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Create week {weekNumber + 1}
          </Button>
        </DialogContent>
      </Dialog>
    </PanelPage>
  );
}

function PlatformBadge({ platform }: { platform: PlatformId }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${meta.color}`}>
      <Icon className="w-3.5 h-3.5" /> {meta.label}
    </span>
  );
}

function DatePickerButton({ value, onChange }: { value?: string; onChange: (date: string) => void }) {
  const selected = fromIsoDate(value) ?? new Date();
  const label = formatCalendarDay(toIsoDate(selected));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 rounded-lg border border-white/10 bg-background px-2 text-left text-xs text-white/70 hover:bg-white/5"
        >
          {label.day}, {label.date}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          modifiers={{ todayUnselected: (date) => toIsoDate(date) === toIsoDate(new Date()) && toIsoDate(date) !== toIsoDate(selected) }}
          modifiersClassNames={{
            todayUnselected: "bg-white/10 text-white ring-1 ring-white/25",
          }}
          classNames={{
            selected: "bg-primary text-primary-foreground rounded-md",
            today: "text-primary",
          }}
          onSelect={(date) => {
            if (date) onChange(toIsoDate(date));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PlatformSelectCard({ platform, config, onChange }: { platform: PlatformId; config: PlatformConfig; onChange: (patch: Partial<PlatformConfig>) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange({ selected: !config.selected })}
      className={`text-left rounded-xl border p-4 transition-all ${config.selected ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.03]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <PlatformBadge platform={platform} />
        {config.selected && <Check className="w-4 h-4 text-primary" />}
      </div>
      <p className="text-xs text-white/40 mt-3">AI selected this when it fits your niche, audience, and weekly goal.</p>
    </button>
  );
}

function PlatformPanel({ profile, platform, url }: { profile: BrandProfile; platform: PlatformId; url: string }) {
  const summary = platformSummary(profile, platform, url);
  const trends = getPlatformTrendScan(profile, platform);
  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-4">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <PlatformBadge platform={platform} />
          <h3 className="text-lg text-white mt-4">{summary.title}</h3>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {summary.stats.map((stat) => (
              <div key={stat.label} className="rounded-lg bg-background/60 border border-white/8 p-3">
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/35">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Brief label="What is working" value={summary.worked} icon={TrendingUp} />
          <Brief label="What to improve" value={summary.missed} icon={Sparkles} />
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/35">This week trend scan</p>
            <h3 className="text-lg text-white mt-1">{PLATFORM_META[platform].label} viral content patterns</h3>
            <p className="text-sm text-white/45 mt-1">Evidence-ready trend patterns for {profile.niche || "your niche"}. Live last-7-week examples should come from platform/source data before final generation.</p>
          </div>
          <Badge className="bg-primary/15 text-primary border-primary/20 hover:brightness-100">5-10 ideas</Badge>
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          {trends.map((trend, index) => (
            <div key={`${platform}-${trend.title}`} className="grid sm:grid-cols-[0.9fr_1.1fr] gap-3 rounded-lg border border-white/8 bg-background/55 p-3">
              <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40 min-h-[190px] relative">
                <img src={trend.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-85" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
                <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
                  <Badge className="bg-black/45 text-white border-white/15 hover:brightness-100">{trend.postType}</Badge>
                  <Badge className="bg-primary/80 text-primary-foreground border-transparent hover:brightness-100">#{index + 1}</Badge>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-xs text-white/70">{trend.creator}</p>
                  <p className="text-sm font-semibold text-white leading-snug mt-1">{trend.title}</p>
                  <p className="text-[11px] text-primary mt-2">{trend.signal}</p>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/30">Pattern</p>
                    <p className="text-sm font-semibold text-white/85 mt-1 leading-snug">{trend.format}</p>
                  </div>
                  <span className="text-[11px] text-primary text-right">{trend.signal}</span>
                </div>
                <div className="mt-3 rounded-md border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Why it is going viral</p>
                  <p className="text-xs text-white/60 leading-relaxed">{trend.why}</p>
                </div>
                <div className="mt-3 rounded-md border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-white/30 mb-1">How to adapt it</p>
                  <p className="text-xs text-white/60 leading-relaxed">Use the same structure, but swap in your proof, your audience's pain point, and a specific call to comment or save.</p>
                </div>
                <a
                  href={trend.searchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                >
                  View similar on {PLATFORM_META[platform].label}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Brief({ label, value, icon: Icon = Sparkles }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-xs uppercase tracking-wider text-white/35">{label}</p>
      </div>
      <p className="text-sm text-white/70 leading-relaxed">{value}</p>
    </div>
  );
}

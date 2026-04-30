import { useEffect, useMemo, useState } from "react";
import { Info, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard, PanelCardSoft, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { SocialGrowthAccess, SocialPlatform, SocialPostingMode, SocialWeekday } from "./types";

const GOAL_OPTIONS = [
  "Grow audience",
  "Get product signups",
  "Build authority",
  "Educate audience",
  "Promote a product",
  "Test content ideas",
] as const;

const TONE_OPTIONS = [
  "Professional",
  "Casual",
  "Founder-led",
  "Educational",
  "Bold",
  "Friendly",
] as const;

function platformLabel(platform: SocialPlatform) {
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "tiktok") return "TikTok";
  return "Instagram";
}

function platformCopy(platform: SocialPlatform) {
  if (platform === "linkedin") {
    return {
      title: "Create your weekly LinkedIn growth plan",
      subtitle: "Give DayTabs one topic. You will get post ideas, a draft, visuals, and growth tasks built for how LinkedIn actually works.",
    };
  }
  if (platform === "tiktok") {
    return {
      title: "Create your weekly TikTok growth plan",
      subtitle: "Give DayTabs one topic. You will get video ideas, scripts, shot lists, and growth tasks built for how TikTok actually works.",
    };
  }
  return {
    title: "Create your weekly Instagram growth plan",
    subtitle: "Give DayTabs one topic. You will get Reels, carousels, captions, visuals, and growth tasks built for how Instagram actually works.",
  };
}

function topicSuggestions(platform: SocialPlatform) {
  const base = [
    "Sharing behind-the-scenes of my small business",
    "Promoting my freelance design services",
    "Documenting my startup journey (wins + mistakes)",
    "Sharing customer feedback and improvements",
    "Selling digital templates (art/design/notion)",
    "Sharing lessons from moving to a new country",
    "Talking about productivity struggles (and what actually helped)",
    "Explaining how my product solves a real problem",
    "Showing before/after UI redesigns",
    "Promoting my app launch (without sounding salesy)",
    "Building my product in public (weekly updates)",
  ];

  if (platform === "linkedin") {
    return [
      "Building my product in public (weekly founder update)",
      "Lessons from launching my app (what worked / what didn’t)",
      "A practical framework I use to plan my week",
      "Behind-the-scenes of my small business (what people don’t see)",
      "Customer feedback that changed my product roadmap",
      "Before/after UI redesign: what I changed and why",
      "How I got my first 10 users (step-by-step)",
      "My biggest productivity struggle and how I fixed it",
      "What I’d do differently if I started again today",
      "How my app solves one specific painful problem",
    ];
  }

  if (platform === "tiktok") {
    return [
      "Promoting my app launch (3-part series)",
      "Building my product in public (daily 20s updates)",
      "Behind-the-scenes of my small business (day in the life)",
      "Before/after UI redesigns (fast visual proof)",
      "Reacting to customer feedback (and shipping the fix)",
      "How I solve one real problem with my app (demo)",
      "Freelance design tips from real client work (no fluff)",
      "My startup mistake that cost me a week (storytime)",
      "Productivity struggles: what I stopped doing",
      "Moving to a new country: what surprised me (personal story)",
    ];
  }

  return [
    "Showcasing my oil pastel and watercolor art (process + reveal)",
    "Behind-the-scenes of my small business (shipping/orders/content)",
    "Before/after UI redesign carousel (what changed + why)",
    "Promoting my app launch (reel + carousel)",
    "Building my product in public (weekly recap)",
    "Sharing customer feedback and improvements (carousel)",
    "Selling digital art/design templates (value-first)",
    "My productivity struggle (and my simple system)",
    "A personal story about moving to a new country (reel)",
    "How my product solves one specific problem (demo reel)",
  ];
}

const FOLLOWER_RANGE_CHIPS = [
  { label: "0–500", value: 250 },
  { label: "500–2K", value: 1200 },
  { label: "2K–10K", value: 5000 },
  { label: "10K+", value: 15000 },
] as const;

const WEEKDAYS: SocialWeekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SocialPlanSetup({
  platform,
  onGenerate,
  generating,
  initialValues,
  nextWeekMode,
}: {
  platform: SocialPlatform;
  generating: boolean;
  onGenerate: (input: {
    topic: string;
    postsPerWeek: number;
    postingMode: SocialPostingMode;
    preferredWeekdays?: SocialWeekday[];
    audience?: string;
    followersCount?: number | null;
    goal?: string;
    tone?: string;
    formatPreference?: string;
  }) => void;
  initialValues?: Partial<{
    topic: string;
    postsPerWeek: number;
    postingMode: SocialPostingMode;
    preferredWeekdays: SocialWeekday[];
    audience: string;
    followersCount: number | null;
    goal: string;
    tone: string;
    formatPreference: string;
  }>;
  nextWeekMode?: SocialGrowthAccess["nextWeekMode"];
}) {
  const label = platformLabel(platform);
  const copy = platformCopy(platform);
  const [topic, setTopic] = useState(initialValues?.topic ?? "");
  const [postsPerWeek, setPostsPerWeek] = useState(initialValues?.postsPerWeek ?? 3);
  const [postingMode, setPostingMode] = useState<SocialPostingMode>(initialValues?.postingMode ?? (platform === "linkedin" ? "manual" : "ai_optimized"));
  const [preferredWeekdays, setPreferredWeekdays] = useState<SocialWeekday[]>(initialValues?.preferredWeekdays ?? []);
  const [audience, setAudience] = useState(initialValues?.audience ?? "");
  const [followersCount, setFollowersCount] = useState(initialValues?.followersCount != null ? String(initialValues.followersCount) : "");
  const [goal, setGoal] = useState<(typeof GOAL_OPTIONS)[number] | "">(initialValues?.goal ? (initialValues.goal as any) : "");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number] | "">(initialValues?.tone ? (initialValues.tone as any) : "");
  const [formatPreference, setFormatPreference] = useState(initialValues?.formatPreference ?? "");
  const [topicError, setTopicError] = useState("");
  const [followersError, setFollowersError] = useState("");

  useEffect(() => {
    if (!initialValues) return;
    if (typeof initialValues.topic === "string") setTopic(initialValues.topic);
    if (typeof initialValues.postsPerWeek === "number") setPostsPerWeek(initialValues.postsPerWeek);
    if (initialValues.postingMode === "manual" || initialValues.postingMode === "ai_optimized") setPostingMode(initialValues.postingMode);
    if (Array.isArray(initialValues.preferredWeekdays)) setPreferredWeekdays(initialValues.preferredWeekdays);
    if (typeof initialValues.audience === "string") setAudience(initialValues.audience);
    if (initialValues.followersCount != null) setFollowersCount(String(initialValues.followersCount));
    if (typeof initialValues.goal === "string") setGoal(initialValues.goal as any);
    if (typeof initialValues.tone === "string") setTone(initialValues.tone as any);
    if (typeof initialValues.formatPreference === "string") setFormatPreference(initialValues.formatPreference);
  }, [initialValues]);

  const subtitle = useMemo(
    () => `Choose a topic for the week and DayTabs will generate an execution-ready plan built for how ${label} actually works.`,
    [label],
  );

  const suggestedTopics = useMemo(() => topicSuggestions(platform).slice(0, 12), [platform]);

  const allowBestCase = platform === "tiktok" || platform === "instagram";
  const inputBaseClass =
    "h-11 rounded-xl border-white/10 bg-white/4 text-white placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-violet-300/35 focus-visible:ring-offset-0";
  const selectBaseClass =
    "mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/4 px-3 text-sm text-white outline-none focus:border-violet-300/35 focus:ring-2 focus:ring-violet-300/20";

  return (
    <PanelCard className="p-6">
      <PanelHeader className="gap-3">
        <div>
          <PanelTitle>{copy.title}</PanelTitle>
          <PanelSubtitle>{copy.subtitle}</PanelSubtitle>
        </div>
      </PanelHeader>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Platform-specific ideas, not generic suggestions",
              "Hooks, scripts, captions, and visuals included",
              "Growth tasks to help your posts get seen",
              nextWeekMode === "behavior_based"
                ? "Next week improves based on your feedback"
                : "Generate next week from your goals",
            ].map((item) => (
              <PanelCardSoft key={item} className="border border-white/10 p-3 text-sm text-white/70">
                <Sparkles className="mb-2 h-4 w-4 text-violet-200" />
                {item}
              </PanelCardSoft>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Topic</p>
            <Input
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                if (topicError) setTopicError("");
              }}
              placeholder={platform === "instagram" ? "Example: Showing my painting process + finishing reveal" : "Example: Building my product in public (weekly update)"}
              className={cn("mt-2", inputBaseClass)}
            />
            {topicError ? <p className="mt-2 text-sm text-red-200">{topicError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedTopics.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setTopic(example)}
                  className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/7 hover:text-white"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {allowBestCase ? (
              <div className="lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Posting mode</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([
                    { value: "ai_optimized", label: "Best case", hint: "DayTabs picks the cadence and mix." },
                    { value: "manual", label: "Manual", hint: "You control cadence and weekdays." },
                  ] as const).map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setPostingMode(mode.value)}
                      className={cn(
                        "flex flex-1 flex-col items-start rounded-2xl border p-3 text-left transition-all",
                        postingMode === mode.value ? "border-violet-300/35 bg-violet-500/10" : "border-white/10 bg-white/3 hover:bg-white/5",
                      )}
                    >
                      <p className="text-sm font-semibold text-white">{mode.label}</p>
                      <p className="mt-1 text-xs text-white/50">{mode.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {allowBestCase && postingMode === "ai_optimized" ? (
              <div className="lg:col-span-2 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl border border-sky-300/15 bg-sky-500/10 text-sky-200">
                    <Info className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sky-100">Best case selected</p>
                    <p className="mt-1 text-sm leading-6 text-sky-50/80">
                      DayTabs will choose the best posting frequency, content mix, and schedule based on your topic, platform, and growth stage.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
                  How many times do you want to post this week?
                </p>
                <Input
                  value={String(postsPerWeek)}
                  onChange={(event) => setPostsPerWeek(Math.max(1, Math.min(7, Number(event.target.value || 0) || 0)) || 1)}
                  inputMode="numeric"
                  className={cn("mt-2", inputBaseClass)}
                />
              </div>
            )}

            {allowBestCase && postingMode === "manual" ? (
              <div className="lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Preferred weekdays (optional)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const active = preferredWeekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setPreferredWeekdays((current) => active ? current.filter((item) => item !== day) : [...current, day])}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          active ? "border-violet-300/35 bg-violet-500/10 text-violet-100" : "border-white/10 bg-white/4 text-white/60 hover:bg-white/7 hover:text-white",
                        )}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Growth stage</p>
            <p className="mt-2 text-xs text-white/45">Used to adapt your plan and growth tasks to your current growth stage.</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Followers / Subscribers *</p>
            <Input
              value={followersCount}
              onChange={(event) => {
                setFollowersCount(event.target.value);
                if (followersError) setFollowersError("");
              }}
              placeholder="Example: 1200"
              inputMode="numeric"
              className={cn("mt-2", inputBaseClass)}
            />
            {followersError ? <p className="mt-2 text-sm text-red-200">{followersError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {FOLLOWER_RANGE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setFollowersCount(String(chip.value))}
                  className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/7 hover:text-white"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Goal (optional)</p>
              <select
                value={goal}
                onChange={(event) => setGoal(event.target.value as any)}
                className={selectBaseClass}
              >
                <option value="">Select a goal</option>
                {GOAL_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Tone (optional)</p>
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value as any)}
                className={selectBaseClass}
              >
                <option value="">Select a tone</option>
                {TONE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Audience (optional)</p>
              <Input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="Example: early-stage founders building in public"
                className={cn("mt-2", inputBaseClass)}
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Content style preference (optional)</p>
              <Input
                value={formatPreference}
                onChange={(event) => setFormatPreference(event.target.value)}
                placeholder="Example: carousels, founder stories, behind-the-scenes"
                className={cn("mt-2", inputBaseClass)}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">
              Plans are generated from your inputs, without using platform API sync for now.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!topic.trim()) setTopic(suggestedTopics[0] || "Building my product in public (weekly update)");
                }}
                disabled={generating}
                className="rounded-lg"
              >
                Try Example Topic
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const trimmed = topic.trim();
                  if (!trimmed) {
                    setTopicError("Add a specific topic to generate a plan.");
                    return;
                  }
                  const parsedFollowers = followersCount.trim() ? Number(followersCount.trim()) : NaN;
                  if (!followersCount.trim() || !Number.isFinite(parsedFollowers) || parsedFollowers < 0) {
                    setFollowersError("Enter your current follower/subscriber count so DayTabs can adapt the plan.");
                    return;
                  }
                  const normalizedFollowersCount = Math.max(0, Math.floor(parsedFollowers));
                  onGenerate({
                    topic: trimmed,
                    postsPerWeek,
                    postingMode: platform === "linkedin" ? "manual" : postingMode,
                    preferredWeekdays: platform === "linkedin" || postingMode === "ai_optimized" ? undefined : preferredWeekdays,
                    audience: audience.trim() || undefined,
                    followersCount: normalizedFollowersCount,
                    goal: goal || undefined,
                    tone: tone || undefined,
                    formatPreference: formatPreference.trim() || undefined,
                  });
                }}
                disabled={generating}
                className="rounded-lg bg-linear-to-r from-violet-500 to-fuchsia-500 text-white hover:from-violet-400 hover:to-fuchsia-400"
              >
                <Wand2 className="mr-2 h-4 w-4" />
                {generating ? "Generating..." : "Generate My Weekly Plan"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <PanelCardSoft className="border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.16),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Preview</p>
            <p className="mt-2 text-lg font-semibold text-white">Example idea</p>
            <p className="mt-3 text-sm text-white/70">
              <span className="text-white/90">Idea:</span> "The one mistake I made while building in public"
            </p>
            <p className="mt-2 text-sm text-white/70">
              <span className="text-white/90">Hook:</span> "I thought shipping fast was enough. It was not."
            </p>
            <p className="mt-2 text-sm text-white/70">
              <span className="text-white/90">Visual:</span> "Simple 3-slide carousel or 5-shot phone video."
            </p>
            <p className="mt-2 text-sm text-white/70">
              <span className="text-white/90">Growth task:</span> "Comment on 5 posts from creators in your niche before posting."
            </p>
          </PanelCardSoft>

          <PanelCardSoft className="border border-white/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Tip</p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              The fastest wins come from strong hooks and quick engagement after posting. DayTabs will include both in your plan.
            </p>
          </PanelCardSoft>
        </div>
      </div>
    </PanelCard>
  );
}

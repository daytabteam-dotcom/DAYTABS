import { useMemo, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard, PanelCardSoft, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { SocialPlatform, SocialPostingMode, SocialWeekday } from "./types";

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

const EXAMPLE_TOPICS = [
  "Building my app in public",
  "Productivity tips for founders",
  "AI tools for creators",
  "Behind the scenes of my business",
  "How I solved a customer problem",
] as const;

const WEEKDAYS: SocialWeekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SocialPlanSetup({
  platform,
  onGenerate,
  generating,
}: {
  platform: SocialPlatform;
  generating: boolean;
  onGenerate: (input: {
    topic: string;
    postsPerWeek: number;
    postingMode: SocialPostingMode;
    preferredWeekdays?: SocialWeekday[];
    audience?: string;
    goal?: string;
    tone?: string;
    formatPreference?: string;
  }) => void;
}) {
  const label = platformLabel(platform);
  const copy = platformCopy(platform);
  const [topic, setTopic] = useState("");
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [postingMode, setPostingMode] = useState<SocialPostingMode>(platform === "linkedin" ? "manual" : "ai_optimized");
  const [preferredWeekdays, setPreferredWeekdays] = useState<SocialWeekday[]>([]);
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState<(typeof GOAL_OPTIONS)[number] | "">("");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number] | "">("");
  const [formatPreference, setFormatPreference] = useState("");
  const [error, setError] = useState("");

  const subtitle = useMemo(
    () => `Choose a topic for the week and DayTabs will generate an execution-ready plan built for how ${label} actually works.`,
    [label],
  );

  const allowBestCase = platform === "tiktok" || platform === "instagram";

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
              "Next week improves based on your feedback",
            ].map((item) => (
              <PanelCardSoft key={item} className="border border-white/10 p-3 text-sm text-white/70">
                <Sparkles className="mb-2 h-4 w-4 text-violet-200" />
                {item}
              </PanelCardSoft>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Topic for this week</p>
            <Input
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                if (error) setError("");
              }}
              placeholder="Example: Building my AI video analysis app in public"
              className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
            />
            {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_TOPICS.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setTopic(example)}
                  className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/65 transition-colors hover:bg-white/7 hover:text-white"
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
              <PanelCardSoft className="lg:col-span-2 border border-white/10 bg-white/3 p-4 text-sm text-white/65">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Best Case Selected</p>
                <p className="mt-2 leading-6">
                  DayTabs will choose the best number of posts, content mix, and posting days based on your topic, goal, and platform.
                </p>
              </PanelCardSoft>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
                  How many times do you want to post this week?
                </p>
                <Input
                  value={String(postsPerWeek)}
                  onChange={(event) => setPostsPerWeek(Math.max(1, Math.min(7, Number(event.target.value || 0) || 0)) || 1)}
                  inputMode="numeric"
                  className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
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

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Goal (optional)</p>
              <select
                value={goal}
                onChange={(event) => setGoal(event.target.value as any)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white/4 px-3 py-2 text-sm text-white"
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
                className="mt-2 w-full rounded-md border border-white/10 bg-white/4 px-3 py-2 text-sm text-white"
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
                className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Content style preference (optional)</p>
              <Input
                value={formatPreference}
                onChange={(event) => setFormatPreference(event.target.value)}
                placeholder="Example: carousels, founder stories, behind-the-scenes"
                className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
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
                  if (!topic.trim()) setTopic(EXAMPLE_TOPICS[0]);
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
                    setError("Add a topic to generate a plan.");
                    return;
                  }
                  onGenerate({
                    topic: trimmed,
                    postsPerWeek,
                    postingMode: platform === "linkedin" ? "manual" : postingMode,
                    preferredWeekdays: platform === "linkedin" || postingMode === "ai_optimized" ? undefined : preferredWeekdays,
                    audience: audience.trim() || undefined,
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

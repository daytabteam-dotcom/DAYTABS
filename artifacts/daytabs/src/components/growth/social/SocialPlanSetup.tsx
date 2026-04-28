import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import type { SocialPlatform } from "./types";

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
    audience?: string;
    goal?: string;
    tone?: string;
    formatPreference?: string;
  }) => void;
}) {
  const label = platformLabel(platform);
  const [topic, setTopic] = useState("");
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState<(typeof GOAL_OPTIONS)[number] | "">("");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number] | "">("");
  const [formatPreference, setFormatPreference] = useState("");
  const [error, setError] = useState("");

  const subtitle = useMemo(
    () => `Choose a topic for the week and DayTabs will generate ideas built for how ${label} actually works.`,
    [label],
  );

  return (
    <PanelCard className="p-6">
      <PanelHeader className="gap-3">
        <div>
          <PanelTitle>Create your weekly {label} plan</PanelTitle>
          <PanelSubtitle>{subtitle}</PanelSubtitle>
        </div>
      </PanelHeader>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Topic for this week</p>
          <Input
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              if (error) setError("");
            }}
            placeholder="Example: Building my AI video analysis app in public"
            className="mt-2 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
          />
          {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            How many times do you want to post this week?
          </p>
          <Input
            value={String(postsPerWeek)}
            onChange={(event) => setPostsPerWeek(Math.max(1, Math.min(7, Number(event.target.value || 0) || 0)) || 1)}
            inputMode="numeric"
            className="mt-2 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Audience (optional)</p>
          <Input
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            placeholder="Example: early-stage founders building in public"
            className="mt-2 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Goal (optional)</p>
          <select
            value={goal}
            onChange={(event) => setGoal(event.target.value as any)}
            className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
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
            className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
          >
            <option value="">Select a tone</option>
            {TONE_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Format preference (optional)</p>
          <Input
            value={formatPreference}
            onChange={(event) => setFormatPreference(event.target.value)}
            placeholder="Example: carousels, founder story posts, behind-the-scenes reels"
            className="mt-2 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/45">
          Plans are generated from your inputs, without using platform API sync for now.
        </p>
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
              audience: audience.trim() || undefined,
              goal: goal || undefined,
              tone: tone || undefined,
              formatPreference: formatPreference.trim() || undefined,
            });
          }}
          disabled={generating}
          className="rounded-lg"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {generating ? "Generating..." : "Generate Weekly Plan"}
        </Button>
      </div>
    </PanelCard>
  );
}


import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PanelCardSoft } from "@/components/panel-system";
import type { SocialPlatform, SocialPlanDay, SocialPostPerformanceFeedback, SocialPostingMode, SocialWeekday, SocialWeeklyPlan } from "./types";
import { fetchLatestSocialPlan, generateNextWeekSocialPlan, generateSocialPlan, patchSocialDay, deleteSocialDay, regenerateSocialDay } from "./socialApi";
import { SocialPlanSetup } from "./SocialPlanSetup";
import { SocialPlanBoard } from "./SocialPlanBoard";
import { SocialFeedbackModal } from "./SocialFeedbackModal";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function weekEnded(plan: SocialWeeklyPlan) {
  return todayIso() > plan.endDate;
}

function platformLabel(platform: SocialPlatform) {
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "tiktok") return "TikTok";
  return "Instagram";
}

export default function SocialGrowthPlanner({ platform }: { platform: SocialPlatform }) {
  const label = platformLabel(platform);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SocialWeeklyPlan | null>(null);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pendingNextWeekTopic, setPendingNextWeekTopic] = useState<string>("");

  const days = useMemo(() => plan?.plan?.days ?? [], [plan?.plan?.days]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLimitError(null);
    try {
      const data = await fetchLatestSocialPlan(platform);
      setPlan(data.plan ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plan");
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleGenerate = useCallback(async (input: { topic: string; postsPerWeek: number; postingMode: SocialPostingMode; preferredWeekdays?: SocialWeekday[]; audience?: string; goal?: string; tone?: string; formatPreference?: string }) => {
    setWorking("generate");
    setError(null);
    setLimitError(null);
    try {
      const data = await generateSocialPlan({ platform, ...input });
      setPlan(data.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate plan";
      if (message.toLowerCase().includes("limit")) setLimitError(message);
      else setError(message);
    } finally {
      setWorking(null);
    }
  }, [platform]);

  const handlePatchDay = useCallback(async (day: SocialPlanDay, patch: Partial<SocialPlanDay>) => {
    if (!plan) return;
    setWorking(`patch:${day.id}`);
    setError(null);
    try {
      const data = await patchSocialDay({ planId: plan.id, dayId: day.id, patch });
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setWorking(null);
    }
  }, [plan]);

  const handleDeleteDay = useCallback(async (day: SocialPlanDay) => {
    if (!plan) return;
    const confirmed = window.confirm(`Delete "${day.contentIdea}" from this plan?`);
    if (!confirmed) return;
    setWorking(`delete:${day.id}`);
    setError(null);
    try {
      const data = await deleteSocialDay({ planId: plan.id, dayId: day.id });
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete idea");
    } finally {
      setWorking(null);
    }
  }, [plan]);

  const handleRegenerateDay = useCallback(async (day: SocialPlanDay, intent?: string) => {
    if (!plan) return;
    setWorking(`regen:${day.id}`);
    setError(null);
    try {
      const data = await regenerateSocialDay({ planId: plan.id, dayId: day.id, platform, intent });
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate idea");
    } finally {
      setWorking(null);
    }
  }, [plan, platform]);

  const handleGenerateNextWeek = useCallback(() => {
    if (!plan) return;
    setError(null);
    setLimitError(null);
    if (!weekEnded(plan)) {
      setError("This week is still active. You can generate next week after this plan ends.");
      return;
    }
    setPendingNextWeekTopic(plan.topic);
    setFeedbackOpen(true);
  }, [plan]);

  const runGenerateNextWeek = useCallback(async (options: { skippedFeedback: boolean; feedback?: SocialPostPerformanceFeedback[] }) => {
    if (!plan) return;
    setWorking("next-week");
    setError(null);
    setLimitError(null);
    try {
      const data = await generateNextWeekSocialPlan({
        planId: plan.id,
        platform,
        topic: pendingNextWeekTopic.trim() || plan.topic,
        postsPerWeek: plan.postsPerWeek,
        postingMode: plan.postingMode,
        preferredWeekdays: plan.preferredWeekdays,
        audience: plan.audience ?? undefined,
        goal: plan.goal ?? undefined,
        tone: plan.tone ?? undefined,
        formatPreference: plan.formatPreference ?? undefined,
        skippedFeedback: options.skippedFeedback,
        feedback: options.feedback,
      });
      setPlan(data.plan);
      setFeedbackOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "We could not generate the next plan. Your feedback is saved, so you can try again.";
      if (message.toLowerCase().includes("limit")) setLimitError(message);
      else setError(message);
    } finally {
      setWorking(null);
    }
  }, [pendingNextWeekTopic, plan, platform]);

  if (loading) {
    return (
      <PanelCardSoft className="flex items-center gap-2 border border-white/10 p-4 text-sm text-white/55">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {label} plan...
      </PanelCardSoft>
    );
  }

  return (
    <div className="space-y-6">
      {limitError ? (
        <PanelCardSoft className="border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {limitError}
        </PanelCardSoft>
      ) : null}

      {error ? (
        <PanelCardSoft className="border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </PanelCardSoft>
      ) : null}

      {!plan ? (
        <SocialPlanSetup platform={platform} generating={working === "generate"} onGenerate={handleGenerate} />
      ) : (
        <>
          <SocialPlanBoard
            plan={plan}
            working={Boolean(working)}
            onGenerateNextWeek={handleGenerateNextWeek}
            onPatchDay={handlePatchDay}
            onDeleteDay={handleDeleteDay}
            onRegenerateDay={handleRegenerateDay}
          />

          <SocialFeedbackModal
            open={feedbackOpen}
            platform={platform}
            days={days}
            working={working === "next-week"}
            onClose={() => setFeedbackOpen(false)}
            onSkip={() => void runGenerateNextWeek({ skippedFeedback: true })}
            onSubmit={(feedback) => void runGenerateNextWeek({ skippedFeedback: false, feedback })}
          />
        </>
      )}
    </div>
  );
}

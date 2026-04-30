import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PanelCardSoft } from "@/components/panel-system";
import { useToast } from "@/hooks/use-toast";
import type { SocialGrowthAccess, SocialPlatform, SocialPlanDay, SocialPostPerformanceFeedback, SocialPostingMode, SocialWeekday, SocialWeeklyPlan } from "./types";
import { ApiError, createSocialDay, fetchLatestSocialPlan, fetchSocialGrowthAccess, generateNextWeekSocialPlan, generateSocialPlan, patchSocialDay, deleteSocialDay, regenerateSocialDay } from "./socialApi";
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SocialWeeklyPlan | null>(null);
  const [access, setAccess] = useState<SocialGrowthAccess | null>(null);
  const [setupDefaults, setSetupDefaults] = useState<{
    topic?: string;
    postsPerWeek?: number;
    postingMode?: SocialPostingMode;
    preferredWeekdays?: SocialWeekday[];
    audience?: string;
    followersCount?: number | null;
    goal?: string;
    tone?: string;
    formatPreference?: string;
  } | null>(null);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pendingNextWeekTopic, setPendingNextWeekTopic] = useState<string>("");
  const [pendingFollowersCount, setPendingFollowersCount] = useState<string>("");

  const days = useMemo(() => (plan?.plan?.days ?? []).filter((day) => !day.isDeleted), [plan?.plan?.days]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLimitError(null);
    try {
      const [accessData, planData] = await Promise.all([
        fetchSocialGrowthAccess(),
        fetchLatestSocialPlan(platform),
      ]);
      setAccess(accessData);
      setPlan(planData.plan ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plan");
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleGenerate = useCallback(async (input: { topic: string; postsPerWeek: number; postingMode: SocialPostingMode; preferredWeekdays?: SocialWeekday[]; audience?: string; followersCount?: number | null; goal?: string; tone?: string; formatPreference?: string }) => {
    setWorking("generate");
    setError(null);
    setLimitError(null);
    try {
      const data = await generateSocialPlan({ platform, ...input });
      setPlan(data.plan);
      setSetupDefaults(null);
      const refreshed = await fetchSocialGrowthAccess().catch(() => null);
      if (refreshed) setAccess(refreshed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate plan";
      if (err instanceof ApiError && err.status === 429) setLimitError(message);
      else if (err instanceof ApiError && err.status === 403) setLimitError(message);
      else if (message.toLowerCase().includes("limit")) setLimitError(message);
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
      const message = err instanceof Error ? err.message : "Could not save changes";
      setError(message);
      throw new Error(message);
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
      const message = err instanceof Error ? err.message : "Could not delete idea";
      setError(message);
      throw new Error(message);
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
      const message = err instanceof Error ? err.message : "Could not regenerate idea";
      setError(message);
      throw new Error(message);
    } finally {
      setWorking(null);
    }
  }, [plan, platform]);

  const handleCreateDay = useCallback(async (input: { date: string; contentIdea: string; contentType?: string; hook?: string; notes?: string; tags?: string[]; bestPostingTime?: string }) => {
    if (!plan) return null;
    setWorking("create-day");
    setError(null);
    try {
      const data = await createSocialDay({ planId: plan.id, platform, ...input });
      setPlan(data.plan);
      return data.day?.id ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add idea";
      if (err instanceof ApiError && err.status === 429) setLimitError(message);
      else setError(message);
      return null;
    } finally {
      setWorking(null);
    }
  }, [plan, platform]);

  const handleGenerateNextWeek = useCallback(() => {
    if (!plan) return;
    setError(null);
    setLimitError(null);

    const mode = access?.nextWeekMode ?? "behavior_based";
    if (mode === "blocked") {
      toast({ title: "Upgrade required", description: "Upgrade to Creator to generate more weeks." });
      return;
    }
    if (mode === "form_based") {
      setSetupDefaults({
        topic: plan.topic,
        postsPerWeek: plan.postsPerWeek,
        postingMode: plan.postingMode,
        preferredWeekdays: plan.preferredWeekdays,
        audience: plan.audience ?? undefined,
        followersCount: plan.followersCount ?? null,
        goal: plan.goal ?? undefined,
        tone: plan.tone ?? undefined,
        formatPreference: plan.formatPreference ?? undefined,
      });
      setPlan(null);
      return;
    }

    if (!weekEnded(plan)) {
      toast({
        title: "This week is still active",
        description: "You can generate next week after this plan ends.",
      });
      return;
    }
    setPendingNextWeekTopic(plan.topic);
    setPendingFollowersCount(plan.followersCount != null ? String(plan.followersCount) : "");
    setFeedbackOpen(true);
  }, [access, plan, toast]);

  const runGenerateNextWeek = useCallback(async (options: { skippedFeedback: boolean; feedback?: SocialPostPerformanceFeedback[]; followersCount?: number | null }) => {
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
        followersCount: options.followersCount,
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
      if (err instanceof ApiError && (err.status === 429 || err.status === 403 || err.status === 410)) setLimitError(message);
      else if (message.toLowerCase().includes("limit")) setLimitError(message);
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

  const isLockedPlatform = useMemo(() => {
    if (!access) return false;
    if (access.platformLimit >= 3) return false;
    if (access.usedPlatforms.includes(platform)) return false;
    return access.usedPlatforms.length >= access.platformLimit;
  }, [access, platform]);

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
        isLockedPlatform ? (
          <PanelCardSoft className="border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            Your plan only includes access to {access?.platformLimit ?? 1} platform{(access?.platformLimit ?? 1) === 1 ? "" : "s"}. Upgrade to unlock {label}.
          </PanelCardSoft>
        ) : (
          <SocialPlanSetup
            platform={platform}
            generating={working === "generate"}
            onGenerate={handleGenerate}
            initialValues={setupDefaults ?? undefined}
            nextWeekMode={access?.nextWeekMode}
          />
        )
      ) : (
        <>
          <SocialPlanBoard
            plan={plan}
            working={Boolean(working)}
            onGenerateNextWeek={handleGenerateNextWeek}
            onPatchDay={handlePatchDay}
            onDeleteDay={handleDeleteDay}
            onRegenerateDay={handleRegenerateDay}
            onCreateDay={handleCreateDay}
          />

          <SocialFeedbackModal
            open={feedbackOpen}
            platform={platform}
            days={days}
            followersCount={pendingFollowersCount}
            onFollowersCountChange={setPendingFollowersCount}
            working={working === "next-week"}
            onClose={() => setFeedbackOpen(false)}
            onSkip={() => {
              const parsedFollowers = pendingFollowersCount.trim() ? Number(pendingFollowersCount.trim()) : NaN;
              const normalizedFollowersCount = Number.isFinite(parsedFollowers) ? Math.max(0, Math.floor(parsedFollowers)) : null;
              void runGenerateNextWeek({ skippedFeedback: true, followersCount: normalizedFollowersCount ?? undefined });
            }}
            onSubmit={(feedback) => {
              const parsedFollowers = pendingFollowersCount.trim() ? Number(pendingFollowersCount.trim()) : NaN;
              const normalizedFollowersCount = Number.isFinite(parsedFollowers) ? Math.max(0, Math.floor(parsedFollowers)) : null;
              void runGenerateNextWeek({ skippedFeedback: false, feedback, followersCount: normalizedFollowersCount ?? undefined });
            }}
          />
        </>
      )}
    </div>
  );
}

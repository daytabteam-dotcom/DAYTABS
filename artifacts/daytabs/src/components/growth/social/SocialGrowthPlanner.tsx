import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PanelCardSoft } from "@/components/panel-system";
import { useToast } from "@/hooks/use-toast";
import type { SocialPlatform, SocialPlanDay, SocialPostPerformanceFeedback, SocialPostingMode, SocialWeekday, SocialWeeklyPlan } from "./types";
import { createSocialDay, fetchLatestSocialPlan, generateNextWeekSocialPlan, generateSocialPlan, patchSocialDay, deleteSocialDay, regenerateSocialDay } from "./socialApi";
import { SocialPlanSetup } from "./SocialPlanSetup";
import { SocialPlanBoard } from "./SocialPlanBoard";
import { SocialFeedbackModal } from "./SocialFeedbackModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getNextWeekGenerationMode } from "@/lib/contentGrowthLimits";
import { usePlan } from "@/hooks/use-plan";

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

export default function SocialGrowthPlanner({ platform, onUsageChanged }: { platform: SocialPlatform; onUsageChanged?: () => void }) {
  const label = platformLabel(platform);
  const { toast } = useToast();
  const { plan: planInfo } = usePlan();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [plan, setPlan] = useState<SocialWeeklyPlan | null>(null);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [nextWeekSetupOpen, setNextWeekSetupOpen] = useState(false);
  const [pendingNextWeekTopic, setPendingNextWeekTopic] = useState<string>("");
  const [pendingFollowersCount, setPendingFollowersCount] = useState<string>("");

  const days = useMemo(() => (plan?.plan?.days ?? []).filter((day) => !day.isDeleted), [plan?.plan?.days]);

  const showErrorToast = useCallback((message: string, fallbackTitle?: string) => {
    const normalized = (message || "").trim() || "Something went wrong. Please try again.";
    const isLimit = normalized.includes("Upgrade")
      || normalized.includes("not included")
      || normalized.includes("platform only")
      || normalized.includes("AI improvements")
      || normalized.includes("Additional AI-generated ideas");
    toast({
      variant: isLimit ? "default" : "destructive",
      title: fallbackTitle ?? (isLimit ? "Upgrade required" : "Error"),
      description: normalized,
    });
  }, [toast]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLatestSocialPlan(platform);
      setPlan(data.plan ?? null);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Could not load plan", "Could not load plan");
    } finally {
      setLoading(false);
    }
  }, [platform, showErrorToast]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleGenerate = useCallback(async (input: { topic: string; postsPerWeek: number; postingMode: SocialPostingMode; preferredWeekdays?: SocialWeekday[]; audience?: string; followersCount?: number | null; goal?: string; tone?: string; formatPreference?: string }) => {
    setWorking("generate");
    try {
      const data = await generateSocialPlan({ platform, ...input });
      setPlan(data.plan);
      onUsageChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate plan";
      showErrorToast(message, "Could not generate plan");
    } finally {
      setWorking(null);
    }
  }, [onUsageChanged, platform, showErrorToast]);

  const handlePatchDay = useCallback(async (day: SocialPlanDay, patch: Partial<SocialPlanDay>) => {
    if (!plan) return;
    setWorking(`patch:${day.id}`);
    try {
      const data = await patchSocialDay({ planId: plan.id, dayId: day.id, patch });
      setPlan(data.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save changes";
      showErrorToast(message, "Could not save changes");
      throw new Error(message);
    } finally {
      setWorking(null);
    }
  }, [plan, showErrorToast]);

  const handleDeleteDay = useCallback(async (day: SocialPlanDay) => {
    if (!plan) return;
    const confirmed = window.confirm(`Delete "${day.contentIdea}" from this plan?`);
    if (!confirmed) return;
    setWorking(`delete:${day.id}`);
    try {
      const data = await deleteSocialDay({ planId: plan.id, dayId: day.id });
      setPlan(data.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete idea";
      showErrorToast(message, "Could not delete idea");
      throw new Error(message);
    } finally {
      setWorking(null);
    }
  }, [plan, showErrorToast]);

  const handleRegenerateDay = useCallback(async (day: SocialPlanDay, intent?: string) => {
    if (!plan) return;
    setWorking(`regen:${day.id}`);
    try {
      const data = await regenerateSocialDay({ planId: plan.id, dayId: day.id, platform, intent });
      setPlan(data.plan);
      onUsageChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not regenerate idea";
      showErrorToast(message, "Could not regenerate idea");
      throw new Error(message);
    } finally {
      setWorking(null);
    }
  }, [onUsageChanged, plan, platform, showErrorToast]);

  const handleCreateDay = useCallback(async (input: { date: string; contentIdea: string; contentType?: string; hook?: string; notes?: string; tags?: string[]; bestPostingTime?: string }) => {
    if (!plan) return null;
    setWorking("create-day");
    try {
      const data = await createSocialDay({ planId: plan.id, platform, ...input });
      setPlan(data.plan);
      return data.day?.id ?? null;
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Could not add idea", "Could not add idea");
      return null;
    } finally {
      setWorking(null);
    }
  }, [plan, platform, showErrorToast]);

  const handleGenerateNextWeek = useCallback(() => {
    if (!plan) return;
    if (!weekEnded(plan)) {
      toast({
        title: "This week is still active",
        description: "You can generate next week after this plan ends.",
      });
      return;
    }
    const nextWeekMode = getNextWeekGenerationMode(planInfo.plan);
    setPendingNextWeekTopic(plan.topic);
    setPendingFollowersCount(plan.followersCount != null ? String(plan.followersCount) : "");
    if (nextWeekMode === "goal_based") {
      setNextWeekSetupOpen(true);
    } else {
      setFeedbackOpen(true);
    }
  }, [plan, planInfo.plan, toast]);

  const runGenerateNextWeek = useCallback(async (options: { skippedFeedback: boolean; feedback?: SocialPostPerformanceFeedback[]; followersCount?: number | null }) => {
    if (!plan) return;
    setWorking("next-week");
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
      onUsageChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "We could not generate the next plan. Your feedback is saved, so you can try again.";
      showErrorToast(message, "Could not generate next week");
    } finally {
      setWorking(null);
    }
  }, [onUsageChanged, pendingNextWeekTopic, plan, platform, showErrorToast]);

  const runGenerateNextWeekGoalBased = useCallback(async (input: { topic: string; postsPerWeek: number; postingMode: SocialPostingMode; preferredWeekdays?: SocialWeekday[]; audience?: string; followersCount?: number | null; goal?: string; tone?: string; formatPreference?: string }) => {
    if (!plan) return;
    setWorking("next-week");
    try {
      const data = await generateNextWeekSocialPlan({
        planId: plan.id,
        platform,
        topic: input.topic,
        postsPerWeek: input.postsPerWeek,
        followersCount: input.followersCount,
        postingMode: input.postingMode,
        preferredWeekdays: input.preferredWeekdays,
        audience: input.audience,
        goal: input.goal,
        tone: input.tone,
        formatPreference: input.formatPreference,
        skippedFeedback: true,
      });
      setPlan(data.plan);
      setNextWeekSetupOpen(false);
      onUsageChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "We could not generate the next plan. Please try again.";
      showErrorToast(message, "Could not generate next week");
    } finally {
      setWorking(null);
    }
  }, [onUsageChanged, plan, platform, showErrorToast]);

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

          <Dialog open={nextWeekSetupOpen} onOpenChange={(open) => setNextWeekSetupOpen(open)}>
            <DialogContent className="max-w-[920px] border-white/10 bg-[#0b0a12] text-white">
              <DialogHeader>
                <DialogTitle>Plan next week</DialogTitle>
                <DialogDescription className="text-white/55">
                  Creator plan uses goal-based planning for next week (no performance feedback required).
                </DialogDescription>
              </DialogHeader>
              {plan ? (
                <SocialPlanSetup
                  platform={platform}
                  generating={working === "next-week"}
                  submitLabel="Generate Next Week Plan"
                  initialValues={{
                    topic: pendingNextWeekTopic.trim() || plan.topic,
                    postsPerWeek: plan.postsPerWeek,
                    postingMode: plan.postingMode,
                    preferredWeekdays: plan.preferredWeekdays ?? [],
                    audience: plan.audience ?? "",
                    followersCount: plan.followersCount ?? null,
                    goal: plan.goal ?? "",
                    tone: plan.tone ?? "",
                    formatPreference: plan.formatPreference ?? "",
                  }}
                  onGenerate={runGenerateNextWeekGoalBased}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

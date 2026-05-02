import { useEffect, useState } from "react";
import ExistingYoutubeGrowthPlanner from "@/components/growth/youtube/ExistingYoutubeGrowthPlanner";
import SocialGrowthPlanner from "@/components/growth/social/SocialGrowthPlanner";
import { PlatformTabs, type GrowthPlatformTab } from "@/components/growth/PlatformTabs";
import { usePlan } from "@/hooks/use-plan";
import { fetchSocialGrowthUsage } from "@/components/growth/social/socialApi";
import { canUsePlatform } from "@/lib/contentGrowthLimits";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { useToast } from "@/hooks/use-toast";

function tabFromStorage(): GrowthPlatformTab | null {
  const value = localStorage.getItem("daytabs_growth_platform");
  if (value === "youtube" || value === "linkedin" || value === "tiktok" || value === "instagram") return value;
  return null;
}

function platformFromUrl(): GrowthPlatformTab | null {
  const value = new URLSearchParams(window.location.search).get("platform");
  if (value === "youtube" || value === "linkedin" || value === "tiktok" || value === "instagram") return value;
  return null;
}

export default function GrowthPlannerPage() {
  const { plan } = usePlan();
  const { toast } = useToast();
  const [platform, setPlatform] = useState<GrowthPlatformTab>(() => platformFromUrl() ?? tabFromStorage() ?? "youtube");
  const [socialUsage, setSocialUsage] = useState<{ usedPlatforms: Array<"linkedin" | "tiktok" | "instagram"> } | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<null | { message: string; highlight?: "creator" | "pro" | "studio" }>(null);
  const [autoGenerate, setAutoGenerate] = useState<null | {
    platform: "linkedin" | "tiktok" | "instagram";
    goal: string;
    followersCount: number;
    contentFocus: string;
  }>(null);

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

  useEffect(() => {
    const fromUrl = platformFromUrl();
    if (fromUrl && fromUrl !== platform) setPlatform(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSocialGrowthUsage()
      .then((data) => {
        if (!cancelled) setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any });
      })
      .catch(() => {
        if (!cancelled) setSocialUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [plan.plan]);

  useEffect(() => {
    const redirect = localStorage.getItem("postSignupRedirect");
    if (redirect !== "content-planner-weekly") return;

    const pendingPlatform = localStorage.getItem("pendingPlatform");
    const pendingGoal = localStorage.getItem("pendingWeeklyGoal") ?? "";
    const pendingFollowers = localStorage.getItem("pendingFollowerCount") ?? "";
    const pendingFocus = localStorage.getItem("pendingContentFocus") ?? "";
    if (pendingPlatform !== "linkedin" && pendingPlatform !== "tiktok" && pendingPlatform !== "instagram") return;
    const followersCount = Number(pendingFollowers);
    if (!pendingGoal.trim() || !Number.isFinite(followersCount) || followersCount < 0) return;

    setAutoGenerate({
      platform: pendingPlatform,
      goal: pendingGoal.trim(),
      followersCount: Math.max(0, Math.floor(followersCount)),
      contentFocus: pendingFocus.trim(),
    });
    setPlatform(pendingPlatform);

    const url = new URL(window.location.href);
    url.searchParams.set("tab", "content-planner");
    url.searchParams.set("platform", pendingPlatform);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const pageContainerClass = "mx-auto w-full max-w-[1440px] px-4 md:px-6 xl:px-8";
  const disabledTabs = {
    linkedin: (() => {
      const decision = canUsePlatform(plan.plan, "linkedin", socialUsage?.usedPlatforms);
      return decision.allowed ? undefined : { reason: decision.message };
    })(),
    tiktok: (() => {
      const decision = canUsePlatform(plan.plan, "tiktok", socialUsage?.usedPlatforms);
      return decision.allowed ? undefined : { reason: decision.message };
    })(),
    instagram: (() => {
      const decision = canUsePlatform(plan.plan, "instagram", socialUsage?.usedPlatforms);
      return decision.allowed ? undefined : { reason: decision.message };
    })(),
  } satisfies Partial<Record<GrowthPlatformTab, { reason: string }>>;

  return (
    <div className={pageContainerClass}>
      <PlatformTabs
        value={platform}
        onChange={(next) => {
          if (next === "youtube") {
            setPlatform(next);
            return;
          }
          const decision = canUsePlatform(plan.plan, next, socialUsage?.usedPlatforms);
          if (!decision.allowed) {
            toast({ title: "Upgrade required", description: decision.message });
            setUpgradePrompt({
              message: decision.message,
              highlight: decision.upgradePlan,
            });
            return;
          }
          setPlatform(next);
        }}
        disabledTabs={disabledTabs}
        className="sticky top-[120px] z-30 border border-white/10 sm:top-[140px]"
      />
      <div className="mt-6 min-w-0">
        {platform === "youtube" ? <ExistingYoutubeGrowthPlanner /> : null}
        {platform === "linkedin" ? (
          <SocialGrowthPlanner
            platform="linkedin"
            onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)}
            autoGenerateWeeklyPlan={autoGenerate?.platform === "linkedin" ? autoGenerate : null}
            onAutoGenerateComplete={() => {
              localStorage.removeItem("pendingWeeklyGoal");
              localStorage.removeItem("pendingFollowerCount");
              localStorage.removeItem("pendingContentFocus");
              localStorage.removeItem("pendingPlatform");
              localStorage.removeItem("postSignupRedirect");
              setAutoGenerate(null);
            }}
          />
        ) : null}
        {platform === "tiktok" ? (
          <SocialGrowthPlanner
            platform="tiktok"
            onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)}
            autoGenerateWeeklyPlan={autoGenerate?.platform === "tiktok" ? autoGenerate : null}
            onAutoGenerateComplete={() => {
              localStorage.removeItem("pendingWeeklyGoal");
              localStorage.removeItem("pendingFollowerCount");
              localStorage.removeItem("pendingContentFocus");
              localStorage.removeItem("pendingPlatform");
              localStorage.removeItem("postSignupRedirect");
              setAutoGenerate(null);
            }}
          />
        ) : null}
        {platform === "instagram" ? (
          <SocialGrowthPlanner
            platform="instagram"
            onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)}
            autoGenerateWeeklyPlan={autoGenerate?.platform === "instagram" ? autoGenerate : null}
            onAutoGenerateComplete={() => {
              localStorage.removeItem("pendingWeeklyGoal");
              localStorage.removeItem("pendingFollowerCount");
              localStorage.removeItem("pendingContentFocus");
              localStorage.removeItem("pendingPlatform");
              localStorage.removeItem("postSignupRedirect");
              setAutoGenerate(null);
            }}
          />
        ) : null}
      </div>

      {upgradePrompt ? (
        <PlanPickerModal
          onClose={() => setUpgradePrompt(null)}
          highlightPlan={upgradePrompt.highlight}
        />
      ) : null}
    </div>
  );
}

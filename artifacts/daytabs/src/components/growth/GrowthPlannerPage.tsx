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

export default function GrowthPlannerPage() {
  const { plan } = usePlan();
  const { toast } = useToast();
  const [platform, setPlatform] = useState<GrowthPlatformTab>(() => tabFromStorage() ?? "youtube");
  const [socialUsage, setSocialUsage] = useState<{ usedPlatforms: Array<"linkedin" | "tiktok" | "instagram"> } | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<null | { message: string; highlight?: "creator" | "pro" | "studio" }>(null);

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

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
        {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)} /> : null}
        {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)} /> : null}
        {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" onUsageChanged={() => fetchSocialGrowthUsage().then((data) => setSocialUsage({ usedPlatforms: (data.usedPlatforms ?? []) as any })).catch(() => null)} /> : null}
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

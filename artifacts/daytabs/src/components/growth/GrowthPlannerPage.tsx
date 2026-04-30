import { useEffect, useState } from "react";
import ExistingYoutubeGrowthPlanner from "@/components/growth/youtube/ExistingYoutubeGrowthPlanner";
import SocialGrowthPlanner from "@/components/growth/social/SocialGrowthPlanner";
import { PlatformTabs, type GrowthPlatformTab } from "@/components/growth/PlatformTabs";
import { fetchSocialGrowthAccess } from "@/components/growth/social/socialApi";
import type { SocialGrowthAccess } from "@/components/growth/social/types";

function tabFromStorage(): GrowthPlatformTab | null {
  const value = localStorage.getItem("daytabs_growth_platform");
  if (value === "youtube" || value === "linkedin" || value === "tiktok" || value === "instagram") return value;
  return null;
}

export default function GrowthPlannerPage() {
  const [platform, setPlatform] = useState<GrowthPlatformTab>(() => tabFromStorage() ?? "youtube");
  const [socialAccess, setSocialAccess] = useState<SocialGrowthAccess | null>(null);

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

  useEffect(() => {
    let alive = true;
    void fetchSocialGrowthAccess()
      .then((data) => {
        if (!alive) return;
        setSocialAccess(data);
      })
      .catch(() => {
        if (!alive) return;
        setSocialAccess(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const disabledTabs: Partial<Record<GrowthPlatformTab, string>> = (() => {
    if (!socialAccess) return {};
    if (socialAccess.platformLimit >= 3) return {};
    if (socialAccess.usedPlatforms.length < socialAccess.platformLimit) return {};
    const reason = "Upgrade to unlock more platforms";
    const locked: Partial<Record<GrowthPlatformTab, string>> = {};
    for (const tab of ["linkedin", "instagram", "tiktok"] as const) {
      if (!socialAccess.usedPlatforms.includes(tab)) locked[tab] = reason;
    }
    return locked;
  })();

  useEffect(() => {
    if (!socialAccess) return;
    if (!disabledTabs[platform]) return;
    const fallback = socialAccess.usedPlatforms[0] ?? "youtube";
    setPlatform(fallback as GrowthPlatformTab);
  }, [disabledTabs, platform, socialAccess]);

  const pageContainerClass = "mx-auto w-full max-w-[1440px] px-4 md:px-6 xl:px-8";

  return (
    <div className={pageContainerClass}>
      <PlatformTabs
        value={platform}
        onChange={setPlatform}
        className="sticky top-[120px] z-30 border border-white/10 sm:top-[140px]"
        disabledTabs={disabledTabs}
      />
      <div className="mt-6 min-w-0">
        {platform === "youtube" ? <ExistingYoutubeGrowthPlanner /> : null}
        {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" /> : null}
        {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" /> : null}
        {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" /> : null}
      </div>
    </div>
  );
}

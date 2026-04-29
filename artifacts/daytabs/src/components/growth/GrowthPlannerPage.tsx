import { useEffect, useMemo, useState } from "react";
import ExistingYoutubeGrowthPlanner from "@/components/growth/youtube/ExistingYoutubeGrowthPlanner";
import SocialGrowthPlanner from "@/components/growth/social/SocialGrowthPlanner";
import { PlatformMobileSwitcher, PlatformSidebar, type GrowthPlatformTab } from "@/components/growth/PlatformTabs";

function tabFromStorage(): GrowthPlatformTab | null {
  const value = localStorage.getItem("daytabs_growth_platform");
  if (value === "youtube" || value === "linkedin" || value === "tiktok" || value === "instagram") return value;
  return null;
}

export default function GrowthPlannerPage() {
  const [platform, setPlatform] = useState<GrowthPlatformTab>(() => tabFromStorage() ?? "youtube");

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

  const pageContainerClass = "mx-auto w-full max-w-[1440px] px-4 md:px-6 xl:px-8";

  return (
    <div className={pageContainerClass}>
      <div className="flex items-start gap-6">
        <PlatformSidebar value={platform} onChange={setPlatform} />
        <main className="min-w-0 flex-1">
          <PlatformMobileSwitcher value={platform} onChange={setPlatform} className="lg:hidden" />
          <div className="mt-6 min-w-0 lg:mt-0">
            {platform === "youtube" ? <ExistingYoutubeGrowthPlanner /> : null}
            {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" /> : null}
            {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" /> : null}
            {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

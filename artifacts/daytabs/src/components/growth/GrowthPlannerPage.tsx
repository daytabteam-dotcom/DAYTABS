import { useEffect, useMemo, useState } from "react";
import ExistingYoutubeGrowthPlanner from "@/components/growth/youtube/ExistingYoutubeGrowthPlanner";
import SocialGrowthPlanner from "@/components/growth/social/SocialGrowthPlanner";
import { PlatformSidebar, type GrowthPlatformTab } from "@/components/growth/PlatformTabs";

function tabFromStorage(): GrowthPlatformTab | null {
  const value = localStorage.getItem("daytabs_growth_platform");
  if (value === "youtube" || value === "linkedin" || value === "tiktok" || value === "instagram") return value;
  return null;
}

export default function GrowthPlannerPage() {
  const [platform, setPlatform] = useState<GrowthPlatformTab>(() => tabFromStorage() ?? "youtube");
  const wrapperClass = "max-w-[1440px] mx-auto px-8 xl:px-12";

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

  return (
    <div className={`${wrapperClass} py-8`}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[96px_1fr] md:items-stretch">
        <PlatformSidebar value={platform} onChange={setPlatform} />
        <main className="min-w-0">
          {platform === "youtube" ? <ExistingYoutubeGrowthPlanner /> : null}
          {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" /> : null}
          {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" /> : null}
          {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" /> : null}
        </main>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    localStorage.setItem("daytabs_growth_platform", platform);
  }, [platform]);

  return (
    <div>
      <PlatformSidebar value={platform} onChange={setPlatform} />
      <main className="mt-8 min-w-0 lg:mt-0 lg:pl-[120px]">
          {platform === "youtube" ? <ExistingYoutubeGrowthPlanner /> : null}
          {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" /> : null}
          {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" /> : null}
          {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" /> : null}
      </main>
    </div>
  );
}

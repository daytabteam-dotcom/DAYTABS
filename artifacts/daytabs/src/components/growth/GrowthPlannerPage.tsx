import { useEffect, useMemo, useState } from "react";
import ExistingYoutubeGrowthPlanner from "@/components/growth/youtube/ExistingYoutubeGrowthPlanner";
import SocialGrowthPlanner from "@/components/growth/social/SocialGrowthPlanner";
import { PlatformTabs, type GrowthPlatformTab } from "@/components/growth/PlatformTabs";

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

  if (platform === "youtube") {
    // Keep the YouTube growth UI and layout exactly as-is.
    return (
      <>
        <div className="max-w-7xl mx-auto px-4 pt-8">
          <PlatformTabs value={platform} onChange={setPlatform} />
        </div>
        <ExistingYoutubeGrowthPlanner />
      </>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4 py-8">
      <PlatformTabs value={platform} onChange={setPlatform} />
      {platform === "linkedin" ? <SocialGrowthPlanner platform="linkedin" /> : null}
      {platform === "tiktok" ? <SocialGrowthPlanner platform="tiktok" /> : null}
      {platform === "instagram" ? <SocialGrowthPlanner platform="instagram" /> : null}
    </div>
  );
}

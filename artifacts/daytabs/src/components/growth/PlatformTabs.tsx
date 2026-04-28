import type { LucideIcon } from "lucide-react";
import { Instagram, Linkedin, Music2, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

export type GrowthPlatformTab = "youtube" | "linkedin" | "tiktok" | "instagram";

const TABS: Array<{
  id: GrowthPlatformTab;
  label: string;
  description: string;
  Icon: LucideIcon;
}> = [
  {
    id: "youtube",
    label: "YouTube",
    description: "Connected to your channel and powered by real performance data.",
    Icon: Youtube,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Plan professional posts, founder stories, and educational content.",
    Icon: Linkedin,
  },
  {
    id: "tiktok",
    label: "TikTok",
    description: "Generate short-form video ideas built around fast hooks and visuals.",
    Icon: Music2,
  },
  {
    id: "instagram",
    label: "Instagram",
    description: "Plan Reels, carousels, captions, and visual content ideas.",
    Icon: Instagram,
  },
];

export function PlatformTabs({
  value,
  onChange,
}: {
  value: GrowthPlatformTab;
  onChange: (next: GrowthPlatformTab) => void;
}) {
  return (
    <div className="sticky top-4 z-20 overflow-hidden rounded-3xl bg-white/[0.055] p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl">
      <div className="flex w-full gap-1.5 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = value === tab.id;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "group relative flex min-w-[170px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl px-3 py-3 text-center transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                isActive
                  ? "bg-white/[0.14] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
                  : "text-white/58 hover:bg-white/[0.075] hover:text-white",
              )}
              aria-current={isActive ? "page" : undefined}
              title={tab.description}
            >
              {isActive ? <span className="pointer-events-none absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-white/65" /> : null}
              <span className="relative flex min-w-0 items-center justify-center gap-2.5">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all", isActive ? "bg-white/16 text-white" : "bg-white/[0.045] text-white/50 group-hover:text-white")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate text-sm font-semibold">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

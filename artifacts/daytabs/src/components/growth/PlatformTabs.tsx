import type { LucideIcon } from "lucide-react";
import { Instagram, Linkedin, Music2, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  className,
}: {
  value: GrowthPlatformTab;
  onChange: (next: GrowthPlatformTab) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "z-20 overflow-hidden rounded-3xl bg-white/[0.055] p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl",
        className,
      )}
    >
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

export function PlatformSidebar({
  value,
  onChange,
  className,
}: {
  value: GrowthPlatformTab;
  onChange: (next: GrowthPlatformTab) => void;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <aside
        className={cn(
          "hidden lg:flex sticky top-[120px] z-20",
          "h-[calc(100vh-48px)] max-h-[560px] min-h-[320px] w-[88px] shrink-0",
          "items-center justify-center rounded-[32px] bg-white/[0.04]",
          className,
        )}
      >
        <div className="flex h-full flex-col items-center justify-center gap-6">
          {TABS.map((tab) => {
            const isActive = value === tab.id;
            const Icon = tab.Icon;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={cn(
                      "group relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                      isActive
                        ? "bg-gradient-to-br from-violet-500/35 via-violet-500/18 to-fuchsia-500/20 text-white shadow-[0_0_0_1px_rgba(167,139,250,0.28),0_18px_46px_rgba(167,139,250,0.20)]"
                        : "bg-black/30 text-white/60 hover:bg-black/22 hover:text-white",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className={cn("h-5 w-5", isActive ? "text-violet-100" : "text-white/60 group-hover:text-white")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="border-white/10 bg-black/80 text-white">
                  <div className="text-xs font-semibold">{tab.label}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
}

export function PlatformMobileSwitcher({
  value,
  onChange,
  className,
}: {
  value: GrowthPlatformTab;
  onChange: (next: GrowthPlatformTab) => void;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <aside className={cn("w-full rounded-[28px] bg-white/[0.045] p-4", className)}>
        <div className="flex items-center justify-center">
          <div className="flex w-full items-center justify-start gap-6 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = value === tab.id;
              const Icon = tab.Icon;
              return (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onChange(tab.id)}
                      className={cn(
                        "group relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                        isActive
                          ? "bg-gradient-to-br from-violet-500/35 via-violet-500/18 to-fuchsia-500/20 text-white shadow-[0_0_0_1px_rgba(167,139,250,0.28),0_18px_46px_rgba(167,139,250,0.20)]"
                          : "bg-black/30 text-white/60 hover:bg-black/22 hover:text-white",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className={cn("h-5 w-5", isActive ? "text-violet-100" : "text-white/60 group-hover:text-white")} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="border-white/10 bg-black/80 text-white">
                    <div className="text-xs font-semibold">{tab.label}</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export function PlatformIconTabs({
  value,
  onChange,
}: {
  value: GrowthPlatformTab;
  onChange: (next: GrowthPlatformTab) => void;
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl">
        <div className="flex w-full gap-1.5 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = value === tab.id;
            const Icon = tab.Icon;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={cn(
                      "group relative grid h-12 min-w-12 place-items-center rounded-2xl border px-2 transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                      isActive
                        ? "border-violet-300/35 bg-violet-500/15 text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className={cn("h-5 w-5", isActive ? "text-violet-100" : "text-white/60 group-hover:text-white")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="border-white/10 bg-black/80 text-white">
                  <div className="text-xs font-semibold">{tab.label}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

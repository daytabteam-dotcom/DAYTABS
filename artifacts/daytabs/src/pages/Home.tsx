import React, { useEffect, useState, useRef } from "react";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import {
  LayoutDashboard,
  Wand2,
  MonitorPlay,
  Clapperboard,
  Zap,
  Video,
  FileText,
  TrendingUp,
  Lock,
  CalendarDays,
  Bell,
} from "lucide-react";
import VideoAnalyzerTab from "./tabs/VideoAnalyzerTab";
import TeleprompterTab from "./tabs/TeleprompterTab";
import ScriptPlannerTab from "./tabs/ScriptPlannerTab";
import GrowthPlannerTab, {
  getGrowthPlannerNotificationCounts,
  getGrowthPlannerNotifications,
} from "./tabs/YouTubeGrowthPlannerV2Tab";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import {
  usePlan,
  getPlanBadgeColor,
  PLAN_DISPLAY_NAMES,
  getDurationLimitLabel,
  getScriptPlannerChatLimit,
} from "@/hooks/use-plan";
import { useUser } from "@/hooks/use-user";
import {
  PanelPage,
  PanelHeader,
  PanelTitle,
  PanelSubtitle,
  PanelCard,
  PanelCardSoft,
} from "@/components/panel-system";

const TABS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard, desc: "Overview" },
  {
    id: "video-analyzer",
    label: "Video Analyzer",
    icon: Wand2,
    desc: "Full Analysis",
  },
  {
    id: "script-planner",
    label: "Script Planner",
    icon: Clapperboard,
    desc: "AI Scripts",
  },
  {
    id: "growth-planner",
    label: "Growth Planner",
    icon: CalendarDays,
    desc: "Studio",
  },
  {
    id: "teleprompter",
    label: "Teleprompter",
    icon: MonitorPlay,
    desc: "Read Live",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getTabFromUrl(): TabId {
  const tab = new URLSearchParams(window.location.search).get("tab");
  const match = TABS.find((item) => item.id === tab);
  return match?.id ?? "dashboard";
}

function updateTabUrl(tabId: TabId, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  if (tabId === "dashboard") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tabId);
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (
    `${window.location.pathname}${window.location.search}${window.location.hash}` ===
    nextUrl
  )
    return;
  window.history[mode === "push" ? "pushState" : "replaceState"](
    { tab: tabId },
    "",
    nextUrl,
  );
}

function NotificationBell({
  onOpenGrowthPlanner,
}: {
  onOpenGrowthPlanner: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState(() =>
    getGrowthPlannerNotificationCounts(),
  );
  const [notifications, setNotifications] = useState(() =>
    getGrowthPlannerNotifications(),
  );
  const [expandedType, setExpandedType] = useState<"today" | "overdue" | null>(
    null,
  );
  const total = counts.today + counts.overdue;

  useEffect(() => {
    const refresh = () => {
      setCounts(getGrowthPlannerNotificationCounts());
      setNotifications(getGrowthPlannerNotifications());
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("daytabs:growth-planner-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("daytabs:growth-planner-updated", refresh);
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="panel-card-soft panel-hover relative flex h-10 w-10 items-center justify-center text-white/55 hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber-300 text-amber-950 text-[11px] font-bold flex items-center justify-center">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="panel-card absolute right-0 z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {total > 0 && (
              <span className="text-xs text-amber-200">{total} active</span>
            )}
          </div>
          {total === 0 ? (
            <p className="text-sm text-white/45">
              No scheduled posts need attention right now.
            </p>
          ) : (
            <div className="space-y-2">
              {counts.today > 0 && (
                <NotificationGroup
                  type="today"
                  title={`${counts.today} post${counts.today === 1 ? "" : "s"} should be posted today.`}
                  helper="Click to see which cards are due."
                  expanded={expandedType === "today"}
                  items={notifications.filter((item) => item.type === "today")}
                  onToggle={() =>
                    setExpandedType(expandedType === "today" ? null : "today")
                  }
                  onOpenGrowthPlanner={(cardId) => {
                    setOpen(false);
                    onOpenGrowthPlanner();
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent("daytabs:growth-planner-focus-card", {
                          detail: { cardId },
                        }),
                      );
                    }, 120);
                  }}
                />
              )}
              {counts.overdue > 0 && (
                <NotificationGroup
                  type="overdue"
                  title={`${counts.overdue} overdue post${counts.overdue === 1 ? "" : "s"} need an update.`}
                  helper="Click to see which cards need a posted URL or skipped status."
                  expanded={expandedType === "overdue"}
                  items={notifications.filter(
                    (item) => item.type === "overdue",
                  )}
                  onToggle={() =>
                    setExpandedType(
                      expandedType === "overdue" ? null : "overdue",
                    )
                  }
                  onOpenGrowthPlanner={(cardId) => {
                    setOpen(false);
                    onOpenGrowthPlanner();
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent("daytabs:growth-planner-focus-card", {
                          detail: { cardId },
                        }),
                      );
                    }, 120);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationGroup({
  title,
  helper,
  expanded,
  items,
  onToggle,
  onOpenGrowthPlanner,
}: {
  type: "today" | "overdue";
  title: string;
  helper: string;
  expanded: boolean;
  items: ReturnType<typeof getGrowthPlannerNotifications>;
  onToggle: () => void;
  onOpenGrowthPlanner: (cardId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/10">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 hover:bg-amber-400/10 transition-colors"
      >
        <p className="text-sm font-semibold text-amber-100">{title}</p>
        <p className="text-xs text-amber-100/60 mt-1">{helper}</p>
      </button>
      {expanded && (
        <div className="border-t border-amber-400/15 p-2 space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenGrowthPlanner(item.id)}
              className="w-full rounded-md bg-background/50 border border-white/8 p-2 text-left hover:border-primary/35 transition-colors"
            >
              <p className="text-xs font-semibold text-white/85 leading-snug">
                {item.title}
              </p>
              <p className="text-[11px] text-white/40 mt-1">
                {item.platform} · {item.date} · {item.stage}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  desc,
  color,
  onClick,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="panel-card panel-hover group relative w-full p-5 text-left"
    >
      {badge && (
        <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
          {badge}
        </span>
      )}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
        {title}
      </p>
      <p className="text-xs text-white/40 mt-0.5">{desc}</p>
    </button>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: string;
}) {
  return (
    <PanelCard className="p-5">
      <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-3xl font-bold font-mono ${color ?? "text-white"}`}>
        {value}
      </p>
      {sublabel && <p className="text-xs text-white/30 mt-1">{sublabel}</p>}
    </PanelCard>
  );
}

function Dashboard({
  onNavigate,
  onUpgrade,
}: {
  onNavigate: (tab: TabId) => void;
  onUpgrade: () => void;
}) {
  const { user } = useUser();
  const { plan, getModeLimits, getScriptPlannerLimits } = usePlan();
  const norm = plan.normalizedPlan;
  const limits = getModeLimits("video-analyzer");
  const used = limits.uploadUsed;
  const remaining = limits.uploadsRemaining;
  const total = limits.uploadLimit;
  const isUnlimited = total === -1;
  const spLimits = getScriptPlannerLimits();
  const spChatLimit = getScriptPlannerChatLimit(norm);
  const isSpUnlimited = spChatLimit === -1;
  const badgeClass = getPlanBadgeColor(norm);
  const displayName = PLAN_DISPLAY_NAMES[norm] ?? "Free";
  const firstName =
    user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <PanelPage className="max-w-7xl space-y-8">
      <PanelHeader className="md:block">
        <div>
          <PanelTitle>Welcome back, {firstName}</PanelTitle>
          <PanelSubtitle>Here's what's ready for you today.</PanelSubtitle>
        </div>
      </PanelHeader>
      <PanelCard className="flex items-center gap-3 p-4 sm:p-5">
        <div
          className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`}
        >
          {displayName}
        </div>
        <div className="flex-1">
          {isUnlimited ? (
            <p className="text-sm text-white/60">
              Unlimited video analyses, no restrictions.
            </p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-white/40">
                  {used} of {total} analyses used this month
                </p>
                <p className="text-xs text-white/40">{remaining} remaining</p>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${remaining === 0 ? "bg-red-400" : remaining <= 3 ? "bg-amber-400" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {!plan.isPaid && (
          <button
            onClick={onUpgrade}
            className="rounded-lg border border-primary/30 bg-primary/14 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-primary transition-all hover:bg-primary/20"
          >
            Upgrade
          </button>
        )}
      </PanelCard>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Analyses used" value={used} sublabel="this month" />
        <StatCard
          label="Analyses left"
          value={isUnlimited ? "∞" : remaining}
          sublabel="this month"
          color={remaining === 0 ? "text-red-400" : "text-primary"}
        />
        <StatCard
          label="Script chats"
          value={isSpUnlimited ? "∞" : spLimits.chatsUsed}
          sublabel={
            isSpUnlimited ? "unlimited" : `of ${spChatLimit} this month`
          }
        />
        <StatCard
          label="Max duration"
          value={getDurationLimitLabel(norm)}
          sublabel="per video"
        />
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-4">
          Quick Actions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <QuickActionCard
            icon={Wand2}
            title="Analyze a Video"
            desc="Quality, editing, and publish insights"
            color="bg-primary/15 border border-primary/20 text-primary"
            onClick={() => onNavigate("video-analyzer")}
          />
          <QuickActionCard
            icon={Clapperboard}
            title="Plan a Script"
            desc="AI-powered script and shot planning"
            color="bg-blue-500/15 border border-blue-500/20 text-blue-400"
            onClick={() => onNavigate("script-planner")}
          />
          <QuickActionCard
            icon={MonitorPlay}
            title="Use Teleprompter"
            desc="Read your script live on screen"
            color="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400"
            onClick={() => onNavigate("teleprompter")}
          />
          <QuickActionCard
            icon={CalendarDays}
            title="Build Growth Calendar"
            desc="Studio social strategy and weekly plans"
            color="bg-pink-500/15 border border-pink-500/20 text-pink-400"
            onClick={() => onNavigate("growth-planner")}
            badge={!plan.isStudio ? "Studio" : undefined}
          />
          {!plan.isPaid && (
            <QuickActionCard
              icon={Zap}
              title="Upgrade Your Plan"
              desc="Unlock more analyses and features"
              color="bg-pink-500/15 border border-pink-500/20 text-pink-400"
              onClick={onUpgrade}
            />
          )}
        </div>
      </div>
      <PanelCardSoft className="p-5">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
          What DayTabs can do
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              icon: Video,
              label: "Video Quality Analysis",
              desc: "Lighting, audio, framing, and pacing scores",
            },
            {
              icon: FileText,
              label: "Editing Suggestions",
              desc: "Hook moments, cut points, and B-roll cues",
            },
            {
              icon: TrendingUp,
              label: "Publish Package",
              desc: "Optimized titles, descriptions, and tags",
              locked: !plan.isPaid,
            },
            {
              icon: Zap,
              label: "Short Clip Ideas",
              desc: "Best moments for Shorts, TikTok, and Reels",
              locked: !plan.isPaid,
            },
          ].map((feat, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-xl ${feat.locked ? "opacity-50" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${feat.locked ? "bg-white/5" : "bg-primary/10"}`}
              >
                {feat.locked ? (
                  <Lock className="w-4 h-4 text-white/30" />
                ) : (
                  <feat.icon className="w-4 h-4 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">
                  {feat.label}
                </p>
                <p className="text-xs text-white/40">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </PanelCardSoft>
    </PanelPage>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>(() => getTabFromUrl());
  const [activeTabHasData, setActiveTabHasData] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const exportFnRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    updateTabUrl(activeTab, "replace");

    function handlePopState() {
      doSwitch(getTabFromUrl(), "replace");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabClick(tabId: TabId) {
    if (tabId === activeTab) return;
    doSwitch(tabId, "push");
  }

  function doSwitch(tabId: TabId, historyMode: "push" | "replace" = "push") {
    updateTabUrl(tabId, historyMode);
    setActiveTab(tabId);
    setActiveTabHasData(false);
    exportFnRef.current = null;
  }

  const tabCallbacks = {
    onDataReady: () => setActiveTabHasData(true),
    onDataReset: () => {
      setActiveTabHasData(false);
      exportFnRef.current = null;
    },
    onRegisterExport: (fn: (() => Promise<void>) | null) => {
      exportFnRef.current = fn;
    },
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden selection:bg-primary/30">
      {showPlanModal && (
        <PlanPickerModal onClose={() => setShowPlanModal(false)} />
      )}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/panel-bg-purple-minimal.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-background/55" />
      </div>
      <header className="w-full border-b border-white/5 bg-background/45 backdrop-blur-xl sticky top-0 z-50">
        <div className="panel-shell h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => (window.location.href = "/")}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/logo.jpg`}
              alt="DayTabs"
              className="w-10 h-10 object-contain rounded-xl drop-shadow-[0_0_15px_rgba(124,58,237,0.5)]"
            />
            <span className="text-2xl font-display font-bold tracking-tight text-white">
              Day<span className="text-primary">Tabs</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell
              onOpenGrowthPlanner={() => handleTabClick("growth-planner")}
            />
            <UserProfileMenu />
          </div>
        </div>
      </header>
      <div className="w-full border-b border-white/5 bg-background/25 backdrop-blur-md sticky top-20 z-40">
        <div className="panel-shell">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-3">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`panel-hover flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 border ${
                    isActive
                      ? "bg-primary/16 text-primary border-primary/30 shadow-lg shadow-primary/10"
                      : "bg-white/[0.025] text-white/50 border-white/8 hover:text-white/85"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span
                    className={`hidden sm:block text-xs font-normal ${isActive ? "text-primary/70" : "text-white/30"}`}
                  >
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <main className="panel-shell py-10 md:py-12 relative z-10">
        {activeTab === "dashboard" && (
          <Dashboard
            onNavigate={handleTabClick}
            onUpgrade={() => setShowPlanModal(true)}
          />
        )}
        {activeTab === "video-analyzer" && (
          <VideoAnalyzerTab {...tabCallbacks} />
        )}
        {activeTab === "script-planner" && <ScriptPlannerTab />}
        {activeTab === "growth-planner" && <GrowthPlannerTab />}
        {activeTab === "teleprompter" && <TeleprompterTab />}
      </main>
    </div>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import {
  LayoutDashboard,
  Wand2,
  MonitorPlay,
  Zap,
  Video,
  FileText,
  TrendingUp,
  Lock,
  CalendarDays,
  Bell,
  Youtube,
  Captions,
} from "lucide-react";
import VideoAnalyzerTab from "./tabs/VideoAnalyzerTab";
import TeleprompterTab from "./tabs/TeleprompterTab";
import YouTubeAuditTab from "./tabs/YouTubeAuditTab";
import YouTubeGrowthPlannerV2Tab, {
  getGrowthPlannerNotificationCounts,
  getGrowthPlannerNotifications,
} from "./tabs/YouTubeGrowthPlannerV2Tab";
import GrowthPlannerPage from "@/components/growth/GrowthPlannerPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import {
  usePlan,
  getPlanBadgeColor,
  PLAN_DISPLAY_NAMES,
  getDurationLimitLabel,
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
import { useDayTabsI18n } from "@/lib/i18n";
import { AudioTranscriptPage } from "@/components/audio-transcript/AudioTranscriptPage";

const ALL_TABS = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "video-analyzer", icon: Wand2 },
  { id: "growth-planner", icon: CalendarDays },
  { id: "audio-transcript", icon: Captions },
  { id: "youtube-audit", icon: Youtube },
  { id: "teleprompter", icon: MonitorPlay },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

function getTabFromUrl(): TabId {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "content-planner") return "growth-planner";
  if (tab === "youtube-transcript") return "youtube-audit";
  if (tab === "script-planner") return "dashboard";
  const match = ALL_TABS.find((item) => item.id === tab);
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
  const { copy } = useDayTabsI18n();
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
        aria-label={copy.notifications.button}
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
            <p className="text-sm font-semibold text-white">{copy.notifications.title}</p>
            {total > 0 && (
              <span className="text-xs text-amber-200">{total} {copy.notifications.active}</span>
            )}
          </div>
          {total === 0 ? (
            <p className="text-sm text-white/45">
              {copy.notifications.empty}
            </p>
          ) : (
            <div className="space-y-2">
              {counts.today > 0 && (
                <NotificationGroup
                  type="today"
                  title={copy.notifications.dueToday(counts.today)}
                  helper={copy.notifications.dueTodayHelper}
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
                  title={copy.notifications.overdue(counts.overdue)}
                  helper={copy.notifications.overdueHelper}
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
  const { copy } = useDayTabsI18n();
  const { user } = useUser();
  const { plan, getModeLimits } = usePlan();
  const norm = plan.normalizedPlan;
  const limits = getModeLimits("video-analyzer");
  const used = limits.usageUsed;
  const remaining = limits.usageRemaining;
  const total = limits.usageLimit;
  const badgeClass = getPlanBadgeColor(norm);
  const displayName = PLAN_DISPLAY_NAMES[norm] ?? "Free";
  const firstName =
    user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <PanelPage className="max-w-7xl space-y-8">
      <PanelHeader className="md:block">
        <div>
          <PanelTitle>{copy.dashboard.welcome(firstName)}</PanelTitle>
          <PanelSubtitle>{copy.dashboard.subtitle}</PanelSubtitle>
        </div>
      </PanelHeader>
      <PanelCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div
              className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold ${badgeClass}`}
            >
              {displayName}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:hidden">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{copy.dashboard.used}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{used}</p>
                <p className="mt-1 text-xs text-white/35">of {total} {copy.dashboard.thisMonth}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{copy.dashboard.remaining}</p>
                <p className={`mt-2 text-2xl font-semibold ${remaining === 0 ? "text-red-400" : remaining <= 3 ? "text-amber-300" : "text-primary"}`}>{remaining}</p>
                <p className="mt-1 text-xs text-white/35">{copy.dashboard.analysesLeft}</p>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <p className="text-xs text-white/40">
                {copy.dashboard.monthlyUsageUsed(used, total)}
              </p>
              <span className="text-white/20">•</span>
              <p className="text-xs text-white/40">{copy.dashboard.remainingInline(remaining)}</p>
            </div>
          </div>
          {!plan.isPaid && (
            <button
              onClick={onUpgrade}
              className="w-full rounded-xl border border-primary/30 bg-primary/14 px-3 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary/20 sm:w-auto sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
            >
              {copy.dashboard.upgrade}
            </button>
          )}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-white/40">
            <p>{copy.dashboard.monthlyUsageProgress}</p>
            <p>{Math.max(0, Math.min(100, Math.round((used / total) * 100)))}%</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full transition-all ${remaining === 0 ? "bg-red-400" : remaining <= 3 ? "bg-amber-400" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-white/35">
            {copy.dashboard.monthlyLimitNote(limits.analysesLimit)}
          </p>
        </div>
      </PanelCard>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={copy.dashboard.statUsageUsed} value={used} sublabel={copy.dashboard.thisMonth} />
        <StatCard
          label={copy.dashboard.statUsageLeft}
          value={remaining}
          sublabel={copy.dashboard.thisMonth}
          color={remaining === 0 ? "text-red-400" : "text-primary"}
        />
        <StatCard
          label={copy.dashboard.statMaxDuration}
          value={getDurationLimitLabel(norm)}
          sublabel={copy.dashboard.perVideo}
        />
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-4">
          {copy.dashboard.quickActions}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <QuickActionCard
            icon={Wand2}
            title={copy.dashboard.actions.analyze.title}
            desc={copy.dashboard.actions.analyze.desc}
            color="bg-primary/15 border border-primary/20 text-primary"
            onClick={() => onNavigate("video-analyzer")}
          />
          <QuickActionCard
            icon={MonitorPlay}
            title={copy.dashboard.actions.teleprompter.title}
            desc={copy.dashboard.actions.teleprompter.desc}
            color="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400"
            onClick={() => onNavigate("teleprompter")}
          />
          <QuickActionCard
            icon={CalendarDays}
            title={copy.dashboard.actions.growth.title}
            desc={copy.dashboard.actions.growth.desc}
            color="bg-pink-500/15 border border-pink-500/20 text-pink-400"
            onClick={() => onNavigate("growth-planner")}
            badge={!plan.isStudio ? copy.dashboard.actions.growth.badge : undefined}
          />
          <QuickActionCard
            icon={Youtube}
            title={copy.dashboard.actions.audit.title}
            desc={copy.dashboard.actions.audit.desc}
            color="bg-red-500/15 border border-red-500/20 text-red-300"
            onClick={() => onNavigate("youtube-audit")}
            badge={!plan.isStudio ? copy.dashboard.actions.audit.badge : undefined}
          />
          {!plan.isPaid && (
            <QuickActionCard
              icon={Zap}
              title={copy.dashboard.actions.upgrade.title}
              desc={copy.dashboard.actions.upgrade.desc}
              color="bg-pink-500/15 border border-pink-500/20 text-pink-400"
              onClick={onUpgrade}
            />
          )}
        </div>
      </div>
      <PanelCardSoft className="p-5">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
          {copy.dashboard.capabilities}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              icon: Video,
              label: copy.dashboard.features.quality.label,
              desc: copy.dashboard.features.quality.desc,
            },
            {
              icon: FileText,
              label: copy.dashboard.features.editing.label,
              desc: copy.dashboard.features.editing.desc,
            },
            {
              icon: TrendingUp,
              label: copy.dashboard.features.publish.label,
              desc: copy.dashboard.features.publish.desc,
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
  const { copy } = useDayTabsI18n();
  const pageContainerClass = "mx-auto w-full max-w-[1440px] px-4 md:px-6 xl:px-8";
  const [activeTab, setActiveTab] = useState<TabId>(() => getTabFromUrl());
  const [activeTabHasData, setActiveTabHasData] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const exportFnRef = useRef<(() => Promise<void>) | null>(null);
  const { plan } = usePlan();

  useEffect(() => {
    updateTabUrl(activeTab, "replace");

    function handlePopState() {
      const next = getTabFromUrl();
      doSwitch(next, "replace");
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
        <div className={`${pageContainerClass} flex h-16 items-center justify-between sm:h-20`}>
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => (window.location.href = "/")}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/logo.jpg`}
              alt="DayTabs"
              className="h-9 w-9 rounded-xl object-contain drop-shadow-[0_0_15px_rgba(124,58,237,0.5)] sm:h-10 sm:w-10"
            />
            <span className="text-xl font-display font-bold tracking-tight text-white sm:text-2xl">
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
      <div className="w-full border-b border-white/5 bg-background/25 backdrop-blur-md sticky top-16 z-40 sm:top-20">
        <div className={pageContainerClass}>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-2.5 sm:py-3">
            {ALL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const tabCopy = copy.tabs[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`panel-hover flex shrink-0 items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all duration-200 border sm:gap-2.5 sm:px-4 sm:py-3 sm:rounded-2xl sm:text-sm ${
                    isActive
                      ? "bg-primary/16 text-primary border-primary/30 shadow-lg shadow-primary/10"
                      : "bg-white/[0.025] text-white/50 border-white/8 hover:text-white/85"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tabCopy.label}
                  <span
                    className={`hidden sm:block text-xs font-normal ${isActive ? "text-primary/70" : "text-white/30"}`}
                  >
                    {tabCopy.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <main className={`${pageContainerClass} relative z-10 py-6 sm:py-8 md:py-10`}>
        {activeTab === "dashboard" && (
          <Dashboard
            onNavigate={handleTabClick}
            onUpgrade={() => setShowPlanModal(true)}
          />
        )}
        {activeTab === "video-analyzer" && (
          <VideoAnalyzerTab {...tabCallbacks} />
        )}
        {activeTab === "growth-planner" && (
          <ErrorBoundary name="GrowthPlanner">
            <GrowthPlannerPage />
          </ErrorBoundary>
        )}
        {activeTab === "audio-transcript" && (
          <ErrorBoundary name="AudioTranscript">
            <AudioTranscriptPage />
          </ErrorBoundary>
        )}
        {activeTab === "youtube-audit" && <YouTubeAuditTab />}
        {activeTab === "teleprompter" && <TeleprompterTab />}
      </main>
    </div>
  );
}

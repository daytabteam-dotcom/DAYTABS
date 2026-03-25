import React, { useState, useRef } from "react";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { LayoutDashboard, Wand2, Globe, MonitorPlay, Clapperboard, Zap, Video, FileText, TrendingUp, Lock } from "lucide-react";
import VideoAnalyzerTab from "./tabs/VideoAnalyzerTab";
import DubbingTab from "./tabs/DubbingTab";
import TeleprompterTab from "./tabs/TeleprompterTab";
import ScriptPlannerTab from "./tabs/ScriptPlannerTab";
import { ExportWarningDialog } from "@/components/ExportWarningDialog";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { usePlan, getPlanBadgeColor, getPlanLabel, PLAN_DISPLAY_NAMES, getDurationLimitLabel, getFileSizeLimitLabel } from "@/hooks/use-plan";
import { useUser } from "@/hooks/use-user";

const TABS = [
  { id: "dashboard",       label: "Home",            icon: LayoutDashboard,  desc: "Overview" },
  { id: "video-analyzer",  label: "Video Analyzer",  icon: Wand2,            desc: "Full Analysis" },
  { id: "script-planner",  label: "Script Planner",  icon: Clapperboard,     desc: "AI Scripts" },
  { id: "teleprompter",    label: "Teleprompter",     icon: MonitorPlay,      desc: "Read Live" },
  { id: "dubbing",         label: "Dubbing",          icon: Globe,            desc: "Coming Soon" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
      className="group relative text-left w-full p-5 rounded-2xl border border-white/8 bg-background/40 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
    >
      {badge && (
        <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">{badge}</span>
      )}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">{title}</p>
      <p className="text-xs text-white/40 mt-0.5">{desc}</p>
    </button>
  );
}

function StatCard({ label, value, sublabel, color }: { label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div className="p-5 rounded-2xl border border-white/8 bg-background/40">
      <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold font-mono ${color ?? "text-white"}`}>{value}</p>
      {sublabel && <p className="text-xs text-white/30 mt-1">{sublabel}</p>}
    </div>
  );
}

function Dashboard({ onNavigate, onUpgrade }: { onNavigate: (tab: TabId) => void; onUpgrade: () => void }) {
  const { user } = useUser();
  const { plan, getModeLimits } = usePlan();
  const norm = plan.normalizedPlan;
  const limits = getModeLimits("video-analyzer");
  const used = limits.uploadUsed;
  const remaining = limits.uploadsRemaining;
  const total = limits.uploadLimit;
  const isUnlimited = total === -1;
  const badgeClass = getPlanBadgeColor(norm);
  const displayName = PLAN_DISPLAY_NAMES[norm] ?? "Free";
  const firstName = user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Welcome back, {firstName}</h1>
        <p className="text-white/40 mt-1">Here's what's ready for you today.</p>
      </div>

      <div className="flex items-center gap-3 p-4 rounded-2xl border border-white/8 bg-background/40">
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`}>{displayName}</div>
        <div className="flex-1">
          {isUnlimited ? (
            <p className="text-sm text-white/60">Unlimited video analyses — no restrictions.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-white/40">{used} of {total} analyses used this month</p>
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
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all whitespace-nowrap"
          >
            Upgrade
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Analyses used" value={used} sublabel="this month" />
        <StatCard label="Analyses left" value={isUnlimited ? "∞" : remaining} sublabel="this month" color={remaining === 0 ? "text-red-400" : "text-primary"} />
        <StatCard label="Max video size" value={getFileSizeLimitLabel(norm)} sublabel="per upload" />
        <StatCard label="Max duration" value={getDurationLimitLabel(norm)} sublabel="per video" />
      </div>

      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
            icon={Globe}
            title="Dub Your Video"
            desc="Translate and dub into other languages"
            color="bg-amber-500/15 border border-amber-500/20 text-amber-400"
            onClick={() => onNavigate("dubbing")}
            badge="Soon"
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

      <div className="p-5 rounded-2xl border border-white/8 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-3">What DayTabs can do</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: Video, label: "Video Quality Analysis", desc: "Lighting, audio, framing, and pacing scores" },
            { icon: FileText, label: "Editing Suggestions", desc: "Hook moments, cut points, and B-roll cues" },
            { icon: TrendingUp, label: "Publish Package", desc: "Optimized titles, descriptions, and tags", locked: !plan.isPaid },
            { icon: Zap, label: "Short Clip Ideas", desc: "Best moments for Shorts, TikTok, and Reels", locked: !plan.isPaid },
          ].map((feat, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${feat.locked ? "opacity-50" : ""}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${feat.locked ? "bg-white/5" : "bg-primary/10"}`}>
                {feat.locked ? <Lock className="w-4 h-4 text-white/30" /> : <feat.icon className="w-4 h-4 text-primary" />}
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">{feat.label}</p>
                <p className="text-xs text-white/40">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [activeTabHasData, setActiveTabHasData] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isDialogExporting, setIsDialogExporting] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const exportFnRef = useRef<(() => Promise<void>) | null>(null);

  function handleTabClick(tabId: TabId) {
    if (tabId === activeTab) return;
    if (activeTabHasData) {
      setPendingTab(tabId);
      setShowWarning(true);
    } else {
      doSwitch(tabId);
    }
  }

  function doSwitch(tabId: TabId) {
    setActiveTab(tabId);
    setActiveTabHasData(false);
    exportFnRef.current = null;
  }

  async function handleExportAndSwitch() {
    if (exportFnRef.current) {
      setIsDialogExporting(true);
      try { await exportFnRef.current(); } finally { setIsDialogExporting(false); }
    }
    if (pendingTab) doSwitch(pendingTab);
    setShowWarning(false);
    setPendingTab(null);
  }

  function handleSwitchAnyway() {
    if (pendingTab) doSwitch(pendingTab);
    setShowWarning(false);
    setPendingTab(null);
  }

  function handleCancel() {
    setShowWarning(false);
    setPendingTab(null);
  }

  const tabCallbacks = {
    onDataReady: () => setActiveTabHasData(true),
    onDataReset: () => { setActiveTabHasData(false); exportFnRef.current = null; },
    onRegisterExport: (fn: (() => Promise<void>) | null) => { exportFnRef.current = fn; },
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden selection:bg-primary/30">
      <ExportWarningDialog
        open={showWarning}
        isExporting={isDialogExporting}
        onExportAndSwitch={handleExportAndSwitch}
        onSwitchAnyway={handleSwitchAnyway}
        onCancel={handleCancel}
      />
      {showPlanModal && <PlanPickerModal onClose={() => setShowPlanModal(false)} />}

      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      <header className="w-full border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.href = "/"}>
            <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="DayTabs" className="w-10 h-10 object-contain rounded-lg drop-shadow-[0_0_15px_rgba(124,58,237,0.5)]" />
            <span className="text-2xl font-display font-bold tracking-tight text-white">Day<span className="text-primary">Tabs</span></span>
          </div>
          <UserProfileMenu />
        </div>
      </header>

      <div className="w-full border-b border-white/5 bg-background/30 backdrop-blur-md sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isComingSoon = tab.id === "dubbing";
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30 shadow-lg shadow-primary/10"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isComingSoon ? (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded border border-amber-500/20">Soon</span>
                  ) : (
                    <span className={`hidden sm:block text-xs font-normal ${isActive ? "text-primary/70" : "text-white/30"}`}>
                      {tab.desc}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 relative z-10">
        {activeTab === "dashboard"      && <Dashboard onNavigate={handleTabClick} onUpgrade={() => setShowPlanModal(true)} />}
        {activeTab === "video-analyzer" && <VideoAnalyzerTab {...tabCallbacks} />}
        {activeTab === "script-planner" && <ScriptPlannerTab />}
        {activeTab === "teleprompter"   && <TeleprompterTab />}
        {activeTab === "dubbing"        && <DubbingTab {...tabCallbacks} />}
      </main>
    </div>
  );
}

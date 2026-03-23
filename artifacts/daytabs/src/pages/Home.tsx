import React, { useState } from "react";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { Brain, Scissors, TrendingUp, Globe, MonitorPlay } from "lucide-react";
import PreEditTab from "./tabs/PreEditTab";
import EditingTab from "./tabs/EditingTab";
import PublishTab from "./tabs/PublishTab";
import DubbingTab from "./tabs/DubbingTab";
import TeleprompterTab from "./tabs/TeleprompterTab";

const TABS = [
  { id: "pre-edit",      label: "Pre-Edit",      icon: Brain,        desc: "Quality + Script" },
  { id: "editing",       label: "Editing",        icon: Scissors,     desc: "Cuts & Hooks" },
  { id: "publish",       label: "Publish",        icon: TrendingUp,   desc: "SEO & Subtitles" },
  { id: "dubbing",       label: "Dubbing",        icon: Globe,        desc: "Translate & Dub" },
  { id: "teleprompter",  label: "Teleprompter",   icon: MonitorPlay,  desc: "Read Your Script" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("pre-edit");

  return (
    <div className="min-h-screen relative overflow-x-hidden selection:bg-primary/30">
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      <header className="w-full border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("pre-edit")}>
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
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30 shadow-lg shadow-primary/10"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={`hidden sm:block text-xs font-normal ${isActive ? "text-primary/70" : "text-white/30"}`}>
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 relative z-10">
        {activeTab === "pre-edit"     && <PreEditTab />}
        {activeTab === "editing"      && <EditingTab />}
        {activeTab === "publish"      && <PublishTab />}
        {activeTab === "dubbing"      && <DubbingTab />}
        {activeTab === "teleprompter" && <TeleprompterTab />}
      </main>
    </div>
  );
}

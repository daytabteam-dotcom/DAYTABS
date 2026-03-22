import React, { useState } from "react";
import { AnalysisResult } from "@workspace/api-client-react";
import { Video, Sparkles, TrendingUp, Mic } from "lucide-react";
import { QualityTab } from "./QualityTab";
import { ContentTab } from "./ContentTab";
import { SeoTab } from "./SeoTab";
import { SubtitlesTab } from "./SubtitlesTab";

interface ResultsContainerProps {
  data: AnalysisResult;
  replaceAudio?: boolean;
}

const TABS = [
  { id: "quality", label: "Quality", icon: Video },
  { id: "content", label: "Content", icon: Sparkles },
  { id: "seo", label: "SEO", icon: TrendingUp },
  { id: "subtitles", label: "Subtitles", icon: Mic }
];

export function ResultsContainer({ data, replaceAudio }: ResultsContainerProps) {
  const [activeTab, setActiveTab] = useState("quality");

  return (
    <div className="w-full max-w-7xl mx-auto py-8">
      <div className="mb-12 text-center space-y-4">
        <h2 className="text-4xl font-extrabold tracking-tight">Analysis Complete</h2>
        <p className="text-muted-foreground text-lg">Optimized for <span className="text-primary font-semibold capitalize">{data.platform.replace('_', ' ')}</span></p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mb-10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all duration-300
                ${isActive 
                  ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105' 
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-white'}
              `}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="relative min-h-[500px]">
        {activeTab === "quality" && <QualityTab data={data.quality} />}
        {activeTab === "content" && <ContentTab data={data.content} />}
        {activeTab === "seo" && <SeoTab data={data.seo} />}
        {activeTab === "subtitles" && <SubtitlesTab jobId={data.jobId} data={data.subtitles} replaceAudio={replaceAudio} />}
      </div>
    </div>
  );
}

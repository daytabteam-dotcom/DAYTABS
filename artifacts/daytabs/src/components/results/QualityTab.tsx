import React from "react";
import { QualityResult, MetricItem } from "@workspace/api-client-react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2, AlertTriangle, XCircle, Info,
  Lamp, Sun, Contrast, Focus, Gauge, Palette, Image, Frame, Volume2, Mic2, Waves, Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

interface QualityTabProps {
  data: QualityResult;
}

const METRIC_ICONS: Record<string, LucideIcon> = {
  lighting: Lamp,
  brightness: Sun,
  contrast: Contrast,
  sharpness: Focus,
  stability: Gauge,
  colorbalance: Palette,
  colortemperature: Palette,
  background: Image,
  framing: Frame,
  audiovolume: Volume2,
  audioclarity: Mic2,
  backgroundnoise: Waves,
  fillerwords: Mic2,
  pacing: Gauge,
};

function getMetricIcon(title: string): LucideIcon {
  return METRIC_ICONS[title.replace(/\s+/g, "").toLowerCase()] ?? Sparkles;
}

function MetricCard({ title, metric }: { title: string, metric?: MetricItem }) {
  if (!metric) return null;

  const colorMap: Record<string, string> = {
    'good': 'text-green-400 bg-green-400/10 border-green-400/20',
    'ok': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    'poor': 'text-red-400 bg-red-400/10 border-red-400/20'
  };

  const IconMap: Record<string, React.ReactNode> = {
    'good': <CheckCircle2 className="w-5 h-5 text-green-400" />,
    'ok': <AlertTriangle className="w-5 h-5 text-yellow-400" />,
    'poor': <XCircle className="w-5 h-5 text-red-400" />
  };

  const levelColor = colorMap[metric.level.toLowerCase()] || colorMap['ok'];
  const StatusIcon = IconMap[metric.level.toLowerCase()] || IconMap['ok'];
  const MetricIcon = getMetricIcon(title);
  const displayTitle = title.replace(/([A-Z])/g, ' $1').trim();

  return (
    <div className="bg-background rounded-2xl p-5 border border-border hover:border-primary/30 transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-lg font-bold text-foreground capitalize flex items-center gap-2">
            <MetricIcon className="w-5 h-5 text-muted-foreground" />
            {displayTitle}
          </h4>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 border ${levelColor}`}>
          {StatusIcon}
          {metric.level}
        </div>
      </div>
      
      <p className="text-sm text-foreground/80 mb-3">{metric.assessment}</p>
      
      {metric.effect && (
        <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-secondary/50">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{metric.effect}</p>
        </div>
      )}

      {metric.suggestions && metric.suggestions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fixes</h5>
          <ul className="space-y-1.5">
            {metric.suggestions.map((s, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start before:content-['•'] before:text-primary before:mr-2">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function QualityTab({ data }: QualityTabProps) {
  const scoreColor = data.score >= 80 ? '#4ade80' : data.score >= 60 ? '#facc15' : '#f87171';
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (data.score / 100) * circumference;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Score Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 glass-card p-8 rounded-3xl">
        <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90 drop-shadow-xl" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={radius} className="stroke-secondary" strokeWidth="12" fill="none" />
            <motion.circle 
              cx="70" cy="70" r={radius} 
              stroke={scoreColor} 
              strokeWidth="12" 
              fill="none" 
              strokeLinecap="round"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{ strokeDasharray: circumference }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-black font-mono tracking-tighter" style={{ color: scoreColor }}>{data.score}</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">Score</span>
          </div>
        </div>
        
        <div className="flex-1">
          <h2 className="text-3xl font-bold mb-4">Overall Quality Assessment</h2>
          <div className="bg-secondary/50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Key Suggestions</h3>
            <ul className="space-y-2">
              {data.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span className="text-foreground/90">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div>
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-6 bg-primary rounded-full" />
          Visual & Audio Breakdown
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MetricCard title="lighting" metric={data.lighting} />
          <MetricCard title="brightness" metric={data.brightness} />
          <MetricCard title="contrast" metric={data.contrast} />
          <MetricCard title="sharpness" metric={data.sharpness} />
          <MetricCard title="stability" metric={data.stability} />
          <MetricCard title="colorBalance" metric={data.colorBalance} />
          <MetricCard title="background" metric={data.background} />
          <MetricCard title="framing" metric={data.framing} />
          <MetricCard title="audioVolume" metric={data.audioVolume} />
          <MetricCard title="audioClarity" metric={data.audioClarity} />
          <MetricCard title="backgroundNoise" metric={data.backgroundNoise} />
          <MetricCard title="fillerWords" metric={data.fillerWords} />
          <MetricCard title="pacing" metric={data.pacing} />
        </div>
      </div>
    </motion.div>
  );
}

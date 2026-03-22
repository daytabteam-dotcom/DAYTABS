import React from "react";
import { ContentResult } from "@workspace/api-client-react";
import { Sparkles, Target, Zap, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export function ContentTab({ data }: { data: ContentResult }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card rounded-3xl p-6 flex flex-col justify-center border-l-4 border-l-primary">
          <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Hook Score
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-foreground">{data.hookScore}</span>
            <span className="text-xl text-muted-foreground">/100</span>
          </div>
        </div>
        
        <div className="glass-card rounded-3xl p-6 md:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 h-full">
            <div>
              <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Target Audience
              </div>
              <p className="text-foreground/90">{data.audience}</p>
            </div>
            <div>
              <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Problem Solved
              </div>
              <p className="text-foreground/90">{data.problemSolved}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hooks */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/20 text-primary"><Zap className="w-5 h-5" /></span>
            Suggested Hooks
          </h3>
          <div className="space-y-3">
            {data.hooks.map((hook, i) => (
              <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-foreground text-lg leading-snug">{hook}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Improvements */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-green-500/20 text-green-400"><Target className="w-5 h-5" /></span>
            Content Improvements
          </h3>
          <div className="space-y-3">
            {data.improvements.map((imp, i) => (
              <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <p className="text-foreground/90">{imp}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weak Sections */}
      {data.weakSections && data.weakSections.length > 0 && (
        <div className="pt-6">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
            <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400"><AlertCircle className="w-5 h-5" /></span>
            Weak Sections Detected
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.weakSections.map((ws, i) => (
              <div key={i} className={`p-5 rounded-2xl border ${ws.color === 'red' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                <div className="flex justify-between items-start mb-3">
                  <span className={`font-mono text-xs font-bold px-2 py-1 rounded bg-black/20 ${ws.color === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {ws.start} - {ws.end}
                  </span>
                </div>
                <p className="text-foreground italic mb-4">"{ws.text}"</p>
                <div className="text-sm bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="font-semibold block mb-1">Reason:</span>
                  {ws.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Dummy export to keep the file structure intact
import { CheckCircle2 } from "lucide-react";

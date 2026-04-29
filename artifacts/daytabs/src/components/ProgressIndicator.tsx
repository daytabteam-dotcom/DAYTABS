import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const ALL_STEPS = [
  { id: "uploading",            label: "Uploading Video",           modes: ["pre-edit","editing","publish","dubbing"] },
  { id: "extracting_audio",     label: "Extracting Audio",          modes: ["pre-edit","editing","publish","dubbing"] },
  { id: "transcribing",         label: "Transcribing Speech",       modes: ["pre-edit","editing","publish","dubbing"] },
  { id: "extracting_frames",    label: "Extracting Frames",         modes: ["pre-edit"] },
  { id: "analyzing_visual",     label: "Analyzing Visuals",         modes: ["pre-edit"] },
  { id: "analyzing_audio",      label: "Analyzing Audio Quality",   modes: ["pre-edit"] },
  { id: "analyzing_content",    label: "Identifying Editing Points",modes: ["editing"] },
  { id: "generating_seo",       label: "Optimizing SEO",            modes: ["publish"] },
  { id: "generating_subtitles", label: "Generating Subtitles",      modes: ["publish"] },
  { id: "translating",          label: "Translating Script",        modes: ["dubbing"] },
  { id: "generating_audio",     label: "Generating AI Voice",       modes: ["dubbing"] },
  { id: "merging_video",        label: "Merging Audio & Video",     modes: ["dubbing"] },
  { id: "complete",             label: "Finalizing Results",        modes: ["pre-edit","editing","publish","dubbing"] },
];

interface ProgressIndicatorProps {
  currentStep: string;
  progress: number;
  mode?: "pre-edit" | "editing" | "publish" | "dubbing";
}

export function ProgressIndicator({ currentStep, progress, mode }: ProgressIndicatorProps) {
  const STEPS = mode ? ALL_STEPS.filter(s => s.modes.includes(mode)) : ALL_STEPS;

  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  const rawIndex = currentIndex === -1 ? 0 : currentIndex;

  // Never allow the active step to go backwards
  const maxIndexRef = useRef(rawIndex);
  if (rawIndex > maxIndexRef.current) maxIndexRef.current = rawIndex;
  const activeIndex = maxIndexRef.current;

  return (
    <div className="w-full max-w-2xl mx-auto py-12 px-6 glass-card rounded-3xl">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-white to-white/70 mb-4">
          Analyzing Your Content
        </h2>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-linear-to-r from-primary to-purple-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-primary font-mono mt-3 font-semibold">{Math.round(progress)}% Complete</p>
      </div>

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-white/10 before:to-transparent">
        {STEPS.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isActive = index === activeIndex;
          const isPending = index > activeIndex;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: isPending ? 0.3 : 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group"
            >
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-xl z-10
                transition-all duration-500
                ${isCompleted ? "bg-primary border-primary text-white" : ""}
                ${isActive ? "bg-background border-primary text-primary scale-110 shadow-primary/30" : ""}
                ${isPending ? "bg-background border-border text-muted-foreground" : ""}
              `}>
                {isCompleted ? <Check className="w-5 h-5" /> : isActive ? <Loader2 className="w-5 h-5 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
              </div>

              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl transition-all duration-300
                ${isActive ? "bg-white/5 border border-white/10 scale-[1.02]" : ""}
              `}>
                <div className={`font-semibold ${isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </div>
                {isActive && <div className="text-sm text-muted-foreground mt-1">Processing…</div>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

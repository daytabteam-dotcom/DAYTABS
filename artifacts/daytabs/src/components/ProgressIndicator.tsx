import React from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const STEPS = [
  { id: "uploading", label: "Uploading Video" },
  { id: "extracting_audio", label: "Extracting Audio" },
  { id: "extracting_frames", label: "Extracting Frames" },
  { id: "transcribing", label: "Transcribing Speech" },
  { id: "analyzing_visual", label: "Analyzing Visuals" },
  { id: "analyzing_audio", label: "Analyzing Audio Quality" },
  { id: "analyzing_content", label: "Generating Hooks & Content" },
  { id: "generating_seo", label: "Optimizing SEO" },
  { id: "generating_subtitles", label: "Generating Subtitles" },
  { id: "complete", label: "Finalizing Results" }
];

interface ProgressIndicatorProps {
  currentStep: string;
  progress: number;
}

export function ProgressIndicator({ currentStep, progress }: ProgressIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="w-full max-w-2xl mx-auto py-12 px-6 glass-card rounded-3xl">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-4">
          Analyzing Your Content
        </h2>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-primary to-purple-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-primary font-mono mt-3 font-semibold">{Math.round(progress)}% Complete</p>
      </div>

      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
        {STEPS.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isActive = index === activeIndex;
          const isPending = index > activeIndex;

          return (
            <motion.div 
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: isPending ? 0.3 : 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
            >
              {/* Icon */}
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-xl z-10
                transition-all duration-500
                ${isCompleted ? 'bg-primary border-primary text-white' : ''}
                ${isActive ? 'bg-background border-primary text-primary scale-110 shadow-primary/30' : ''}
                ${isPending ? 'bg-background border-border text-muted-foreground' : ''}
              `}>
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-current opacity-50" />
                )}
              </div>
              
              {/* Text */}
              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl transition-all duration-300
                ${isActive ? 'bg-white/5 border border-white/10 scale-[1.02]' : ''}
              `}>
                <div className={`font-semibold ${isActive ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </div>
                {isActive && (
                  <div className="text-sm text-muted-foreground mt-1">Processing...</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

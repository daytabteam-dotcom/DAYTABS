import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Lock, Zap, TrendingUp, ArrowRight } from "lucide-react";

export interface LimitError {
  code: string;
  title: string;
  message: string;
  action?: { label: string; route?: string; reload?: boolean };
  secondary_action?: { label: string; disabled?: boolean; route?: string };
  meta?: {
    used?: number;
    limit?: number;
    resets_on?: string;
    upgrade_to?: string;
    current_plan?: string;
    feature?: string;
  };
}

const PLAN_COMPARE: Record<string, {
  current: { label: string; color: string };
  next: { label: string; color: string; price: string; perks: string[] };
}> = {
  free: {
    current: { label: "Free", color: "text-violet-400" },
    next: {
      label: "Creator",
      color: "text-amber-400",
      price: "$19/mo",
      perks: ["15 video analyses/month", "Publish package (titles, descriptions, tags)", "Short clip ideas for TikTok & Reels"],
    },
  },
  creator: {
    current: { label: "Creator", color: "text-amber-400" },
    next: {
      label: "Pro",
      color: "text-emerald-400",
      price: "$39/mo",
      perks: ["40 video analyses/month", "Subtitle (.srt) file download", "GPT-4o powered scripts (faster & smarter)"],
    },
  },
  pro: {
    current: { label: "Pro", color: "text-emerald-400" },
    next: {
      label: "Studio",
      color: "text-pink-400",
      price: "$89/mo",
      perks: ["Unlimited video analyses", "Priority processing queue", "2 GB video file uploads"],
    },
  },
};

interface UpgradeErrorModalProps {
  error: LimitError | null;
  onClose: () => void;
}

export function UpgradeErrorModal({ error, onClose }: UpgradeErrorModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (error) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, [error, handleKeyDown]);

  function handleAction() {
    if (!error?.action) return;
    if (error.action.reload) {
      window.location.reload();
      return;
    }
    if (error.action.route) {
      window.location.href = error.action.route;
    }
    onClose();
  }

  const isMonthlyLimit = error?.code === "MONTHLY_LIMIT_REACHED" || error?.code === "CHAT_LIMIT_REACHED";
  const isFeatureLocked = error?.code === "FEATURE_LOCKED";
  const currentPlan = (error?.meta?.current_plan ?? "free") as keyof typeof PLAN_COMPARE;
  const comparePlan = PLAN_COMPARE[currentPlan];

  const accentColor =
    error?.code === "FILE_TOO_LARGE" || error?.code === "VIDEO_TOO_LONG" ? "orange" :
    error?.code === "FEATURE_LOCKED" ? "purple" :
    "amber";

  const accentClasses = {
    orange: { bg: "bg-orange-500/15", border: "border-orange-500/20", text: "text-orange-400", btn: "bg-orange-500 hover:bg-orange-600 shadow-orange-500/25" },
    purple: { bg: "bg-primary/15", border: "border-primary/20", text: "text-primary", btn: "bg-primary hover:bg-primary/90 shadow-primary/25" },
    amber:  { bg: "bg-amber-500/15", border: "border-amber-500/20", text: "text-amber-400", btn: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25" },
  }[accentColor];

  const Icon = isFeatureLocked ? Lock : isMonthlyLimit ? Zap : AlertTriangle;

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md bg-[#130d2b] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex items-start gap-4">
                <div className={`shrink-0 w-10 h-10 rounded-xl ${accentClasses.bg} border ${accentClasses.border} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${accentClasses.text}`} />
                </div>
                <div className="pr-6">
                  <h3 className="font-bold text-white text-base leading-snug">{error.title}</h3>
                  <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{error.message}</p>
                </div>
              </div>
            </div>

            {/* Plan comparison (only for monthly limits) */}
            {isMonthlyLimit && comparePlan && (
              <div className="mx-6 mb-4 rounded-xl border border-white/8 overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-white/8">
                  <div className="p-3 bg-white/3">
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1">Current</p>
                    <p className={`text-sm font-bold ${comparePlan.current.color}`}>{comparePlan.current.label}</p>
                    <p className="text-xs text-white/30 mt-1">
                      {error.meta?.limit !== undefined && error.meta.limit > 0
                        ? `${error.meta.limit} analyses/month`
                        : "Limited"}
                    </p>
                  </div>
                  <div className="p-3 bg-primary/5">
                    <p className="text-xs font-semibold text-primary/60 uppercase tracking-wider mb-1">Upgrade to</p>
                    <p className={`text-sm font-bold ${comparePlan.next.color}`}>{comparePlan.next.label}</p>
                    <p className="text-xs text-white/40 mt-1">{comparePlan.next.price}</p>
                  </div>
                </div>
                <div className="px-3 pb-3 pt-2 border-t border-white/8 space-y-1">
                  {comparePlan.next.perks.map((perk, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-primary shrink-0" />
                      <p className="text-xs text-white/60">{perk}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature locked preview */}
            {isFeatureLocked && error.meta?.feature && (
              <div className="mx-6 mb-4 p-3 rounded-xl bg-primary/8 border border-primary/15">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <p className="text-xs text-primary/80">
                    {error.meta.feature === "publish_package" && "Titles, descriptions, tags & chapters, optimized for each platform"}
                    {error.meta.feature === "short_clip_ideas" && "Best clip moments for TikTok, Reels & YouTube Shorts"}
                    {error.meta.feature === "subtitle_download" && "YouTube-compatible .srt subtitle file from your transcript"}
                    {!["publish_package", "short_clip_ideas", "subtitle_download"].includes(error.meta.feature) && "Upgrade to unlock this feature"}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-6 pb-6 space-y-2.5">
              {error.action && (
                <button
                  onClick={handleAction}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all shadow-lg ${accentClasses.btn}`}
                >
                  {error.action.reload ? "Try Again" : (
                    <>
                      {error.action.label}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}

              {error.secondary_action && (
                error.secondary_action.disabled ? (
                  <p className="text-center text-xs text-white/30 py-1">{error.secondary_action.label}</p>
                ) : (
                  <button
                    onClick={() => {
                      if (error.secondary_action?.route) window.location.href = error.secondary_action.route;
                      onClose();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-white/50 hover:text-white/70 font-medium text-sm transition-colors"
                  >
                    {error.secondary_action.label}
                  </button>
                )
              )}

              <button
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl text-white/30 hover:text-white/50 font-medium text-sm transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

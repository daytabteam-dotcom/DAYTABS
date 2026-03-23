import { useState } from "react";
import { Lock, Crown } from "lucide-react";
import { PlanPickerModal } from "@/components/PlanPickerModal";

interface LockedContentProps {
  children: React.ReactNode;
  locked: boolean;
  label?: string;
  requiredPlan?: "premium" | "professional";
  className?: string;
}

export function LockedContent({
  children,
  locked,
  label = "Upgrade to unlock",
  className = "",
}: LockedContentProps) {
  const [showPicker, setShowPicker] = useState(false);

  if (!locked) return <>{children}</>;

  return (
    <>
      <div className={`relative rounded-xl overflow-hidden ${className}`}>
        <div className="pointer-events-none select-none blur-sm opacity-60" aria-hidden>
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d0814]/60 backdrop-blur-[2px] rounded-xl z-10">
          <div className="flex items-center gap-2 bg-[#1a1025] border border-violet-500/30 rounded-xl px-4 py-3 shadow-2xl shadow-violet-500/10">
            <Lock className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-sm font-medium text-white/80">{label}</span>
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 ml-2 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Crown className="w-3 h-3" />
              Upgrade
            </button>
          </div>
        </div>
      </div>

      {showPicker && <PlanPickerModal onClose={() => setShowPicker(false)} />}
    </>
  );
}

export function LockedBadge({ requiredPlan: _requiredPlan = "premium" }: { requiredPlan?: "premium" | "professional" }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-md text-xs text-violet-400 font-medium transition-colors cursor-pointer"
        title="Upgrade to unlock"
      >
        <Lock className="w-2.5 h-2.5" />
        Pro
      </button>

      {showPicker && <PlanPickerModal onClose={() => setShowPicker(false)} />}
    </>
  );
}

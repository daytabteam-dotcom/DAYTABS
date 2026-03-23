import { useEffect } from "react";
import { Globe, Clock, Sparkles } from "lucide-react";

interface TabProps {
  onDataReady: () => void;
  onDataReset: () => void;
  onRegisterExport: (fn: (() => Promise<void>) | null) => void;
}

export default function DubbingTab({ onDataReset, onRegisterExport }: TabProps) {
  useEffect(() => {
    onDataReset();
    onRegisterExport(null);
  }, [onDataReset, onRegisterExport]);

  const features = [
    "AI-powered voice cloning & dubbing",
    "Translate to 12+ languages",
    "6 professional AI voices",
    "One-click audio sync & export",
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon */}
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center shadow-2xl shadow-indigo-500/10">
            <Globe className="w-12 h-12 text-indigo-400/80" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-500/90 border-2 border-[#0d0814] flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Coming Soon</span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">AI Dubbing</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            We're building an incredible AI dubbing experience. Translate and re-voice your videos into any language with natural-sounding voices.
          </p>
        </div>

        {/* Feature list */}
        <ul className="w-full space-y-2 text-left">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/3 border border-white/6">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 shrink-0" />
              <span className="text-sm text-white/60">{f}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-white/25">We'll notify you when Dubbing is available for your account.</p>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Globe, Clock, Sparkles, Bell, Check, Loader2 } from "lucide-react";

interface TabProps {
  onDataReady: () => void;
  onDataReset: () => void;
  onRegisterExport: (fn: (() => Promise<void>) | null) => void;
}

export default function DubbingTab({ onDataReset, onRegisterExport }: TabProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDataReset();
    onRegisterExport(null);
  }, [onDataReset, onRegisterExport]);

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("daytabs_token");
      const res = await fetch("/api/dubbing/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Failed to submit");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { label: "AI voice cloning and dubbing" },
    { label: "Translate to 12+ languages" },
    { label: "6 professional AI voices" },
    { label: "One-click audio sync and export" },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center shadow-2xl shadow-indigo-500/10">
            <Globe className="w-12 h-12 text-indigo-400/80" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-500/90 border-2 border-[#0d0814] flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Coming Soon</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">AI Dubbing</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Translate and re-voice your videos into any language with natural AI voices. Reach global audiences without re-recording.
          </p>
        </div>

        <ul className="w-full space-y-2.5">
          {features.map(f => (
            <li key={f.label} className="flex items-center gap-3 text-sm text-white/60">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-indigo-400" />
              </div>
              {f.label}
            </li>
          ))}
        </ul>

        {submitted ? (
          <div className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm font-medium">
            <Check className="w-4 h-4" />
            Got it! We'll notify you when dubbing launches.
          </div>
        ) : (
          <form onSubmit={handleNotify} className="w-full space-y-3">
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
                className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-colors disabled:opacity-50"
              />
            </div>
            {error && (
              <p className="text-xs text-red-400 text-left">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              {loading ? "Submitting..." : "Notify me when it's ready"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

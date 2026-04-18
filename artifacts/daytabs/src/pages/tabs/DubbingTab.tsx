import { useEffect, useState } from "react";
import { Globe, Clock, Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="max-w-4xl mx-auto py-8">
      <div className="rounded-lg border border-white/8 bg-white/[0.025] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-300 text-amber-950 flex items-center justify-center">
                  <Clock className="w-3 h-3" />
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/35">Coming soon</p>
                <h2 className="text-3xl font-bold text-white">AI Dubbing</h2>
              </div>
            </div>
            <p className="text-white/50 text-sm leading-relaxed">
              Translate and re-voice videos with natural AI voices while keeping timing and export quality predictable.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {features.map(f => (
                <div key={f.label} className="flex items-center gap-3 rounded-lg border border-white/8 bg-background/40 p-3 text-sm text-white/60">
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          <div className="w-full md:w-[320px]">
            {submitted ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-sm font-medium">
                <Check className="w-4 h-4" />
                We'll notify you when dubbing launches.
              </div>
            ) : (
              <form onSubmit={handleNotify} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-primary/45 transition-colors disabled:opacity-50"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                  {loading ? "Submitting..." : "Notify me"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

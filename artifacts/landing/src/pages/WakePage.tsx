import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { getApiHealthUrl, getCoreAppUrl } from "@/lib/runtime";

type WakeState = "warming" | "ready" | "delayed";

export default function WakePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") || undefined;
  const requestedTarget = params.get("target");
  const destination = requestedTarget || getCoreAppUrl(token);
  const [state, setState] = useState<WakeState>("warming");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const healthUrl = getApiHealthUrl();

    const tick = window.setInterval(() => {
      setSeconds((value) => value + 1);
      setProgress((value) => Math.min(92, value + (value < 60 ? 10 : 4)));
    }, 1000);

    const wake = async () => {
      while (!cancelled) {
        attempts += 1;
        try {
          const response = await fetch(healthUrl, { cache: "no-store" });
          if (response.ok) {
            if (cancelled) return;
            setState("ready");
            setProgress(100);
            window.setTimeout(() => {
              window.location.href = destination;
            }, 450);
            return;
          }
        } catch {
          // Keep polling while the API wakes up.
        }

        if (attempts >= 20 && !cancelled) {
          setState("delayed");
        }

        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
    };

    void wake();

    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [destination]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#120b1f] text-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,142,95,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#11091c_0%,#140d23_48%,#0b0814_100%)]" />
        <div className="absolute left-[8%] top-[14%] h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="absolute bottom-[12%] right-[10%] h-56 w-56 rounded-full bg-red-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_20px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img src="/images/logo.jpg" alt="DayTabs" className="h-12 w-12 rounded-2xl object-contain ring-1 ring-white/10" />
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-orange-200/75">DayTabs</p>
              <h1 className="text-3xl font-semibold tracking-tight">Waking your workspace</h1>
            </div>
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/20 p-6">
            <div className="flex items-center gap-4">
              <motion.div
                animate={state === "ready" ? { scale: [1, 1.08, 1] } : { rotate: 360 }}
                transition={state === "ready" ? { duration: 0.5 } : { repeat: Infinity, duration: 1.6, ease: "linear" }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 shadow-lg shadow-orange-500/20"
              >
                {state === "ready" ? <CheckCircle2 className="h-7 w-7" /> : <LoaderCircle className="h-7 w-7" />}
              </motion.div>
              <div>
                <p className="text-lg font-medium">
                  {state === "ready" ? "Your app is ready" : "The server is spinning up"}
                </p>
                <p className="mt-1 text-sm text-white/60">
                  {state === "delayed"
                    ? "Render free instances can take about a minute. We’ll keep trying and send you in as soon as it responds."
                    : "We’re pinging the API in the background so you never have to stare at the default Render page."}
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-2 rounded-full bg-gradient-to-r from-orange-400 via-rose-400 to-red-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/45">
              <span>{state === "ready" ? "Connected" : "Checking health"}</span>
              <span>{seconds}s elapsed</span>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-[1.5rem] border border-orange-300/10 bg-orange-400/5 p-4 text-sm text-orange-50/85">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-200" />
            <p>
              This branded warm-up page works best when your landing site stays static and your API lives on its own Render web service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

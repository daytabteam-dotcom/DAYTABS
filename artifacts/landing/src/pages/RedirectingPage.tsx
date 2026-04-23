import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, CheckCircle } from "lucide-react";
import { getWakePageUrl } from "@/lib/runtime";

export default function RedirectingPage() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const destination = getWakePageUrl(token || undefined);

    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          window.location.href = destination;
          return 100;
        }
        return p + 4;
      });
    }, 60);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center px-6 max-w-sm"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-violet-500/40"
        >
          {progress >= 100 ? (
            <CheckCircle className="w-10 h-10 text-white" />
          ) : (
            <Zap className="w-10 h-10 text-white" />
          )}
        </motion.div>

        <h2 className="text-2xl font-bold mb-2">
          {progress >= 100 ? "Ready!" : "Signing you in..."}
        </h2>
        <p className="text-white/50 text-sm mb-8">
          {progress >= 100 ? "Taking you to the app" : "Setting up your session and redirecting you to DayTabs"}
        </p>

        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <p className="text-xs text-white/30">{progress}%</p>
      </motion.div>
    </div>
  );
}

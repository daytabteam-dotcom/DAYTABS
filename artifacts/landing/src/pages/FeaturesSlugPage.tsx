import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";

const FEATURE_COPY: Record<string, { title: string; desc: string; status: "live" | "comingSoon" }> = {
  teleprompter: {
    title: "Teleprompter",
    desc: "Read your script smoothly with a prompter view, preview mode, and optional local recording.",
    status: "live",
  },
  "content-planner": {
    title: "AI Content Planner",
    desc: "Turn one rough idea into a clear plan with angles, hooks, and formats across platforms.",
    status: "live",
  },
  "video-analyzer": {
    title: "Video Analyzer",
    desc: "Upload a video and get actionable feedback on hooks, pacing, structure, and retention.",
    status: "comingSoon",
  },
  "script-planner": {
    title: "Script Planner",
    desc: "Turn a rough idea into a structured script with clear beats and CTA.",
    status: "comingSoon",
  },
  "youtube-growth": {
    title: "YouTube Growth Planner",
    desc: "Plan what to post next with prioritization, repeatable experiments, and trackable workflows.",
    status: "comingSoon",
  },
};

export default function FeaturesSlugPage() {
  const [, params] = useRoute("/features/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";

  const feature = FEATURE_COPY[slug];
  if (slug === "teleprompter") {
    navigate("/features/teleprompter");
    return null;
  }
  if (slug === "content-planner") {
    navigate("/features/content-planner");
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      <div className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-white/40">
              <Link href="/features" className="hover:text-white/70 transition-colors">Features</Link>
              <span>/</span>
              <span>{feature?.title ?? (slug || "Feature")}</span>
            </div>

            <h1 className="mt-4 text-4xl md:text-5xl font-black leading-tight">
              {feature?.title ?? "Feature"}
            </h1>
            <p className="mt-4 text-white/55 leading-7">
              {feature?.desc ?? "Learn more about this feature."}
            </p>
          </motion.div>

          <div className="mt-10 glass rounded-3xl border border-white/10 p-8">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-violet-200" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {feature?.status === "comingSoon" ? "Coming soon" : "Available"}
                </p>
                <p className="mt-1 text-sm text-white/55 leading-6">
                  {feature?.status === "comingSoon"
                    ? "We’re polishing this feature. In the meantime, you can try Teleprompter or create an account to access the full app."
                    : "Open the feature to try it now."}
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/features/teleprompter"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-5 py-3 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-400"
                  >
                    Try Teleprompter <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/[0.06] hover:text-white"
                  >
                    Create free account <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

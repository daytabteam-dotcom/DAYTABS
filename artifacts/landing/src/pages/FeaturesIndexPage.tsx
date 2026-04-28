import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight, Mic2, Video, Wand2, LayoutDashboard } from "lucide-react";
import Navbar from "@/components/Navbar";

const FEATURES = [
  {
    slug: "teleprompter",
    title: "Teleprompter",
    desc: "Read your script smoothly with optional local recording and a 3–2–1 countdown.",
    icon: Mic2,
    comingSoon: false,
  },
  {
    slug: "video-analyzer",
    title: "Video Analyzer",
    desc: "Upload a video and get actionable hook, pacing, and retention feedback.",
    icon: Video,
    comingSoon: true,
  },
  {
    slug: "script-planner",
    title: "Script Planner",
    desc: "Turn an idea into a structured script with clear beats and CTA.",
    icon: Wand2,
    comingSoon: true,
  },
  {
    slug: "dashboard",
    title: "Workspace",
    desc: "Keep drafts, experiments, and iterations in one place.",
    icon: LayoutDashboard,
    comingSoon: true,
  },
] as const;

export default function FeaturesIndexPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      <div className="pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <h1 className="text-4xl md:text-5xl font-black leading-tight">
              DayTabs features
            </h1>
            <p className="mt-4 text-white/55 leading-7">
              Pick a feature to learn how it works and try it directly in your browser.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.slug}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: idx * 0.06 }}
                  className="glass rounded-3xl border border-white/10 p-6 hover:border-violet-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-violet-200" />
                    </div>
                    {feature.comingSoon ? (
                      <span className="text-[11px] font-semibold tracking-wide uppercase text-white/45 border border-white/10 rounded-full px-2.5 py-1">
                        Coming soon
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-4 text-lg font-bold">{feature.title}</h2>
                  <p className="mt-2 text-sm text-white/55 leading-6">{feature.desc}</p>

                  <Link href={`/features/${feature.slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200">
                    Learn more <ChevronRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

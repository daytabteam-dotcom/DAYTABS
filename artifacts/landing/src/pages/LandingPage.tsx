import { useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import {
  Upload, Brain, BarChart3, Globe, Mic, Star,
  ChevronRight, Play, CheckCircle, Sparkles, Zap, Shield
} from "lucide-react";
import Navbar from "../components/Navbar";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Quality Analysis",
    desc: "Lighting, sound clarity, video resolution, and technical performance scored instantly.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: Brain,
    title: "Content Feedback",
    desc: "AI-powered hooks, storytelling analysis, pacing, and audience engagement insights.",
    color: "from-purple-500 to-pink-500",
  },
  {
    icon: Sparkles,
    title: "SEO Intelligence",
    desc: "Title suggestions, keywords, hashtags, and discoverability scores for every platform.",
    color: "from-blue-500 to-violet-500",
  },
  {
    icon: Mic,
    title: "AI Dubbing",
    desc: "Translate and dub your videos in any language with timestamp-accurate AI voices.",
    color: "from-green-500 to-emerald-500",
  },
  {
    icon: Globe,
    title: "Multi-Platform",
    desc: "Optimized analysis for YouTube, TikTok, Instagram, LinkedIn, and X.",
    color: "from-orange-500 to-red-500",
  },
  {
    icon: Shield,
    title: "Privacy First",
    desc: "Your videos are processed securely and never stored longer than needed.",
    color: "from-cyan-500 to-blue-500",
  },
];

const steps = [
  {
    icon: Upload,
    num: "01",
    title: "Upload Your Video",
    desc: "Drop any video up to 2GB — YouTube Long, TikTok, Instagram Reels, LinkedIn or X. We handle all formats.",
    visual: (
      <div className="relative h-48 flex items-center justify-center">
        <div className="w-48 h-32 glass rounded-2xl border-2 border-dashed border-violet-500/50 flex flex-col items-center justify-center gap-2">
          <Upload className="w-8 h-8 text-violet-400" />
          <span className="text-xs text-white/50">Drop video here</span>
        </div>
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute -top-2 -right-2 w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/40"
        >
          <Zap className="w-5 h-5 text-white" />
        </motion.div>
      </div>
    ),
  },
  {
    icon: Brain,
    num: "02",
    title: "AI Analyzes Every Detail",
    desc: "Our AI extracts audio, transcribes speech, analyzes frames, and generates comprehensive insights in minutes.",
    visual: (
      <div className="relative h-48 flex items-center justify-center">
        <div className="flex gap-1 items-end h-24">
          {[40, 65, 30, 80, 55, 90, 45, 70, 35, 85, 60, 95].map((h, i) => (
            <motion.div
              key={i}
              className="w-2 rounded-full bg-gradient-to-t from-violet-600 to-purple-400"
              style={{ height: `${h}%` }}
              animate={{ scaleY: [1, 0.6, 1] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.1, ease: "easeInOut" }}
            />
          ))}
        </div>
        <div className="absolute bottom-0 w-full flex justify-center">
          <span className="text-xs text-violet-400/70 tracking-widest">ANALYZING AUDIO WAVEFORM</span>
        </div>
      </div>
    ),
  },
  {
    icon: BarChart3,
    num: "03",
    title: "Get Actionable Insights",
    desc: "Receive a full dashboard with Quality, Content, SEO, and Subtitle tabs — each with specific, actionable recommendations.",
    visual: (
      <div className="relative h-48 flex flex-col gap-2 items-center justify-center w-full max-w-xs mx-auto">
        {[
          { label: "Quality Score", val: 87, color: "from-violet-500 to-purple-400" },
          { label: "Content Score", val: 92, color: "from-purple-500 to-pink-400" },
          { label: "SEO Score", val: 74, color: "from-blue-500 to-violet-400" },
        ].map((item, i) => (
          <div key={i} className="w-full">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/60">{item.label}</span>
              <span className="text-white font-semibold">{item.val}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${item.val}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: i * 0.2, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

const languages = ["Hello!", "Hola!", "Bonjour!", "Ciao!", "Hallo!", "こんにちは!", "مرحبا!", "Olá!"];

function LanguageAnimate() {
  return (
    <div className="relative h-48 flex items-center justify-center overflow-hidden">
      <div className="glass rounded-2xl px-8 py-4 text-center min-w-[160px]">
        <motion.div
          key="lang"
          className="text-2xl font-bold gradient-text"
          animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
          transition={{
            repeat: Infinity,
            duration: 2,
            times: [0, 0.15, 0.85, 1],
          }}
        >
          {languages[Math.floor(Date.now() / 2000) % languages.length]}
        </motion.div>
        <p className="text-xs text-white/40 mt-1">AI Dubbed</p>
      </div>
      <div className="absolute inset-0 -z-10">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-violet-400/40"
            style={{ left: `${15 + i * 14}%`, top: `${30 + (i % 2) * 30}%` }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

const platforms = [
  { name: "YouTube", color: "#FF0000" },
  { name: "TikTok", color: "#69C9D0" },
  { name: "Instagram", color: "#E1306C" },
  { name: "LinkedIn", color: "#0A66C2" },
  { name: "X", color: "#ffffff" },
];

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-3xl" />
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-violet-400/20"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.5, 1] }}
              transition={{ repeat: Infinity, duration: 3 + Math.random() * 4, delay: Math.random() * 3 }}
            />
          ))}
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-violet-300 mb-8 border border-violet-500/20"
          >
            <Sparkles className="w-4 h-4" />
            AI-Powered Video Analysis Platform
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold leading-tight mb-6"
          >
            Turn Any Video Into{" "}
            <span className="gradient-text">Actionable Insights</span>{" "}
            with AI
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10"
          >
            Upload your video and get instant AI analysis on quality, content, SEO,
            transcriptions, and multi-language dubbing — all in one platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button
              onClick={() => navigate("/signup")}
              className="px-8 py-4 text-base font-semibold bg-gradient-to-r from-violet-600 to-purple-500 text-white rounded-2xl hover:from-violet-500 hover:to-purple-400 transition-all shadow-xl shadow-violet-500/30 purple-glow cursor-pointer"
              data-testid="button-hero-cta"
            >
              Get Started Free
            </button>
            <button
              onClick={() => document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="px-8 py-4 text-base font-medium glass text-white rounded-2xl border border-white/10 hover:border-violet-500/40 transition-all flex items-center gap-2 justify-center cursor-pointer"
              data-testid="button-hero-how"
            >
              <Play className="w-4 h-4" />
              See How It Works
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-white/40"
          >
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30"
        >
          <ChevronRight className="w-5 h-5 rotate-90" />
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From upload to insight in three simple steps
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <FadeIn key={i} delay={i * 0.15}>
                <div className="glass rounded-3xl p-8 border border-white/8 card-glow transition-all h-full flex flex-col">
                  <div className="text-5xl font-black gradient-text opacity-30 mb-4">{step.num}</div>
                  {step.visual}
                  <div className="mt-6">
                    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* STEP 4 — ADVANCED FEATURES */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Advanced <span className="gradient-text">Capabilities</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Go beyond analysis with AI-powered translation and dubbing
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <FadeIn>
              <LanguageAnimate />
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="space-y-6">
                {[
                  { icon: "📝", title: "Transcript Generation", desc: "Full speech-to-text with timestamps, perfect for captions and subtitles." },
                  { icon: "🌍", title: "AI Translation", desc: "Translate your transcript to any language while preserving meaning and tone." },
                  { icon: "🎙️", title: "Voice Dubbing", desc: "Replace your audio with a natural AI voice in the translated language, synced to your original timing." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex gap-4 glass rounded-2xl p-5 border border-white/8"
                  >
                    <div className="text-2xl">{item.icon}</div>
                    <div>
                      <h4 className="font-semibold mb-1">{item.title}</h4>
                      <p className="text-sm text-white/50">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything You <span className="gradient-text">Need</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              A complete toolkit for serious content creators
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="glass rounded-2xl p-6 border border-white/8 card-glow transition-all h-full group">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2 group-hover:text-violet-300 transition-colors">{f.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-900/20 to-transparent" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <div className="glass rounded-3xl p-12 border border-violet-500/20 purple-glow">
              <Star className="w-10 h-10 text-violet-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Start Growing Your{" "}
                <span className="gradient-text">Content Today</span>
              </h2>
              <p className="text-white/50 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of creators who use DayTabs to understand their audience and make better videos.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate("/signup")}
                  className="px-8 py-4 text-base font-semibold bg-gradient-to-r from-violet-600 to-purple-500 text-white rounded-2xl hover:from-violet-500 hover:to-purple-400 transition-all shadow-xl shadow-violet-500/30 cursor-pointer"
                  data-testid="button-final-cta"
                >
                  Sign Up Free
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  className="px-8 py-4 text-base font-medium glass text-white rounded-2xl border border-white/10 hover:border-violet-500/40 transition-all cursor-pointer"
                >
                  View Pricing
                </button>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-white/40">
                {["No credit card required", "Free plan available", "Cancel anytime"].map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-violet-400" />
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-white/60">DayTabs</span>
          </div>
          <p>© {new Date().getFullYear()} DayTabs. All rights reserved.</p>
          <div className="flex gap-6">
            <button onClick={() => navigate("/pricing")} className="hover:text-white transition-colors cursor-pointer">Pricing</button>
            <button onClick={() => navigate("/contact")} className="hover:text-white transition-colors cursor-pointer">Contact</button>
            <button onClick={() => navigate("/privacy")} className="hover:text-white transition-colors cursor-pointer">Privacy Policy</button>
            <button onClick={() => navigate("/terms")} className="hover:text-white transition-colors cursor-pointer">Terms</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

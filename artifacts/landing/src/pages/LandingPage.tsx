import { useRef, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { Helmet } from "react-helmet-async";
import {
  Upload, Brain, BarChart3, Globe, CalendarDays, Star,
  ChevronRight, Play, CheckCircle, Sparkles, Zap, Shield, Plus, Minus
} from "lucide-react";
import Navbar from "../components/Navbar";
import { blogPosts } from "../data/blogPosts";

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
    icon: CalendarDays,
    title: "Content Growth",
    desc: "Turn trend signals into weekly content plans for every platform you publish on.",
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
    desc: "Drop long-form or short-form videos and get plan-aware upload support up to 5GB on Pro.",
    visual: (
      <div className="relative h-48 flex items-center justify-center">
        <div className="w-48 h-32 glass rounded-2xl border-2 border-dashed border-violet-500/50 flex flex-col items-center justify-center gap-2">
          <Upload className="w-8 h-8 text-violet-400" aria-hidden="true" />
          <span className="text-xs text-white/50">Drop video here</span>
        </div>
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute -top-2 -right-2 w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/40"
        >
          <Zap className="w-5 h-5 text-white" aria-hidden="true" />
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
        <div className="flex gap-1 items-end h-24" aria-label="Audio waveform visualization, DayTabs Video Analyzer">
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
    desc: "Receive a full dashboard with Quality, Content, SEO, and Subtitle tabs, each with specific, actionable recommendations.",
    visual: (
      <div className="relative h-48 flex flex-col gap-2 items-center justify-center w-full max-w-xs mx-auto" aria-label="Video analysis scores dashboard, DayTabs Video Analyzer">
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

function GrowthPlanAnimate() {
  return (
    <div className="relative h-48 flex items-center justify-center overflow-hidden" aria-label="Content growth calendar, DayTabs Growth Planner">
      <div className="glass rounded-2xl px-6 py-5 min-w-[220px]">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-white/45 uppercase tracking-[0.18em]">This week</p>
          <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-400/25 text-emerald-200 bg-emerald-400/10">
            Coming Soon
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <motion.div
              key={day}
              className="h-12 rounded-lg border border-white/10 bg-white/5 flex items-end justify-center p-1"
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: day * 0.12 }}
            >
              <div className={`w-full rounded ${day % 3 === 0 ? "h-7 bg-emerald-400/70" : day % 2 === 0 ? "h-5 bg-violet-400/70" : "h-3 bg-cyan-400/70"}`} />
            </motion.div>
          ))}
        </div>
        <p className="text-xs text-white/40 mt-3">Trend-backed posts</p>
      </div>
      <div className="absolute inset-0 -z-10">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-emerald-400/40"
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

const faqs = [
  {
    q: "How does DayTabs analyze my video?",
    a: "You upload your video and DayTabs analyzes it with top models and platform algorithms in mind, then gives you a complete report with clear feedback to help improve your videos.",
  },
  {
    q: "Is my video stored on your servers?",
    a: "No. Videos are deleted immediately after analysis completes. Only your transcript and report results are saved so you can access them later. Your raw video file is never retained.",
  },
  {
    q: "How is DayTabs different from AI tools?",
    a: "Most AI tools can help you write ideas, but they cannot analyze your actual full video. DayTabs reviews the full upload for you and turns it into a complete report with clear improvements, stronger publish assets, and next steps you can use right away.",
  },
  {
    q: "Can I use DayTabs for free?",
    a: "Yes. DayTabs offers a free plan with 1 video analysis per month, teleprompter access, and basic quality reports. No credit card required. Upgrade to Creator, Pro, or Studio for more analyses, deeper workflows, and more planning capacity.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left cursor-pointer hover:bg-white/3 transition-colors"
        aria-expanded={open}
      >
        <h3 className="font-semibold text-white/90 pr-4">{q}</h3>
        {open ? <Minus className="w-5 h-5 text-violet-400 shrink-0" /> : <Plus className="w-5 h-5 text-violet-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-6 text-white/50 text-sm leading-relaxed border-t border-white/8 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DayTabs",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "AI-powered video analysis platform for content creators. Analyzes video quality, suggests edits, generates SEO-optimized titles and descriptions.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "124",
  },
};

export default function LandingPage() {
  const [, navigate] = useLocation();
  const firstPost = blogPosts[0];

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const el = document.querySelector(hash);
        el?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>DayTabs, AI Video Analysis for Content Creators</title>
        <meta
          name="description"
          content="Upload your video and get instant AI feedback on quality, editing, SEO titles, tags, and short clip ideas. Built for YouTube, TikTok, and Instagram creators."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.daytabs.com/" />
        <meta name="author" content="DayTabs" />
        <meta
          name="keywords"
          content="AI video analysis, YouTube SEO, video editing tool, content creator tools, video quality checker, TikTok video analyzer, Instagram Reels optimizer"
        />
        <meta property="og:title" content="DayTabs, AI Video Analysis for Content Creators" />
        <meta
          property="og:description"
          content="Upload your video and get instant AI feedback on quality, editing, SEO titles, tags, and short clip ideas. Built for YouTube, TikTok, and Instagram creators."
        />
        <meta property="og:image" content="https://www.daytabs.com/opengraph.jpg" />
        <meta property="og:url" content="https://www.daytabs.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="DayTabs" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="DayTabs, AI Video Analysis for Content Creators" />
        <meta
          name="twitter:description"
          content="Upload your video and get instant AI feedback on quality, editing, SEO titles, tags, and short clip ideas. Built for YouTube, TikTok, and Instagram creators."
        />
        <meta name="twitter:image" content="https://www.daytabs.com/opengraph.jpg" />
        <script type="application/ld+json">{JSON.stringify(softwareSchema)}</script>
      </Helmet>

      <Navbar />

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
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
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            AI-Powered Video Analysis Platform
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold leading-tight mb-6"
          >
            DayTabs AI Video Analysis for{" "}
            <span className="gradient-text">Content Creators</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10"
          >
            Upload your video and get instant feedback on quality, editing, SEO optimization,
            and short clip ideas, all in one place. Built for YouTube, TikTok, Instagram,
            LinkedIn, and Twitter.
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
              <Play className="w-4 h-4" aria-hidden="true" />
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
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                {p.name}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30"
          aria-hidden="true"
        >
          <ChevronRight className="w-5 h-5 rotate-90" />
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How <span className="gradient-text">DayTabs Works</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From upload to insight in three simple steps.{" "}
              <button
                onClick={() => document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
              >
                How it works →
              </button>
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

      {/* ADVANCED CAPABILITIES */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Advanced <span className="gradient-text">Capabilities</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Go beyond analysis with trend-aware planning and publishing support
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <FadeIn>
              <GrowthPlanAnimate />
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="space-y-6">
                {[
                  { icon: "📝", title: "Transcript Generation", desc: "Full speech-to-text with timestamps, perfect for captions and subtitles." },
                  { icon: "📈", title: "Growth Planner", desc: "Build weekly content calendars from niche trends, profile signals, and platform cadence." },
                  { icon: "🎯", title: "Competitor Insights", desc: "Spot real accounts and formats worth learning from before planning your next posts." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex gap-4 glass rounded-2xl p-5 border border-white/8"
                  >
                    <div className="text-2xl" aria-hidden="true">{item.icon}</div>
                    <div>
                      <h3 className="font-semibold mb-1">{item.title}</h3>
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
              Everything You Need to{" "}
              <span className="gradient-text">Grow Your Channel</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              A complete toolkit for serious content creators.{" "}
              <button onClick={() => navigate("/pricing")} className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">
                See all features →
              </button>
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="glass rounded-2xl p-6 border border-white/8 card-glow transition-all h-full group">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <f.icon className="w-6 h-6 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="font-bold text-lg mb-2 group-hover:text-violet-300 transition-colors">{f.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              What You <span className="gradient-text">Receive</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              DayTabs is a web-based subscription product for creators who want analysis reports, publish assets, and ongoing planning help.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Per-video analysis report",
                desc: "A structured report in your DayTabs dashboard covering quality, editing, pacing, content feedback, and platform-ready recommendations.",
              },
              {
                title: "Publish package outputs",
                desc: "Depending on your plan, DayTabs can generate title ideas, descriptions, tags, and short clip ideas to speed up publishing.",
              },
              {
                title: "Monthly usage limits by plan",
                desc: "Each subscription clearly states how many videos you can analyze, your file-size limits, duration limits, and planning capacity.",
              },
            ].map((item, i) => (
              <FadeIn key={item.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-6 border border-white/8 h-full">
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-sm text-white/55 leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM SECTION */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for <span className="gradient-text">Every Platform</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto mb-8">
              Whether you publish long-form on YouTube or short-form on TikTok, Instagram Reels, LinkedIn, or Twitter,
              DayTabs gives you tailored recommendations for each platform in a single analysis.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {platforms.map((p) => (
                <div key={p.name} className="flex items-center gap-2 glass rounded-full px-4 py-2 border border-white/8 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                  <span className="text-white/70">{p.name}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* BLOG LINK */}
      {firstPost && (
        <section className="py-12 px-6">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="glass rounded-2xl border border-white/8 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-violet-400 font-semibold uppercase tracking-wider mb-1">From the blog</p>
                  <p className="font-semibold text-white/80">{firstPost.title}</p>
                </div>
                <Link href={`/blog/${firstPost.slug}`}>
                  <button className="shrink-0 px-5 py-2.5 text-sm font-medium glass text-white rounded-xl border border-violet-500/30 hover:border-violet-500/60 transition-all cursor-pointer whitespace-nowrap">
                    Read our YouTube SEO guide →
                  </button>
                </Link>
              </div>
            </FadeIn>
          </div>
        </section>
      )}

      {/* FAQ SECTION */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <FadeIn className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Frequently Asked <span className="gradient-text">Questions</span>
            </h2>
            <p className="text-white/50 text-lg">Everything you need to know before getting started.</p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="flex flex-col gap-3">
              {faqs.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-900/20 to-transparent" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <div className="glass rounded-3xl p-12 border border-violet-500/20 purple-glow">
              <Star className="w-10 h-10 text-violet-400 mx-auto mb-6" aria-hidden="true" />
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Simple, Transparent{" "}
                <span className="gradient-text">Pricing</span>
              </h2>
              <p className="text-white/50 text-lg mb-8 max-w-xl mx-auto">
                Start free. No credit card required. Upgrade only when you're ready to publish more.
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
                    <CheckCircle className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
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
              <Zap className="w-3 h-3 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold text-white/60">DayTabs</span>
          </div>
          <p>© {new Date().getFullYear()} DayTabs. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/refund-policy" className="hover:text-white transition-colors">Refund Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

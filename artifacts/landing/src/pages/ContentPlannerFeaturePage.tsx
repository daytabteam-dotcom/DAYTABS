import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  Instagram,
  Linkedin,
  Lock,
  Sparkles,
  UserPlus,
  Video,
  Wand2,
  X,
  Youtube,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { authApi } from "@/lib/api";
import { getCoreAppUrl } from "@/lib/runtime";

function buildCoreAppRedirect(token: string, redirectAfterAuth: string) {
  const raw = getCoreAppUrl(token);
  const url = new URL(raw, window.location.origin);
  const redirect = new URL(redirectAfterAuth, window.location.origin);
  redirect.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  redirect.hash && (url.hash = redirect.hash);
  return raw.startsWith("http") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

export default function ContentPlannerFeaturePage() {
  const [, navigate] = useLocation();

  const [contentIdea, setContentIdea] = useState("");
  const [error, setError] = useState("");
  const [signupOpen, setSignupOpen] = useState(false);

  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupWorking, setSignupWorking] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const sectionMotion = useMemo(
    () => ({
      initial: { opacity: 0, y: 18 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, amount: 0.25 },
      transition: { duration: 0.5 },
    }),
    [],
  );

  const openSignupModal = useCallback(() => {
    setSignupError("");
    setSignupOpen(true);
  }, []);

  const closeSignupModal = useCallback(() => {
    setSignupOpen(false);
  }, []);

  const handleCreateContentPlan = useCallback(() => {
    const trimmedPrompt = contentIdea.trim();
    if (!trimmedPrompt) {
      setError("Write a content idea first.");
      inputRef.current?.focus();
      return;
    }
    setError("");
    localStorage.setItem("pendingContentPlannerPrompt", trimmedPrompt);
    localStorage.setItem("postSignupRedirect", "content-planner");
    openSignupModal();
  }, [contentIdea, openSignupModal]);

  const handleExploreFeatures = useCallback(() => {
    navigate("/features");
  }, [navigate]);

  const redirectAfterAuth = "/?tab=content-planner";

  const doAuth = useCallback(async () => {
    if (!signupEmail.trim()) return;
    setSignupError("");
    setSignupWorking(true);
    try {
      const response =
        authMode === "signup"
          ? await authApi.signup(signupEmail, signupPassword, signupName)
          : await authApi.login(signupEmail, signupPassword);
      const nextUrl = buildCoreAppRedirect(response.token, redirectAfterAuth);
      navigate(nextUrl);
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : authMode === "signup" ? "Signup failed" : "Login failed");
    } finally {
      setSignupWorking(false);
    }
  }, [authMode, navigate, redirectAfterAuth, signupEmail, signupName, signupPassword]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>AI Content Planner | Generate Content Ideas and Plan Posts</title>
        <meta
          name="description"
          content="Use an AI content planner to generate content ideas, organize your strategy, and plan posts for YouTube, TikTok, Instagram, LinkedIn, and blogs."
        />
        <meta
          name="keywords"
          content="AI content planner, content planner, social media content planner, content ideas generator, AI content ideas, content planning tool, plan social media posts, YouTube content ideas, LinkedIn content ideas, TikTok content ideas"
        />
      </Helmet>

      <Navbar />

      <main className="pt-20">
        <section className="relative overflow-hidden px-6 pt-14 pb-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="absolute -bottom-56 right-[-10%] h-[520px] w-[620px] rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.20),transparent_55%)]" />
          </div>

          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <motion.div {...sectionMotion}>
                <div className="flex flex-wrap gap-2">
                  {["AI content ideas", "Multi platform planning", "Built for creators", "No credit card required"].map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/70"
                    >
                      <BadgeCheck className="h-4 w-4 text-violet-200" />
                      {label}
                    </span>
                  ))}
                </div>

                <h1 className="mt-6 text-4xl md:text-5xl font-black leading-[1.05] tracking-tight">
                  AI Content Planner
                </h1>
                <p className="mt-5 text-3xl font-black tracking-tight text-white/90">
                  Plan your next content ideas in seconds
                </p>
                <p className="mt-5 max-w-xl text-lg text-white/60 leading-7">
                  Turn one rough idea into a clear content plan for YouTube, TikTok, Instagram, LinkedIn, blogs, and more.
                  Get structured ideas, post angles, hooks, and next steps without staring at a blank page.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      window.setTimeout(() => inputRef.current?.focus(), 250);
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/10 hover:opacity-95"
                  >
                    <Wand2 className="h-4 w-4" />
                    Create My First Content Plan
                  </button>
                  <button
                    type="button"
                    onClick={handleExploreFeatures}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/[0.06]"
                  >
                    Explore Features <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>

              <motion.div {...sectionMotion} transition={{ duration: 0.55, delay: 0.05 }}>
                <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="pointer-events-none absolute -inset-6 rounded-[28px] bg-gradient-to-tr from-violet-500/15 via-fuchsia-500/10 to-transparent blur-2xl" />
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Preview</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Content calendar</p>
                          <p className="mt-1 text-xs text-white/45">Example week of planned posts</p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-white/65">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
                            <Youtube className="h-3.5 w-3.5 text-red-200" /> YouTube
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
                            <Instagram className="h-3.5 w-3.5 text-pink-200" /> Instagram
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
                            <Linkedin className="h-3.5 w-3.5 text-sky-200" /> LinkedIn
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3">
                        {[
                          { day: "Mon", title: "Productivity tips for busy founders", tag: "LinkedIn" },
                          { day: "Wed", title: "3 habits that reduce decision fatigue", tag: "YouTube Short" },
                          { day: "Fri", title: "Before and after: fixing a chaotic calendar", tag: "Instagram Reel" },
                        ].map((item) => (
                          <div key={item.day} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-violet-500/30 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{item.day}</p>
                                <p className="mt-2 text-sm font-semibold text-white/85 truncate">{item.title}</p>
                                <p className="mt-1 text-xs text-white/45">Hook, format, and next steps included</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                                {item.tag}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">Start your first content plan</h2>
              <p className="mt-2 text-white/55 leading-7">
                Write one content idea, topic, or niche. After signing up, your idea will automatically open inside the Content Planner so you can continue exactly where you left off.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-10 glass rounded-2xl border border-white/10 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    Your content idea
                  </label>
                  <div className="mt-3">
                    <input
                      ref={inputRef}
                      value={contentIdea}
                      onChange={(e) => {
                        setContentIdea(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="Example: I want to create content about productivity tips for busy founders"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
                    />
                    {error ? (
                      <p className="mt-2 text-sm text-red-200">{error}</p>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateContentPlan}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/10 hover:opacity-95"
                >
                  <Sparkles className="h-4 w-4" />
                  Create
                </button>
              </div>

              <p className="mt-4 text-xs text-white/45">
                Your idea will be saved and used after signup. No credit card required.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  "Productivity tips",
                  "AI tools for creators",
                  "Fitness content plan",
                  "LinkedIn personal brand",
                  "YouTube video ideas",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setContentIdea(chip)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">How it works</h2>
              <p className="mt-2 text-white/55 leading-7">Three steps from idea to a plan you can use.</p>
            </motion.div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                { step: "1", title: "Add your idea", desc: "Write a topic, niche, product, or audience you want to create content for.", icon: Sparkles },
                { step: "2", title: "Generate a content plan", desc: "Get content angles, post ideas, hooks, platform suggestions, and structure.", icon: Wand2 },
                { step: "3", title: "Create consistently", desc: "Use your plan to write scripts, record videos, and keep your pipeline full.", icon: CalendarDays },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...sectionMotion}
                  transition={{ duration: 0.45, delay: idx * 0.05 }}
                  className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/30 hover:scale-[1.02] hover:border-white/15 transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                      <item.icon className="h-5 w-5 text-white/75" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/55">
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">Step {item.step}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm text-white/55 leading-6">{item.desc}</p>
                    </div>
                  </div>
                  {idx < 2 ? (
                    <div className="pointer-events-none absolute -right-3 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-white/10 lg:block" />
                  ) : null}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative px-6 py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.10),transparent_55%)]" />
          <div className="relative mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">From one idea to a full content plan</h2>
              <p className="mt-2 text-white/55 leading-7">
                The Content Planner helps you organize your ideas into a clear direction. Instead of random brainstorming, you get a structured plan that can guide what to post, where to post, and how to turn each idea into content.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-10 grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Input</p>
                <p className="mt-3 text-sm font-semibold text-white/85">AI tools for small business owners</p>
                <p className="mt-2 text-xs text-white/45">Start with a niche, audience, or topic.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Generated ideas</p>
                <div className="mt-4 space-y-3 text-sm text-white/75">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">5 mistakes small businesses make with AI</div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">How to automate one boring task this week</div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Best AI tools for saving time</div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Before and after: manual workflow vs AI workflow</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Platforms and hooks</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { label: "LinkedIn post", icon: Linkedin },
                    { label: "YouTube short", icon: Youtube },
                    { label: "TikTok script", icon: Video },
                    { label: "Blog outline", icon: ArrowRight },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/70"
                    >
                      <item.icon className="h-4 w-4 text-white/70" />
                      {item.label}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-white/45">
                  Get suggested formats, hooks, and next steps per platform.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">Benefits</h2>
              <p className="mt-2 text-white/55 leading-7">A content planning tool built for speed and clarity.</p>
            </motion.div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: "Never start from a blank page", desc: "Generate useful ideas when you do not know what to post.", icon: Sparkles },
                { title: "Plan across platforms", desc: "Adapt one idea for YouTube, TikTok, Instagram, LinkedIn, and blogs.", icon: CalendarDays },
                { title: "Stay consistent", desc: "Build a repeatable workflow instead of relying on motivation.", icon: BadgeCheck },
                { title: "Find better angles", desc: "Turn simple topics into stronger hooks, titles, and post ideas.", icon: Wand2 },
                { title: "Save planning time", desc: "Spend less time brainstorming and more time creating.", icon: Video },
                { title: "Connect planning to creation", desc: "Move from idea to scripts, recording, and analysis inside one workflow.", icon: Youtube },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...sectionMotion}
                  transition={{ duration: 0.45, delay: idx * 0.03 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/25 backdrop-blur hover:scale-[1.02] hover:border-white/15 transition"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <item.icon className="h-5 w-5 text-white/75" />
                  </div>
                  <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/55 leading-6">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">Built for creators, founders, and teams</h2>
              <p className="mt-2 text-white/55 leading-7">Make your ideas easier to turn into real posts.</p>
            </motion.div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "Content creators", desc: "Plan videos, posts, and campaigns without running out of ideas.", icon: Youtube },
                { title: "Founders", desc: "Create product updates, educational content, and founder led marketing.", icon: Linkedin },
                { title: "Freelancers and marketers", desc: "Manage content ideas for multiple clients or brands.", icon: Wand2 },
                { title: "Educators and coaches", desc: "Turn lessons, tips, and expertise into structured content.", icon: GraduationCap },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...sectionMotion}
                  transition={{ duration: 0.45, delay: idx * 0.03 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/25 hover:scale-[1.02] hover:border-white/15 transition"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <item.icon className="h-5 w-5 text-white/75" />
                  </div>
                  <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/55 leading-6">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative px-6 py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.08),transparent_60%)]" />
          <div className="relative mx-auto max-w-[900px]">
            <motion.div {...sectionMotion}>
              <h2 className="text-3xl font-black tracking-tight">What is an AI content planner?</h2>
              <p className="mt-4 text-white/55 leading-7">
                An AI content planner helps you generate, organize, and structure content ideas based on your niche, audience, and goals.
                Instead of manually brainstorming every post, you can start with one topic and turn it into a clear plan for different platforms.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-12">
              <h2 className="text-3xl font-black tracking-tight">Why use a content planner?</h2>
              <p className="mt-4 text-white/55 leading-7">
                Content creation becomes easier when you know what to create next. A content planner helps you reduce creative blocks, stay consistent, and build a stronger strategy around your ideas.
                It is useful for social media posts, video scripts, blog topics, product content, and personal branding.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-12">
              <h2 className="text-3xl font-black tracking-tight">Plan content for multiple platforms</h2>
              <p className="mt-4 text-white/55 leading-7">
                A strong idea can become more than one post. The Content Planner helps you adapt your topic into different formats, including short form videos, long form YouTube videos, LinkedIn posts, Instagram content, and blog outlines.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-12">
              <h2 className="text-3xl font-black tracking-tight">Create content without burnout</h2>
              <p className="mt-4 text-white/55 leading-7">
                When your content ideas are organized, you do not have to restart your planning process every day. You can keep a clear pipeline of topics, hooks, and formats so creating content feels easier and more consistent.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="relative overflow-hidden px-6 py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/18 blur-3xl" />
            <div className="absolute -bottom-44 left-[-10%] h-[420px] w-[520px] rounded-full bg-fuchsia-500/10 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-[900px] text-center">
            <motion.div {...sectionMotion}>
              <h2 className="text-4xl font-black tracking-tight">Ready to plan your next post?</h2>
              <p className="mt-3 text-lg text-white/60 leading-7">
                Start with one idea and turn it into a content plan you can actually use.
              </p>

              <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    value={contentIdea}
                    onChange={(e) => setContentIdea(e.target.value)}
                    placeholder="What do you want to create content about?"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
                  />
                  <button
                    type="button"
                    onClick={handleCreateContentPlan}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/10 hover:opacity-95"
                  >
                    <Wand2 className="h-4 w-4" />
                    Create My Plan
                  </button>
                </div>
                <p className="mt-3 text-xs text-white/45">No credit card required.</p>
              </div>

              <div className="mt-8">
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200"
                >
                  Explore all features <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {signupOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeSignupModal}
            aria-label="Close signup"
          />
          <div className="relative w-full max-w-xl glass rounded-3xl border border-white/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  {authMode === "signup" ? "Create a free account to continue" : "Log in to continue"}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  Your idea stays saved, and opens in Content Planner after you sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSignupModal}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {signupError ? (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {signupError}
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              <a
                href={authApi.googleLoginUrl()}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-white/15 hover:border-violet-500/40 hover:bg-white/5 transition-all text-sm font-semibold cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </a>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs text-white/30">
                  <span className="glass px-3 py-0.5 rounded">{authMode === "signup" ? "Or sign up with email" : "Or continue with email"}</span>
                </div>
              </div>

              {authMode === "signup" ? (
                <input
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
                />
              ) : null}

              <input
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
              />

              <input
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder={authMode === "signup" ? "Password (min 6 chars)" : "Password"}
                type="password"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
              />

              <button
                type="button"
                onClick={doAuth}
                disabled={!signupEmail.trim() || (authMode === "signup" ? signupPassword.length < 6 : signupPassword.length < 1) || signupWorking}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
              >
                {authMode === "signup" ? <UserPlus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                {signupWorking ? (authMode === "signup" ? "Creating account…" : "Logging in…") : (authMode === "signup" ? "Sign up and continue" : "Log in and continue")}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignupError("");
                  setAuthMode((mode) => (mode === "signup" ? "login" : "signup"));
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.06] hover:text-white"
              >
                {authMode === "signup" ? "Already have an account? Log in" : "New here? Create a free account"}
              </button>

              <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                <span className="inline-flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-200" />
                  No credit card required
                </span>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-200" />
                  Idea saved for you
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


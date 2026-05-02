import { useCallback, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Loader2, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import Navbar from "@/components/Navbar";
import { FeatureAuthModal } from "@/components/FeatureAuthModal";
import { getCoreAppUrl } from "@/lib/runtime";

type Platform = "linkedin" | "tiktok" | "instagram";

function buildCoreAppRedirect(token: string, redirectAfterAuth: string) {
  const raw = getCoreAppUrl(token);
  const url = new URL(raw, window.location.origin);
  const redirect = new URL(redirectAfterAuth, window.location.origin);
  redirect.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  redirect.hash && (url.hash = redirect.hash);
  return raw.startsWith("http") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

function platformMeta(platform: Platform) {
  if (platform === "linkedin") {
    return {
      name: "LinkedIn",
      accent: "from-sky-500/25 via-cyan-400/10 to-transparent",
      button: "from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300",
      chip: "border-sky-400/25 bg-sky-500/10 text-sky-100",
      sub: "Turn one goal into a full weekly plan with posts, hooks, and growth tasks built for LinkedIn.",
      goalPlaceholder: "Example: Grow my LinkedIn audience and get inbound leads",
      focusPlaceholder: "Example: startups, AI tools, founder lessons",
      bullets: ["Authority posts", "Founder content", "Networking tasks"],
      chips: ["Grow my LinkedIn audience", "Get inbound leads", "Build authority as a founder"],
      exampleIdea: "How I built my app with no coding",
    };
  }
  if (platform === "tiktok") {
    return {
      name: "TikTok",
      accent: "from-violet-500/25 via-purple-400/10 to-transparent",
      button: "from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400",
      chip: "border-violet-400/25 bg-violet-500/10 text-violet-100",
      sub: "Turn one goal into a full weekly plan with posts, hooks, and growth tasks built for TikTok.",
      goalPlaceholder: "Example: Get more TikTok views for my startup content",
      focusPlaceholder: "Example: AI tools, side projects, productivity",
      bullets: ["Hooks", "Scripts", "Video ideas"],
      chips: ["Get more TikTok views", "Grow my TikTok account", "Make my hooks stronger"],
      exampleIdea: "The 10-second demo that got me 10k views",
    };
  }
  return {
    name: "Instagram",
    accent: "from-orange-500/25 via-pink-500/10 to-transparent",
    button: "from-orange-500 to-fuchsia-500 hover:from-orange-400 hover:to-fuchsia-400",
    chip: "border-orange-400/25 bg-orange-500/10 text-orange-100",
    sub: "Turn one goal into a full weekly plan with posts, hooks, and growth tasks built for Instagram.",
    goalPlaceholder: "Example: Build my Instagram brand and grow followers",
    focusPlaceholder: "Example: reels, art process, behind-the-scenes",
    bullets: ["Reels", "Carousels", "Stories"],
    chips: ["Build my Instagram brand", "Get more Reels reach", "Grow my Instagram audience"],
    exampleIdea: "My 3-step system to stay consistent",
  };
}

function fadeIn(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.55, delay },
  } as const;
}

function OutputSnippet({ meta }: { meta: ReturnType<typeof platformMeta> }) {
  return (
    <div className="mt-6 w-full max-w-[520px] rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/30 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Preview output</div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.chip}`}>{meta.name}</span>
      </div>
      <div className="mt-3 space-y-3">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Mon</p>
          <p className="mt-2 text-sm text-white/90">
            <span className="text-white/55">Post:</span> “{meta.exampleIdea}”
          </p>
          <p className="mt-2 text-sm text-white/80">
            <span className="text-white/55">Hook:</span> “I almost quit before this worked…”
          </p>
          <p className="mt-2 text-sm text-white/70">
            <span className="text-white/55">Task:</span> Comment on 5 founder posts
          </p>
        </div>
      </div>
    </div>
  );
}

function AnimatedMock({ meta }: { meta: ReturnType<typeof platformMeta> }) {
  return (
    <div className="relative">
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -inset-10 rounded-[44px] bg-gradient-to-br ${meta.accent} blur-2xl`}
        animate={{ opacity: [0.55, 0.85, 0.55], scale: [1, 1.03, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Weekly calendar</div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 p-4">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => (
              <motion.div
                key={d}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-2"
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 3.2 + idx * 0.15, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{d}</div>
                <div className="mt-2 space-y-2">
                  <div className="h-10 rounded-xl border border-white/10 bg-black/35" />
                  {idx % 3 === 0 ? <div className="h-7 rounded-xl border border-white/10 bg-black/25" /> : null}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="border-t border-white/10 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center gap-2 text-white/80 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-white/60" />
                  Content cards
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-9 rounded-xl border border-white/10 bg-black/25" />
                  <div className="h-9 rounded-xl border border-white/10 bg-black/25" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center gap-2 text-white/80 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4 text-white/60" />
                  Task checklist
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-white/10" />
                  <div className="h-3 w-3/5 rounded-full bg-white/10" />
                  <div className="h-3 w-2/3 rounded-full bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputCard({
  meta,
  platform,
  onGenerate,
  compact,
}: {
  meta: ReturnType<typeof platformMeta>;
  platform: Platform;
  onGenerate: (input: { goal: string; followers: number; focus: string }) => void;
  compact?: boolean;
}) {
  const [goal, setGoal] = useState("");
  const [followers, setFollowers] = useState("");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  return (
    <div className={`mx-auto w-full ${compact ? "max-w-[900px]" : "max-w-[980px]"}`}>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl md:text-3xl font-black tracking-tight text-white">What do you want to achieve next week</p>
            <p className="mt-2 text-sm md:text-base text-white/55">We will turn this into a complete weekly content plan after signup</p>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${meta.chip}`}>
            <Sparkles className="h-4 w-4" />
            Built for {meta.name}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Goal</p>
            <textarea
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                if (error) setError(null);
              }}
              placeholder={meta.goalPlaceholder}
              className="mt-2 w-full min-h-[110px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {meta.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setGoal(chip)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Followers</p>
            <input
              value={followers}
              onChange={(e) => {
                setFollowers(e.target.value);
                if (error) setError(null);
              }}
              inputMode="numeric"
              placeholder="Current followers"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Content focus (optional)</p>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={meta.focusPlaceholder}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
            />
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const trimmed = goal.trim();
              const parsedFollowers = Number(followers.trim());
              if (!trimmed) {
                setError("Write your goal first.");
                return;
              }
              if (!followers.trim() || !Number.isFinite(parsedFollowers) || parsedFollowers < 0) {
                setError("Enter your current follower count.");
                return;
              }
              setError(null);
              setWorking(true);
              const delay = 400 + Math.floor(Math.random() * 401);
              window.setTimeout(() => {
                setWorking(false);
                onGenerate({ goal: trimmed, followers: Math.floor(parsedFollowers), focus: focus.trim() });
              }, delay);
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 ${meta.button}`}
            disabled={working}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Generate my plan
          </button>
          <p className="text-xs text-white/45">Takes less than 30 seconds</p>
        </div>
      </div>
    </div>
  );
}

function ExamplePlan({ meta }: { meta: ReturnType<typeof platformMeta> }) {
  const days = [
    { day: "Monday", idea: `“${meta.exampleIdea}”`, hook: "“I almost quit before this worked…”", task: "Comment on 5 founder posts" },
    { day: "Tuesday", idea: "“The mistake I made for 6 months”", hook: "“I wish someone told me this sooner…”", task: "Reply to every comment within 30 minutes" },
    { day: "Wednesday", idea: "“3 lessons from building in public”", hook: "“This changed how I ship…”", task: "Engage with 10 posts in your niche" },
    { day: "Thursday", idea: "“Behind the scenes: what I shipped”", hook: "“Here is the exact change…”", task: "Connect with 5 people and add a note" },
    { day: "Friday", idea: "“A simple framework you can steal”", hook: "“Save this for later…”", task: "Ask one question to spark comments" },
    { day: "Saturday", idea: "“Story: the day everything broke”", hook: "“I did not expect this…”", task: "Share one post in a relevant community" },
    { day: "Sunday", idea: "“Next week plan: what I am focusing on”", hook: "“If you only do one thing…”", task: "Review your top post and note why it worked" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {days.map((d) => (
        <div key={d.day} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/30 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{d.day}</p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-white/85"><span className="text-white/55">Idea:</span> {d.idea}</p>
            <p className="text-white/80"><span className="text-white/55">Hook:</span> {d.hook}</p>
            <p className="text-white/70"><span className="text-white/55">Task:</span> {d.task}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PlatformContentPlannerFeaturePage({ platform }: { platform: Platform }) {
  const meta = platformMeta(platform);
  const [, navigate] = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);

  const [signupOpen, setSignupOpen] = useState(false);

  const openSignup = useCallback(() => setSignupOpen(true), []);
  const closeSignup = useCallback(() => setSignupOpen(false), []);

  const [pending, setPending] = useState<{ goal: string; followers: number; focus: string } | null>(null);

  const handleGenerate = useCallback((input: { goal: string; followers: number; focus: string }) => {
    localStorage.setItem("pendingWeeklyGoal", input.goal);
    localStorage.setItem("pendingFollowerCount", String(input.followers));
    localStorage.setItem("pendingContentFocus", input.focus);
    localStorage.setItem("pendingPlatform", platform);
    localStorage.setItem("postSignupRedirect", "content-planner-weekly");
    setPending(input);
    openSignup();
  }, [openSignup, platform]);

  const redirectAfterAuth = useMemo(() => `/?tab=content-planner&platform=${platform}`, [platform]);

  const onAuthed = useCallback((token: string) => {
    const nextUrl = buildCoreAppRedirect(token, redirectAfterAuth);
    navigate(nextUrl);
  }, [navigate, redirectAfterAuth]);

  return (
    <div className="min-h-screen bg-[#0b0b12] text-white overflow-x-hidden">
      <Helmet>
        <title>{meta.name} Content Planner | Plan Next Week’s Content</title>
        <meta name="description" content={`Plan next week’s ${meta.name} content and actually grow. Turn one goal into a weekly plan with posts, hooks, and growth tasks.`} />
      </Helmet>

      <Navbar />

      <main className="pt-20">
        <section className="relative overflow-hidden px-6 pt-14 pb-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-52 left-1/2 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="absolute -bottom-72 right-[-10%] h-[520px] w-[620px] rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className={`absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.22),transparent_56%)]`} />
          </div>

          <div ref={heroRef} className="relative mx-auto max-w-[1200px]">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <motion.div {...fadeIn(0)}>
                <h1 className="text-4xl md:text-5xl font-black leading-[1.05] tracking-tight">
                  Plan next week’s content and actually grow
                </h1>
                <p className="mt-5 max-w-xl text-lg text-white/60 leading-7">
                  Turn one goal into a full weekly plan with posts, hooks, and growth tasks built for {meta.name}.
                </p>
                <p className="mt-4 text-sm text-white/45">No credit card required</p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const target = document.getElementById("planner-input");
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/25 ${meta.button}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                    Create my next week plan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = document.getElementById("example-plan");
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/[0.06]"
                  >
                    See example <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <OutputSnippet meta={meta} />
              </motion.div>

              <motion.div {...fadeIn(0.05)}>
                <AnimatedMock meta={meta} />
              </motion.div>
            </div>
          </div>
        </section>

        <section id="planner-input" className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <InputCard meta={meta} platform={platform} onGenerate={handleGenerate} />
            {pending ? <div className="sr-only">{pending.goal}</div> : null}
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Here is what you get</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { title: "Weekly plan", desc: "Mon to Sun content ideas", Icon: CalendarDays },
                { title: "Ready to post", desc: "Hooks, captions, scripts", Icon: CheckCircle2 },
                { title: "Growth tasks", desc: "What to do daily to get reach", Icon: ClipboardList },
              ].map((card) => (
                <div key={card.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-xl hover:-translate-y-0.5 transition-transform">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                    <card.Icon className="h-5 w-5 text-white/80" />
                  </div>
                  <p className="mt-4 text-lg font-bold">{card.title}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">{card.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px] grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-xl shadow-black/30 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Before</p>
              <ul className="mt-4 space-y-3 text-white/70">
                {["No idea what to post", "Inconsistent", "Random content"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/25" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-xl shadow-black/30 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">After</p>
              <ul className="mt-4 space-y-3 text-white/70">
                {["Clear weekly plan", "Consistent posting", "Better results every week"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/25" />{t}</li>
                ))}
              </ul>
            </div>
          </motion.div>
        </section>

        <section id="example-plan" className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Example weekly plan</h2>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-white/55">Real structure. No blur. This is what you see before signup.</p>
            <div className="mt-8">
              <ExamplePlan meta={meta} />
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Your plan gets smarter every week</h2>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-white/55">Plan. Post. Feedback. Improve. You tell what worked. Next week adapts automatically.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {["Plan", "Post", "Feedback", "Improve"].map((step, i) => (
                <div key={step} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Step {i + 1}</p>
                  <p className="mt-3 text-lg font-bold">{step}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">
                    {step === "Plan" ? "You get a weekly plan." : step === "Post" ? "You publish what fits." : step === "Feedback" ? "You mark what worked." : "Next week improves."}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">{meta.name}-specific planning</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {meta.bullets.map((t) => (
                <div key={t} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-xl hover:-translate-y-0.5 transition-transform">
                  <p className="text-lg font-bold">{t}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">Built for how {meta.name} actually works.</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Benefits</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "Never run out of ideas",
                "Stay consistent",
                "Plan faster",
                "Grow your audience",
                "Focus on what works",
                "Turn ideas into action",
              ].map((t) => (
                <div key={t} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-xl hover:-translate-y-0.5 transition-transform">
                  <p className="text-base font-bold">{t}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">Clear plan. Fast execution. Real progress.</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-24">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <div className="rounded-[40px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.26),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 shadow-2xl shadow-black/60 backdrop-blur-2xl">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight">Plan your next week in 30 seconds</h2>
              <p className="mt-3 text-sm md:text-base text-white/55">Based on your goal. Not generic ideas.</p>
              <div className="mt-8">
                <InputCard meta={meta} platform={platform} onGenerate={handleGenerate} compact />
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <FeatureAuthModal
        open={signupOpen}
        onClose={closeSignup}
        title="Create a free account to continue"
        subtitle={`Your goal stays saved, and your ${meta.name} weekly plan generates right after signup.`}
        onAuthed={onAuthed}
      />
    </div>
  );
}

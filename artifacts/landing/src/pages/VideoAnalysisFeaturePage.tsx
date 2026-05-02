import { useCallback, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  AlignLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Hash,
  Lock,
  Scissors,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Wand2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { FeatureAuthModal } from "@/components/FeatureAuthModal";
import { LandingVideoUploadPreview } from "@/components/LandingVideoUploadPreview";
import { getCoreAppUrl } from "@/lib/runtime";
import { useLocation } from "wouter";

function buildCoreAppRedirect(token: string, redirectAfterAuth: string) {
  const raw = getCoreAppUrl(token);
  const url = new URL(raw, window.location.origin);
  const redirect = new URL(redirectAfterAuth, window.location.origin);
  redirect.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  redirect.hash && (url.hash = redirect.hash);
  return raw.startsWith("http") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

function fadeIn(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, delay },
  } as const;
}

function ScoreDonut() {
  const score = 78;
  const degrees = Math.round((score / 100) * 360);
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/40 backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Readiness score</p>
          <p className="mt-2 text-sm text-white/55">Verdict</p>
          <p className="mt-1 text-lg font-bold text-white">Almost ready</p>
        </div>
        <div
          className="relative flex h-28 w-28 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#38bdf8 0deg ${degrees}deg, rgba(255,255,255,0.08) ${degrees}deg 360deg)` }}
        >
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border border-white/10 bg-[#0f0f12]">
            <span className="text-3xl font-bold font-mono text-white">{score}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">out of 100</span>
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Fix first</p>
        <p className="mt-2 text-sm text-white/85">Rewrite the opening so the payoff lands in the first 3 seconds.</p>
        <p className="mt-2 text-xs text-white/55">Most drop-offs happen before viewers understand why they should stay.</p>
      </div>
    </div>
  );
}

function ExampleReportPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <ScoreDonut />
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/40 backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-white/60" />
            <p className="text-sm font-semibold text-white">Timeline notes</p>
          </div>
          <div className="mt-4 space-y-2">
            {[
              { time: "00:03", label: "Hook risk", tone: "border-red-400/20 bg-red-500/10 text-red-100" },
              { time: "00:18", label: "Cut this section", tone: "border-amber-400/20 bg-amber-500/10 text-amber-100" },
              { time: "00:42", label: "Strong moment", tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" },
            ].map((m) => (
              <div key={m.time} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                <span className="text-sm font-mono text-sky-200">{m.time}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${m.tone}`}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/40 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-white/60" />
              <p className="text-sm font-semibold text-white">Publish package</p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white/60">
              Unlock full report after signup
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">3 title ideas</p>
              <ul className="mt-3 space-y-2 text-sm text-white/75">
                <li>“I fixed this one thing and retention jumped”</li>
                <li>“The hook mistake I made for 6 months”</li>
                <li>“Before you publish, check this first”</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Tag chips</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["video editing", "hook", "retention", "creator tips", "publish"].map((t) => (
                  <span key={t} className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100">
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">
                Description suggestion is shown after signup.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-10 rounded-[44px] bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent blur-2xl"
        animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.03, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Mock report</div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
            </div>
          </div>
          <div className="p-5 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Readiness score</p>
                <p className="mt-3 text-3xl font-bold font-mono text-white">78/100</p>
                <p className="mt-2 text-sm text-white/60">Almost ready</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Fix first</p>
                <p className="mt-2 text-sm text-white/85">Tighten the opening</p>
                <p className="mt-2 text-xs text-white/55">Start with the strongest payoff.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Modules</p>
                <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                  Transcript ready
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {[
                  { Icon: Shield, label: "Quality check" },
                  { Icon: Scissors, label: "Editing suggestions" },
                  { Icon: AlignLeft, label: "Transcript" },
                  { Icon: TrendingUp, label: "Publish package" },
                ].map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/70">
                    <b.Icon className="h-3.5 w-3.5 text-white/60" />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Timeline</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {[
                  { t: "00:03", l: "Hook risk", tone: "border-red-400/20 bg-red-500/10 text-red-100" },
                  { t: "00:18", l: "Cut this", tone: "border-amber-400/20 bg-amber-500/10 text-amber-100" },
                  { t: "00:42", l: "Strong", tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" },
                ].map((m) => (
                  <div key={m.t} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-xs font-mono text-sky-200">{m.t}</p>
                    <p className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${m.tone}`}>{m.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoAnalysisFeaturePage() {
  const [, navigate] = useLocation();
  const [signupOpen, setSignupOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<string>("");

  const redirectAfterAuth = "/?tab=video-analyzer";

  const onStartAnalysis = useCallback((input: { fileName: string; platform: string; modules: string[] }) => {
    localStorage.setItem("pendingVideoAnalysisIntent", "true");
    localStorage.setItem("pendingVideoAnalysisFileName", input.fileName);
    localStorage.setItem("pendingVideoAnalysisPlatform", input.platform);
    localStorage.setItem("pendingVideoAnalysisModules", JSON.stringify(input.modules));
    localStorage.setItem("postSignupRedirect", "video-analysis");
    setPendingSummary(`${input.fileName}`);
    setSignupOpen(true);
  }, []);

  const onAuthed = useCallback((token: string) => {
    const nextUrl = buildCoreAppRedirect(token, redirectAfterAuth);
    navigate(nextUrl);
  }, [navigate]);

  const badges = useMemo(() => ([
    { Icon: Shield, label: "Quality check" },
    { Icon: Scissors, label: "Editing suggestions" },
    { Icon: AlignLeft, label: "Transcript" },
    { Icon: TrendingUp, label: "Publish package" },
    { Icon: BadgeCheck, label: "No credit card required" },
  ]), []);

  return (
    <div className="min-h-screen bg-[#0b0b12] text-white overflow-x-hidden">
      <Helmet>
        <title>AI Video Analysis Tool | Analyze Videos Before Publishing</title>
        <meta
          name="description"
          content="Upload a video and get AI-powered quality checks, editing suggestions, transcript, and publish package. Improve your videos before posting."
        />
      </Helmet>

      <Navbar />

      <main className="pt-20">
        <section className="relative overflow-hidden px-6 pt-14 pb-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-52 left-1/2 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="absolute -bottom-72 right-[-10%] h-[520px] w-[620px] rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.22),transparent_56%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px] opacity-[0.18]" />
          </div>

          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <motion.div {...fadeIn(0)}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/80">AI Video Analysis</p>
                <h1 className="mt-4 text-4xl md:text-5xl font-black leading-[1.05] tracking-tight">
                  Know what to fix before you publish
                </h1>
                <p className="mt-5 max-w-xl text-lg text-white/60 leading-7">
                  Upload a video and get a clear report with quality scores, editing notes, hook feedback, transcript, and publish suggestions.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {badges.map((b) => (
                    <span key={b.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-semibold text-white/70">
                      <b.Icon className="h-4 w-4 text-violet-200" />
                      {b.label}
                    </span>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => document.getElementById("upload-preview")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/25 hover:opacity-95"
                  >
                    <Wand2 className="h-4 w-4" />
                    Analyze my video
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById("example-report")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/[0.06]"
                  >
                    See example report <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/40 backdrop-blur-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Clarity. Speed. Control.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      { Icon: Target, title: "Clarity", desc: "You get a full report." },
                      { Icon: Clock3, title: "Speed", desc: "In minutes, not hours." },
                      { Icon: Lock, title: "Ease", desc: "No credit card required." },
                    ].map((i) => (
                      <div key={i.title} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                          <i.Icon className="h-4 w-4 text-white/75" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-white">{i.title}</p>
                        <p className="mt-2 text-xs text-white/55 leading-6">{i.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <motion.div {...fadeIn(0.06)}>
                <HeroMock />
              </motion.div>
            </div>
          </div>
        </section>

        <section id="upload-preview" className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <LandingVideoUploadPreview
              freeLimitsLabel="Free plan includes 1 analysis and up to 5 min videos."
              onStartAnalysis={onStartAnalysis}
            />
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">A full report, not just a score</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                { Icon: Shield, title: "Quality Check", desc: "Find issues with lighting, framing, audio, pacing, and visual clarity." },
                { Icon: Scissors, title: "Editing Suggestions", desc: "See what to cut, where viewers may drop off, and how to improve flow." },
                { Icon: AlignLeft, title: "Transcript", desc: "Get the spoken transcript with timestamps so you can repurpose faster." },
                { Icon: TrendingUp, title: "Publish Package", desc: "Generate title ideas, descriptions, tags, and packaging suggestions." },
              ].map((card) => (
                <div key={card.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-2xl hover:-translate-y-0.5 transition-transform">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
                    <card.Icon className="h-5 w-5 text-white/80" />
                  </div>
                  <p className="mt-4 text-lg font-bold">{card.title}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">{card.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section id="example-report" className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">See what your analysis looks like</h2>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-white/55">Example report preview. Some advanced parts are locked until signup.</p>
            <div className="mt-8">
              <ExampleReportPreview />
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">How it works</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { n: "Step 1", title: "Upload your video", desc: "Choose your video and analysis type.", Icon: Upload },
                { n: "Step 2", title: "DayTabs reviews it", desc: "We check quality, pacing, transcript, and publishing potential.", Icon: Sparkles },
                { n: "Step 3", title: "Get your action plan", desc: "See exactly what to fix before publishing.", Icon: ArrowRight },
              ].map((s) => (
                <div key={s.n} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{s.n}</p>
                  <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
                    <s.Icon className="h-5 w-5 text-white/80" />
                  </div>
                  <p className="mt-4 text-lg font-bold">{s.title}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">{s.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px] grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-xl shadow-black/30 backdrop-blur-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Before</p>
              <ul className="mt-4 space-y-3 text-white/70">
                {["Guessing if the video is good", "Publishing without knowing weak spots", "Spending too much time editing randomly"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/25" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-xl shadow-black/30 backdrop-blur-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">After</p>
              <ul className="mt-4 space-y-3 text-white/70">
                {["Clear quality score", "Specific editing fixes", "Better titles and tags", "More confidence before publishing"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/25" />{t}</li>
                ))}
              </ul>
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Analyze the parts that actually affect performance</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                { title: "Quality", desc: "Lighting, audio, framing, sharpness, pacing", Icon: Shield, tone: "border-sky-400/20 bg-sky-500/10 text-sky-100" },
                { title: "Editing", desc: "Hook moments, cut points, timeline notes, B-roll suggestions", Icon: Scissors, tone: "border-amber-400/20 bg-amber-500/10 text-amber-100" },
                { title: "Transcript", desc: "Timestamped transcript, repurposing support", Icon: AlignLeft, tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" },
                { title: "Publish", desc: "Titles, descriptions, tags, packaging ideas", Icon: TrendingUp, tone: "border-violet-400/20 bg-violet-500/10 text-violet-100" },
              ].map((m) => (
                <div key={m.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-2xl hover:-translate-y-0.5 transition-transform">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${m.tone}`}>
                    <m.Icon className="h-4 w-4" />
                    {m.title}
                  </div>
                  <p className="mt-4 text-sm text-white/65">{m.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-20">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Who it is for</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                { title: "Content creators", desc: "Improve videos before posting.", Icon: Sparkles },
                { title: "YouTubers", desc: "Find weak hooks, editing issues, and packaging ideas.", Icon: Target },
                { title: "Founders", desc: "Analyze product demos and launch videos.", Icon: CheckCircle2 },
                { title: "Social media managers", desc: "Review short-form content before publishing.", Icon: FileText },
              ].map((c) => (
                <div key={c.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30 backdrop-blur-2xl hover:-translate-y-0.5 transition-transform">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
                    <c.Icon className="h-5 w-5 text-white/80" />
                  </div>
                  <p className="mt-4 text-lg font-bold">{c.title}</p>
                  <p className="mt-2 text-sm text-white/55 leading-6">{c.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-24">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <div className="rounded-[40px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.26),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 shadow-2xl shadow-black/60 backdrop-blur-2xl">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight">Ready to improve your next video?</h2>
              <p className="mt-3 text-sm md:text-base text-white/55">Upload your video, sign up free, and get your first analysis inside DayTabs.</p>
              <div className="mt-8">
                <LandingVideoUploadPreview
                  compact
                  freeLimitsLabel="Your video is not uploaded yet. You will upload again after signup."
                  onStartAnalysis={onStartAnalysis}
                />
              </div>
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-24">
          <motion.div {...fadeIn(0)} className="mx-auto max-w-[1200px]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">What is an AI video analysis tool?</h2>
              <p className="mt-4 text-sm md:text-base text-white/60 leading-7">
                An AI video analysis tool reviews your video and gives feedback on quality, editing, transcript, and publishing. It helps you understand what to fix before posting.
              </p>
              <h2 className="mt-8 text-2xl md:text-3xl font-black tracking-tight">Why analyze your video before publishing?</h2>
              <p className="mt-4 text-sm md:text-base text-white/60 leading-7">
                Most creators publish without knowing where viewers may lose interest. Video analysis helps you find weak hooks, unclear sections, audio problems, visual issues, and better ways to package your content.
              </p>
              <h2 className="mt-8 text-2xl md:text-3xl font-black tracking-tight">What does DayTabs analyze?</h2>
              <p className="mt-4 text-sm md:text-base text-white/60 leading-7">
                DayTabs analyzes video quality, editing moments, transcript, pacing, and publishing details like titles, descriptions, and tags.
              </p>
              <h2 className="mt-8 text-2xl md:text-3xl font-black tracking-tight">Who should use video analysis?</h2>
              <p className="mt-4 text-sm md:text-base text-white/60 leading-7">
                Video analysis is useful for creators, YouTubers, founders, educators, and anyone who wants better videos with less guessing.
              </p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Keywords</p>
                <p className="mt-3 text-sm text-white/55 leading-7">
                  AI video analysis, video analysis tool, analyze video before publishing, video quality checker, AI video feedback, YouTube video analysis, short-form video analysis, video editing suggestions, video transcript tool, video publish package.
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <FeatureAuthModal
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        title="Create a free account to continue"
        subtitle={pendingSummary ? `You selected ${pendingSummary}. Sign up first, then upload again securely inside the app.` : "Sign up first, then upload again securely inside the app."}
        onAuthed={onAuthed}
      />
    </div>
  );
}


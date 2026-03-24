import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, Sparkles, Loader2, MonitorPlay, Copy, Check,
  Camera, Film, Lightbulb, Lock, ChevronDown, ChevronUp, RotateCcw, Pencil,
} from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { useUser } from "@/hooks/use-user";
import { PlanPickerModal } from "@/components/PlanPickerModal";

interface Section {
  start: string;
  end: string;
  text: string;
  camera_angle: string;
  broll: string;
  presentation_tip: string;
}

interface ScriptResult {
  script: string;
  sections: Section[];
  teleprompter_ready: boolean;
  plan: string;
  full_plan: boolean;
}

function PlanGateBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="relative rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-purple-600/5 pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Full Content Plan is a Premium feature</p>
          <p className="text-xs text-white/40 mt-0.5">Upgrade to unlock all camera angles, B-roll suggestions, and presentation tips for every section.</p>
        </div>
        <button
          onClick={onUpgrade}
          className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white text-xs font-semibold transition-all shadow-lg shadow-violet-500/20 cursor-pointer"
        >
          Upgrade to Premium
        </button>
      </div>
    </div>
  );
}

export default function ScriptPlannerTab() {
  const { user } = useUser();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setIsEditing(false);

    try {
      const token = localStorage.getItem("daytabs_token");
      const res = await fetch("/api/script-planner/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ idea: idea.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setResult(data as ScriptResult);
      setEditedScript(data.script);
      setSectionsExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setResult(null);
    setEditedScript("");
    setError(null);
    setIsEditing(false);
  };

  const isFree = !result?.full_plan;

  return (
    <>
      {teleprompterOpen && (
        <Teleprompter
          script={editedScript || result?.script || ""}
          onClose={() => setTeleprompterOpen(false)}
        />
      )}
      {showUpgrade && <PlanPickerModal onClose={() => setShowUpgrade(false)} />}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold flex items-center justify-center gap-3">
            <Clapperboard className="w-8 h-8 text-primary" />
            Script & Content Planner
          </h2>
          <p className="text-white/50 text-sm">
            Enter your video idea and get a full influencer-style script, camera plan, and teleprompter-ready content.
          </p>
        </div>

        {/* Input card */}
        <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-white/70">Your Video Idea</span>
          </div>
          <div className="p-5 space-y-4">
            <textarea
              value={idea}
              onChange={e => setIdea(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
              placeholder="e.g. How I went from 0 to 10,000 subscribers in 6 months by posting consistently and optimising my thumbnails…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/50 transition-all leading-relaxed min-h-[100px]"
              maxLength={1000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/25">{idea.length}/1000</span>
              <button
                onClick={handleGenerate}
                disabled={loading || idea.trim().length < 5}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-primary/20 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Script & Plan
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-white/20">Tip: Press Cmd/Ctrl + Enter to generate</p>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading skeleton */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-card rounded-2xl border border-white/8 p-5 space-y-3">
                  <div className="h-4 bg-white/5 rounded-lg w-1/3 animate-pulse" />
                  <div className="h-3 bg-white/5 rounded-lg w-full animate-pulse" />
                  <div className="h-3 bg-white/5 rounded-lg w-4/5 animate-pulse" />
                  <div className="h-3 bg-white/5 rounded-lg w-2/3 animate-pulse" />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Script card */}
              <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-sm font-semibold text-white">Generated Script</span>
                    <span className="text-xs text-white/30 ml-1">· Teleprompter ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(!isEditing);
                        if (!isEditing) setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/8 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/8 transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-red-400 hover:bg-white/8 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    value={editedScript}
                    onChange={e => setEditedScript(e.target.value)}
                    className="w-full bg-transparent px-5 py-4 text-sm text-white/85 resize-none focus:outline-none leading-relaxed min-h-[320px] font-mono"
                    spellCheck
                  />
                ) : (
                  <div className="px-5 py-4 text-sm text-white/80 leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto">
                    {editedScript}
                  </div>
                )}

                <div className="px-5 py-3.5 border-t border-white/8 flex items-center gap-3">
                  <button
                    onClick={() => setTeleprompterOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white text-sm font-semibold transition-all shadow-lg shadow-primary/20 cursor-pointer"
                  >
                    <MonitorPlay className="w-4 h-4" />
                    Open Teleprompter
                  </button>
                  <span className="text-xs text-white/25">Read your script on camera with auto-scroll</span>
                </div>
              </div>

              {/* Plan gate banner for free users */}
              {isFree && (
                <PlanGateBanner onUpgrade={() => setShowUpgrade(true)} />
              )}

              {/* Video Plan table */}
              {result.sections.length > 0 && (
                <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
                  <button
                    onClick={() => setSectionsExpanded(v => !v)}
                    className="w-full px-5 py-3.5 border-b border-white/8 flex items-center justify-between hover:bg-white/3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-white">Video Plan</span>
                      <span className="text-xs text-white/30 ml-1">· {result.sections.length} section{result.sections.length !== 1 ? "s" : ""}</span>
                      {isFree && (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                          Preview only
                        </span>
                      )}
                    </div>
                    {sectionsExpanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                  </button>

                  <AnimatePresence>
                    {sectionsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="divide-y divide-white/5">
                          {result.sections.map((section, i) => (
                            <div key={i} className="p-5 space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/20 shrink-0">
                                  {section.start} – {section.end}
                                </span>
                                <p className="text-sm text-white/80 font-medium leading-snug line-clamp-2">{section.text}</p>
                              </div>

                              <div className="grid sm:grid-cols-3 gap-3">
                                <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] border border-white/8 p-3">
                                  <Camera className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Camera Angle</p>
                                    <p className="text-xs text-white/65 leading-relaxed">{section.camera_angle || "—"}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] border border-white/8 p-3">
                                  <Film className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">B-Roll</p>
                                    <p className="text-xs text-white/65 leading-relaxed">{section.broll || "—"}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] border border-white/8 p-3">
                                  <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Presentation Tip</p>
                                    <p className="text-xs text-white/65 leading-relaxed">{section.presentation_tip || "—"}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {isFree && (
                          <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/95 z-10 pointer-events-none rounded-b-2xl" />
                            <div className="h-12" />
                            <div className="relative z-20 px-5 pb-5 text-center">
                              <button
                                onClick={() => setShowUpgrade(true)}
                                className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-semibold cursor-pointer"
                              >
                                Unlock all sections with Premium →
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Regenerate */}
              <div className="text-center">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:border-primary/30 hover:bg-white/5 text-white/50 hover:text-white/80 text-sm font-medium transition-all cursor-pointer disabled:opacity-40"
                >
                  <RotateCcw className="w-4 h-4" />
                  Regenerate Script
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How it works (empty state) */}
        {!result && !loading && (
          <div className="grid sm:grid-cols-3 gap-4 pt-2">
            {[
              { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/10", title: "AI-Powered Script", desc: "Influencer-style scripts with hooks, pacing, and natural delivery cues." },
              { icon: Camera, color: "text-blue-400", bg: "bg-blue-500/10", title: "Camera & B-Roll Plan", desc: "Exact angles, shot types, and B-roll suggestions for each section." },
              { icon: MonitorPlay, color: "text-green-400", bg: "bg-green-500/10", title: "Teleprompter Ready", desc: "Send your script straight to the teleprompter with one click." },
            ].map(item => (
              <div key={item.title} className="glass-card rounded-2xl border border-white/8 p-5 space-y-3">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}

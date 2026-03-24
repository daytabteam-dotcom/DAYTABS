import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, Send, Loader2, MonitorPlay, Copy, Check,
  Camera, Film, Lightbulb, Lock, ChevronDown, ChevronUp,
  Pencil, RotateCcw, Bot, User, Sparkles, PenLine,
} from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { PlanPickerModal } from "@/components/PlanPickerModal";

interface Section {
  start: string;
  end: string;
  label?: string;
  text: string;
  camera_angle: string;
  broll: string;
  presentation_tip: string;
}

interface ScriptResult {
  script: string;
  title: string;
  sections: Section[];
  full_plan: boolean;
}

interface ApiChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;
  isLoading?: boolean;
}

const STARTER_PROMPTS = [
  "A YouTube video about how I grew my channel from 0 to 10K subscribers in 90 days",
  "A short-form video on the biggest mistake new creators make with thumbnails",
  "A tutorial video on how to film professional-looking videos with just a smartphone",
  "A storytime video about a lesson I learned from posting daily for 30 days",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-white/40"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export default function ScriptPlannerTab() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rightTab, setRightTab] = useState<"script" | "plan">("script");
  const [sectionsExpanded, setSectionsExpanded] = useState<Record<number, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();

    const newUserMsg: ChatMessage = { id: userMsgId, role: "user", content: trimmed };
    const loadingMsg: ChatMessage = { id: asstMsgId, role: "assistant", content: "", isLoading: true };

    setChatMessages(prev => [...prev, newUserMsg, loadingMsg]);
    setInput("");
    setLoading(true);

    const newApiHistory: ApiChatMessage[] = [...apiHistory, { role: "user", content: trimmed }];

    try {
      const token = localStorage.getItem("daytabs_token");
      const res = await fetch("/api/script-planner/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: newApiHistory }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      const newResult: ScriptResult = {
        script: data.script,
        title: data.title ?? "",
        sections: data.sections ?? [],
        full_plan: data.full_plan ?? false,
      };

      setResult(newResult);
      setEditedScript(data.script);
      setIsEditing(false);
      setRightTab("script");

      const assistantRaw = data.raw ?? JSON.stringify({ script: data.script, sections: data.sections });
      const updatedApiHistory: ApiChatMessage[] = [
        ...newApiHistory,
        { role: "assistant", content: assistantRaw },
      ];
      setApiHistory(updatedApiHistory);

      setChatMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, isLoading: false, summary: data.summary ?? "Script ready." }
            : m
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setChatMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, isLoading: false, summary: `Error: ${msg}`, content: "error" }
            : m
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, apiHistory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = () => {
    setChatMessages([]);
    setApiHistory([]);
    setResult(null);
    setEditedScript("");
    setInput("");
    setIsEditing(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedScript || result?.script || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFree = result ? !result.full_plan : false;

  return (
    <>
      {teleprompterOpen && (
        <Teleprompter
          script={editedScript || result?.script || ""}
          onClose={() => setTeleprompterOpen(false)}
        />
      )}
      {showUpgrade && <PlanPickerModal onClose={() => setShowUpgrade(false)} />}

      {/* Full-height split panel — break out of the tab's py-12 padding */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-12 md:-mt-16 flex" style={{ height: "calc(100vh - 152px)" }}>

        {/* ── LEFT: Chat panel ── */}
        <div className="flex flex-col w-[38%] min-w-[300px] border-r border-white/8 bg-background/40">
          {/* Chat header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Content Strategist</p>
                <p className="text-[10px] text-white/30">Powered by GPT-4o</p>
              </div>
            </div>
            {chatMessages.length > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/8 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                New chat
              </button>
            )}
          </div>

          {/* Chat messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-6 px-2">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto">
                    <Clapperboard className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-white">What's your video about?</p>
                  <p className="text-xs text-white/35 leading-relaxed">
                    Describe your idea and get a full influencer-style script with camera plan. You can keep refining it through conversation.
                  </p>
                </div>
                <div className="w-full space-y-2">
                  {STARTER_PROMPTS.map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-primary/30 text-xs text-white/50 hover:text-white/80 transition-all cursor-pointer leading-relaxed"
                    >
                      <Sparkles className="w-3 h-3 text-primary/50 inline mr-1.5 mb-0.5" />
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/30"
                    : "bg-white/8 border border-white/10"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-3.5 h-3.5 text-primary" />
                    : <Bot className="w-3.5 h-3.5 text-white/50" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/20 text-white/90 rounded-tr-sm"
                    : msg.content === "error"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400 rounded-tl-sm"
                      : "bg-white/[0.05] border border-white/8 text-white/70 rounded-tl-sm"
                }`}>
                  {msg.isLoading ? (
                    <TypingDots />
                  ) : msg.role === "user" ? (
                    msg.content
                  ) : (
                    <div className="flex items-start gap-2">
                      {msg.content !== "error" && (
                        <div className="w-3.5 h-3.5 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center shrink-0 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        </div>
                      )}
                      <span>{msg.summary}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 px-4 py-4 border-t border-white/8">
            {result && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["Make the hook shorter", "Add more energy", "Make it more casual", "Extend to 10 mins"].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 hover:bg-primary/10 text-[10px] text-white/40 hover:text-white/70 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={result ? "Ask for changes… (e.g. make the hook punchier)" : "Describe your video idea…"}
                disabled={loading}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/40 transition-all leading-relaxed disabled:opacity-50 scrollbar-none"
                rows={2}
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || input.trim().length < 2}
                className="shrink-0 w-9 h-9 rounded-xl bg-primary hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-primary/20 cursor-pointer"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                  : <Send className="w-4 h-4 text-white" />
                }
              </button>
            </div>
            <p className="text-[10px] text-white/20 mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* ── RIGHT: Results panel ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-background/20">
          {!result ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                <PenLine className="w-8 h-8 text-white/20" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white/40">Your script will appear here</p>
                <p className="text-xs text-white/20 max-w-xs leading-relaxed">
                  Start by describing your video idea in the chat. You can keep refining it with follow-up messages.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 w-full max-w-lg">
                {[
                  { icon: Camera, label: "Camera Plan", color: "text-blue-400 bg-blue-500/10" },
                  { icon: Film, label: "B-Roll Ideas", color: "text-purple-400 bg-purple-500/10" },
                  { icon: Lightbulb, label: "Delivery Tips", color: "text-yellow-400 bg-yellow-500/10" },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border border-white/8 p-4 flex flex-col items-center gap-2 ${item.color.split(" ")[1]} bg-opacity-5`}>
                    <item.icon className={`w-5 h-5 ${item.color.split(" ")[0]}`} />
                    <p className="text-xs text-white/40 font-medium">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col h-full"
              >
                {/* Result header */}
                <div className="shrink-0 px-6 py-4 border-b border-white/8 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    {result.title && (
                      <p className="text-xs text-primary/70 font-medium truncate mb-0.5">{result.title}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {/* Script / Plan tabs */}
                      <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/8">
                        <button
                          onClick={() => setRightTab("script")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            rightTab === "script"
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "text-white/40 hover:text-white/70"
                          }`}
                        >
                          Script
                        </button>
                        <button
                          onClick={() => setRightTab("plan")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            rightTab === "plan"
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "text-white/40 hover:text-white/70"
                          }`}
                        >
                          Video Plan
                          {isFree && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] border border-amber-500/20">Preview</span>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setIsEditing(!isEditing); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/8 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/8 transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => setTeleprompterOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white text-xs font-semibold transition-all shadow-md shadow-primary/15 cursor-pointer"
                    >
                      <MonitorPlay className="w-3.5 h-3.5" />
                      Teleprompter
                    </button>
                  </div>
                </div>

                {/* Script panel */}
                {rightTab === "script" && (
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {isEditing ? (
                      <textarea
                        value={editedScript}
                        onChange={e => setEditedScript(e.target.value)}
                        className="w-full h-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/85 resize-none focus:outline-none focus:border-violet-500/40 transition-all leading-relaxed font-mono"
                        spellCheck
                        autoFocus
                      />
                    ) : (
                      <div className="text-sm text-white/80 leading-[1.85] whitespace-pre-wrap">
                        {editedScript.split("\n").map((line, i) => {
                          const isPacingCue = /\[([A-Z ]+)\]/.test(line);
                          return (
                            <p
                              key={i}
                              className={`${line.trim() === "" ? "mb-4" : "mb-1"} ${
                                isPacingCue ? "mb-1 font-mono text-xs italic text-[#ffffff99]" : ""
                              }`}
                            >
                              {line || "\u00A0"}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Video Plan panel */}
                {rightTab === "plan" && (
                  <div className="flex-1 overflow-y-auto">
                    {isFree && (
                      <div className="mx-6 mt-5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                        <div className="flex items-start gap-3">
                          <Lock className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-white">Full Video Plan is a Premium feature</p>
                            <p className="text-[11px] text-white/40 mt-0.5">Upgrade to unlock all camera angles, B-roll, and presentation tips.</p>
                          </div>
                          <button
                            onClick={() => setShowUpgrade(true)}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-500 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Upgrade
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="px-6 py-5 space-y-3">
                      {result.sections.length === 0 && (
                        <p className="text-sm text-white/30 text-center py-8">No sections generated yet.</p>
                      )}
                      {result.sections.map((section, i) => {
                        const isOpen = sectionsExpanded[i] !== false;
                        return (
                          <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
                            <button
                              onClick={() => setSectionsExpanded(prev => ({ ...prev, [i]: !isOpen }))}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer text-left"
                            >
                              <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold border border-primary/20">
                                {section.start}–{section.end}
                              </span>
                              <span className="text-xs font-semibold text-white/70 flex-1 truncate">
                                {section.label ? `${section.label}: ` : ""}
                                {section.text.slice(0, 70)}{section.text.length > 70 ? "…" : ""}
                              </span>
                              {isOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-white/20 shrink-0" />
                                : <ChevronDown className="w-3.5 h-3.5 text-white/20 shrink-0" />
                              }
                            </button>

                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 grid sm:grid-cols-3 gap-2.5 border-t border-white/5 pt-3">
                                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Camera className="w-3.5 h-3.5 text-blue-400" />
                                        <p className="text-[9px] font-semibold text-blue-400/70 uppercase tracking-wider">Camera Angle</p>
                                      </div>
                                      <p className="text-[11px] text-white/60 leading-relaxed">{section.camera_angle || "—"}</p>
                                    </div>
                                    <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-3">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Film className="w-3.5 h-3.5 text-purple-400" />
                                        <p className="text-[9px] font-semibold text-purple-400/70 uppercase tracking-wider">B-Roll</p>
                                      </div>
                                      <p className="text-[11px] text-white/60 leading-relaxed">{section.broll || "—"}</p>
                                    </div>
                                    <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-3">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                                        <p className="text-[9px] font-semibold text-yellow-400/70 uppercase tracking-wider">Delivery Tip</p>
                                      </div>
                                      <p className="text-[11px] text-white/60 leading-relaxed">{section.presentation_tip || "—"}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
}

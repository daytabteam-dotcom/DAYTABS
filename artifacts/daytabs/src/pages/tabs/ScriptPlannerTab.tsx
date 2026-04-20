import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, Send, Loader2, MonitorPlay, Copy, Check,
  Camera, Film, Lightbulb, Lock, ChevronDown, ChevronUp,
  Pencil, Bot, User, Sparkles, PenLine, Trash2, MessageSquarePlus, Plus, Menu,
} from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { useUser } from "@/hooks/use-user";
import { usePlan } from "@/hooks/use-plan";
import { PanelCard, PanelCardSoft, PanelHeader, PanelTitle, PanelSubtitle, PanelPage } from "@/components/panel-system";

// ── Types ────────────────────────────────────────────────────────────────────

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

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;
}

interface SavedChat {
  id: number;
  title: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("daytabs_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-violet-400/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

const STARTER_PROMPTS = [
  "How I grew my channel from 0 to 10K subscribers in 90 days",
  "The biggest mistake new creators make with thumbnails",
  "How to film professional videos with just a smartphone",
  "What I learned posting daily for 30 days",
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScriptPlannerTab() {
  const { user } = useUser();
  const { getScriptPlannerLimits } = usePlan();
  const plan = user?.plan ?? "free";
  const isFreeUser = plan === "free";
  const scriptLimits = getScriptPlannerLimits();

  // Chat state
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Result state
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [rightTab, setRightTab] = useState<"script" | "plan">("script");
  const [sectionsExpanded, setSectionsExpanded] = useState<Record<number, boolean>>({});

  // Saved chats
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // UI toggles
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "script" | "plan">("chat");
  const [historyOpen, setHistoryOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Derived limits
  const usageRemaining = scriptLimits.generationsRemaining;
  const isAtGenerationLimit = usageRemaining <= 0;

  // ── Load chat list on mount ─────────────────────────────────────────────

  const loadChatList = useCallback(async () => {
    try {
      const res = await fetch("/api/script-planner/chats", { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setSavedChats(data.chats ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadChatList(); }, [loadChatList]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  // ── Persist chat ─────────────────────────────────────────────────────────

  const persistChat = useCallback(async (
    msgs: DisplayMessage[],
    hist: ApiChatMessage[],
    scriptResult: ScriptResult,
    currentChatId: number | null,
    title: string,
  ): Promise<number | null> => {
    try {
      if (currentChatId) {
        await fetch(`/api/script-planner/chats/${currentChatId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ displayMessages: msgs, apiHistory: hist, result: scriptResult }),
        });
        setSavedChats(prev =>
          prev.map(c => c.id === currentChatId ? { ...c, updatedAt: new Date().toISOString() } : c)
        );
        return currentChatId;
      } else {
        const res = await fetch("/api/script-planner/chats", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: title.slice(0, 80), displayMessages: msgs, apiHistory: hist, result: scriptResult }),
        });
        const data = await res.json();
        if (res.status === 403 && data.limitReached) return currentChatId;
        if (data.chatId) {
          setActiveChatId(data.chatId);
          await loadChatList();
          return data.chatId as number;
        }
      }
      await loadChatList();
    } catch { /* silent */ }
    return currentChatId;
  }, [loadChatList]);

  // ── Load a chat ──────────────────────────────────────────────────────────

  const loadChat = useCallback(async (chatId: number) => {
    setChatsLoading(true);
    try {
      const res = await fetch(`/api/script-planner/chats/${chatId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const { chat } = await res.json();
      setDisplayMessages((chat.displayMessages as DisplayMessage[]) ?? []);
      setApiHistory((chat.apiHistory as ApiChatMessage[]) ?? []);
      const r = chat.result as ScriptResult | null;
      setResult(r);
      setEditedScript(r?.script ?? "");
      setIsEditing(false);
      setActiveChatId(chatId);
      setRightTab("script");
      setMobileView("chat");
      setHistoryOpen(false);
    } catch { /* silent */ }
    finally { setChatsLoading(false); }
  }, []);

  // ── Delete a chat ────────────────────────────────────────────────────────

  const deleteChat = useCallback(async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(chatId);
    try {
      await fetch(`/api/script-planner/chats/${chatId}`, { method: "DELETE", headers: authHeaders() });
      if (activeChatId === chatId) handleNewChat();
      setSavedChats(prev => prev.filter(c => c.id !== chatId));
    } catch { /* silent */ }
    finally { setDeletingId(null); }
  }, [activeChatId]);

  // ── New chat ─────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    setDisplayMessages([]);
    setApiHistory([]);
    setResult(null);
    setEditedScript("");
    setIsEditing(false);
    setActiveChatId(null);
    setInput("");
    setMobileView("chat");
    setHistoryOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || isAtGenerationLimit) return;

    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();

    const newUserDisplay: DisplayMessage = { id: userMsgId, role: "user", content: trimmed };
    const loadingDisplay: DisplayMessage = { id: asstMsgId, role: "assistant", content: "" };

    const updatedDisplay = [...displayMessages, newUserDisplay, loadingDisplay];
    setDisplayMessages(updatedDisplay);
    setInput("");
    setLoading(true);

    const newApiHistory: ApiChatMessage[] = [...apiHistory, { role: "user", content: trimmed }];

    try {
      const res = await fetch("/api/script-planner/generate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ messages: newApiHistory }),
      });

      const data = await res.json();

      if ((res.status === 403 || res.status === 429) && data.limitReached) {
        setDisplayMessages(prev => prev.filter(m => m.id !== asstMsgId && m.id !== userMsgId));
        setShowUpgrade(true);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Generation failed");

      const scriptResult: ScriptResult = {
        script: data.script,
        title: data.title ?? "",
        sections: data.sections ?? [],
        full_plan: data.full_plan ?? false,
      };

      setResult(scriptResult);
      setEditedScript(data.script);
      setIsEditing(false);
      setRightTab("script");

      const assistantRaw = data.raw ?? JSON.stringify({ script: data.script, sections: data.sections });
      const finalApiHistory: ApiChatMessage[] = [...newApiHistory, { role: "assistant", content: assistantRaw }];
      setApiHistory(finalApiHistory);

      const finalDisplay: DisplayMessage[] = updatedDisplay.map(m =>
        m.id === asstMsgId ? { ...m, summary: data.summary ?? "Script ready." } : m
      );
      setDisplayMessages(finalDisplay);

      await persistChat(finalDisplay, finalApiHistory, scriptResult, activeChatId, trimmed.slice(0, 80));

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setDisplayMessages(prev =>
        prev.map(m => m.id === asstMsgId ? { ...m, summary: `Error: ${msg}`, content: "error" } : m)
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, isAtGenerationLimit, displayMessages, apiHistory, activeChatId, persistChat]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedScript || result?.script || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFreeResult = result ? !result.full_plan : false;
  const activeChatTitle = activeChatId
    ? (savedChats.find(c => c.id === activeChatId)?.title ?? "AI Content Strategist")
    : "AI Content Strategist";

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {teleprompterOpen && (
        <Teleprompter
          script={editedScript || result?.script || ""}
          onClose={() => setTeleprompterOpen(false)}
        />
      )}
      {showUpgrade && <PlanPickerModal onClose={() => setShowUpgrade(false)} />}

      <PanelPage className="space-y-4 lg:hidden">
        <PanelHeader className="gap-3">
          <div>
            <PanelTitle>Script Planner</PanelTitle>
            <PanelSubtitle>Chat with DayTabs, shape the angle, then switch into script or shot plan when you are ready.</PanelSubtitle>
          </div>
        </PanelHeader>

        <PanelCard className="flex min-h-[calc(100dvh-12.5rem)] flex-col overflow-hidden">
          <div className="border-b border-white/8 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Bot className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{activeChatTitle}</p>
                <p className="mt-0.5 text-[11px] text-white/30">AI script coach · mobile chat view</p>
              </div>
              <button
                onClick={() => setHistoryOpen((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Open script planner menu"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/55">
                {scriptLimits.generationsUsed}/{scriptLimits.generationLimit} generations used
              </span>
              <span className={`rounded-full border px-3 py-1 text-[11px] ${
                usageRemaining <= 0
                  ? "border-red-400/20 bg-red-500/10 text-red-200"
                  : usageRemaining <= 3
                    ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
              }`}>
                {usageRemaining} left this month
              </span>
              {isFreeUser ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
                  Free includes 1 script generation
                </span>
              ) : null}
            </div>
            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Recent chats</p>
                      <button
                        onClick={handleNewChat}
                        className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-600/20 px-2.5 py-1.5 text-xs text-violet-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add new
                      </button>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1 scrollbar-none">
                      {savedChats.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/35">
                          Start a conversation to build your first script.
                        </div>
                      ) : (
                        savedChats.map(chat => {
                          const isActive = chat.id === activeChatId;
                          const isDeleting = deletingId === chat.id;
                          return (
                            <div
                              key={chat.id}
                              onClick={() => !isActive && loadChat(chat.id)}
                              className={`group relative rounded-xl border px-3 py-3 transition-all ${
                                isActive
                                  ? "border-white/15 bg-white/[0.06]"
                                  : "border-white/8 bg-white/[0.03]"
                              }`}
                            >
                              <p className={`pr-7 text-sm font-medium leading-snug ${isActive ? "text-white" : "text-white/65"}`}>
                                {chat.title}
                              </p>
                              <p className="mt-1 text-[11px] text-white/30">{relativeTime(chat.updatedAt)}</p>
                              <button
                                onClick={(e) => deleteChat(chat.id, e)}
                                disabled={isDeleting}
                                className="absolute right-2 top-2 rounded-md p-1 text-white/25 transition-all hover:bg-red-500/15 hover:text-red-400"
                              >
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1">
              <button
                onClick={() => setMobileView("chat")}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  mobileView === "chat" ? "bg-violet-600/25 text-violet-100" : "text-white/45"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => {
                  setRightTab("script");
                  setMobileView("script");
                }}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  mobileView === "script" ? "bg-violet-600/25 text-violet-100" : "text-white/45"
                }`}
              >
                Script
              </button>
              <button
                onClick={() => {
                  setRightTab("plan");
                  setMobileView("plan");
                }}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  mobileView === "plan" ? "bg-violet-600/25 text-violet-100" : "text-white/45"
                }`}
              >
                Plan
              </button>
            </div>
          </div>

          {mobileView === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none">
                {chatsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-white/20" />
                  </div>
                )}

                {!chatsLoading && displayMessages.length === 0 && (
                  <div className="flex min-h-[38vh] flex-col items-center justify-center gap-5 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                      <Clapperboard className="h-7 w-7 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-white">What are we making?</p>
                      <p className="mx-auto max-w-[18rem] text-sm leading-relaxed text-white/40">
                        Drop in your topic like a chat prompt and I&apos;ll turn it into a structured script.
                      </p>
                    </div>
                    <div className="w-full space-y-2">
                      {STARTER_PROMPTS.map(p => (
                        <button
                          key={p}
                          onClick={() => sendMessage(p)}
                          disabled={isAtGenerationLimit}
                          className="panel-card-soft panel-hover w-full cursor-pointer px-4 py-3 text-left text-sm leading-snug text-white/55 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Sparkles className="mr-2 inline h-3.5 w-3.5 text-primary/60" />
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!chatsLoading && displayMessages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`mb-3 flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      msg.role === "user"
                        ? "border border-primary/25 bg-primary/20"
                        : "border border-white/10 bg-white/6"
                    }`}>
                      {msg.role === "user"
                        ? <User className="h-3.5 w-3.5 text-primary" />
                        : <Bot className="h-3.5 w-3.5 text-white/40" />
                      }
                    </div>
                    <div className={`max-w-[84%] rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-tr-sm border border-primary/20 bg-primary/16 text-white/90"
                        : msg.content === "error"
                          ? "rounded-tl-sm border border-red-500/20 bg-red-500/10 text-red-300"
                          : "rounded-tl-sm border border-white/8 bg-white/[0.04] text-white/72"
                    }`}>
                      {!msg.summary && msg.role === "assistant" && msg.content !== "error"
                        ? <TypingDots />
                        : msg.role === "user"
                          ? msg.content
                          : (
                            <div className="flex items-start gap-2">
                              {msg.content !== "error" && (
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/20">
                                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                                </div>
                              )}
                              <span>{msg.summary}</span>
                            </div>
                          )
                      }
                    </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="sticky bottom-0 mt-auto border-t border-white/8 bg-[hsl(var(--panel-surface))]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur">
                {isAtGenerationLimit && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
                    <p className="text-xs leading-snug text-amber-300">You&apos;ve reached your monthly script limit.</p>
                    <button
                      onClick={() => setShowUpgrade(true)}
                      className="shrink-0 text-xs font-semibold text-amber-400"
                    >
                      Upgrade
                    </button>
                  </div>
                )}

                {result && !isAtGenerationLimit && (
                  <div className="mb-3 flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {["Shorter hook", "More energy", "More casual", "Extend to 10 mins"].map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        disabled={loading}
                        className="panel-card-soft panel-hover shrink-0 snap-start rounded-full px-3 py-1.5 text-[11px] text-white/45 disabled:opacity-40"
                      >
                        {s}
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
                    placeholder={
                      isAtGenerationLimit
                        ? "Upgrade to continue..."
                        : result
                          ? "Ask for changes..."
                          : "Describe your video idea..."
                    }
                    disabled={loading || isAtGenerationLimit}
                    className="panel-input min-h-[52px] flex-1 resize-none px-4 py-3 text-[14px] leading-relaxed text-white/85 disabled:opacity-40 scrollbar-none"
                    rows={2}
                    style={{ maxHeight: "120px" }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={loading || input.trim().length < 2 || isAtGenerationLimit}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-white/20">
                  <span>Enter to send</span>
                  <span>{scriptLimits.generationsUsed}/{scriptLimits.generationLimit} generations</span>
                </div>
              </div>
            </>
          ) : !result ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/4">
                <PenLine className="h-8 w-8 text-white/15" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-white/35">Your script will appear here</p>
                <p className="max-w-xs text-sm leading-relaxed text-white/20">
                  Start with a chat prompt, then switch back here for the polished script and shot plan.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-none">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-violet-300/80">{result.title || "Generated script"}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="rounded-lg border border-white/8 px-3 py-2 text-[12px] text-white/55"
                  >
                    {isEditing ? "Done" : "Edit"}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="rounded-lg border border-white/8 px-3 py-2 text-[12px] text-white/55"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {mobileView === "script" ? (
                <div className="px-4 py-4">
                  {isEditing ? (
                    <textarea
                      value={editedScript}
                      onChange={e => setEditedScript(e.target.value)}
                      className="min-h-[50vh] w-full rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-[14px] leading-[1.85] text-white/85 scrollbar-none"
                      spellCheck
                      autoFocus
                    />
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-[14px] leading-[1.85] text-white/78">
                      {editedScript.split("\n").map((line, i) => {
                        const isPacingCue = /\[([A-Z ]+)\]/.test(line);
                        return (
                          <p
                            key={i}
                            className={`${line.trim() === "" ? "mb-5" : "mb-1"} ${isPacingCue ? "font-mono text-[12px] italic tracking-wide text-violet-300/50" : ""}`}
                          >
                            {line || "\u00A0"}
                          </p>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => setTeleprompterOpen(true)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    <MonitorPlay className="h-4 w-4" />
                    Open in teleprompter
                  </button>
                </div>
              ) : (
                <div className="space-y-3 px-4 py-4">
                  {isFreeResult && (
                    <PanelCardSoft className="border border-primary/20 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/15">
                          <Lock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">Full video plan is a paid feature</p>
                          <p className="mt-1 text-xs leading-relaxed text-white/40">
                            Upgrade to unlock all camera angles, B-roll suggestions, and delivery tips for every section.
                          </p>
                        </div>
                      </div>
                    </PanelCardSoft>
                  )}

                  {result.sections.length === 0 ? (
                    <p className="py-10 text-center text-sm text-white/25">No sections generated yet.</p>
                  ) : (
                    result.sections.map((section, i) => {
                      const isOpen = sectionsExpanded[i] !== false;
                      return (
                        <PanelCard key={i} className="overflow-hidden">
                          <button
                            onClick={() => setSectionsExpanded(prev => ({ ...prev, [i]: !isOpen }))}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                          >
                            <span className="shrink-0 rounded-full border border-violet-500/20 bg-violet-600/15 px-2.5 py-1 text-[10px] font-bold text-violet-300">
                              {section.start} – {section.end}
                            </span>
                            <span className="flex-1 text-sm font-medium text-white/60">
                              {section.label ? `${section.label}: ` : ""}{section.text.slice(0, 52)}{section.text.length > 52 ? "…" : ""}
                            </span>
                            {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-white/20" /> : <ChevronDown className="h-4 w-4 shrink-0 text-white/20" />}
                          </button>
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="grid gap-3 border-t border-white/5 px-4 pb-4 pt-4">
                                  {[
                                    { icon: Camera, label: "Camera Angle", value: section.camera_angle, cls: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
                                    { icon: Film, label: "B-Roll", value: section.broll, cls: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15" },
                                    { icon: Lightbulb, label: "Delivery Tip", value: section.presentation_tip, cls: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                                  ].map(card => (
                                    <PanelCardSoft key={card.label} className={`p-3.5 ${card.bg}`}>
                                      <div className="mb-2 flex items-center gap-2">
                                        <card.icon className={`h-3.5 w-3.5 ${card.cls}`} />
                                        <p className={`text-[10px] font-bold uppercase tracking-wider opacity-70 ${card.cls}`}>{card.label}</p>
                                      </div>
                                      <p className="text-[12px] leading-relaxed text-white/60">{card.value || "-"}</p>
                                    </PanelCardSoft>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </PanelCard>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </PanelCard>
      </PanelPage>

      <div
        className="hidden lg:flex lg:-mx-8 lg:-mt-16"
        style={{ height: "calc(100dvh - 152px)" }}
      >
        <div className="flex w-[220px] shrink-0 flex-col border-r border-white/8 bg-[hsl(var(--panel-surface-soft))] xl:w-[240px]">
          <div className="shrink-0 border-b border-white/6 px-4 pb-4 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Chats</p>
              <button
                onClick={handleNewChat}
                title="New chat"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-violet-500/20 bg-violet-600/20 text-violet-400 transition-all hover:bg-violet-600/35"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/4 px-2.5 py-1.5">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${usageRemaining <= 0 ? "bg-red-400/80" : usageRemaining <= 3 ? "bg-amber-400/80" : "bg-emerald-400/80"}`} />
              <p className="text-[11px] text-white/35">
                {scriptLimits.generationsUsed}/{scriptLimits.generationLimit} script generations used
              </p>
            </div>
            {isFreeUser && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/6 bg-white/4 px-2.5 py-1.5">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
                <p className="text-[11px] text-white/35">Free includes 1 script generation</p>
              </div>
            )}
          </div>

          <div className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {savedChats.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <MessageSquarePlus className="h-6 w-6 text-white/10" />
                <p className="text-xs leading-relaxed text-white/20">Start a conversation to see your chats here</p>
              </div>
            )}
            {savedChats.map(chat => {
              const isActive = chat.id === activeChatId;
              const isDeleting = deletingId === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => !isActive && loadChat(chat.id)}
                  className={`group relative cursor-pointer rounded-lg border px-3 py-3 transition-all ${
                    isActive
                      ? "border-white/12 bg-white/[0.055]"
                      : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <p className={`line-clamp-2 pr-6 text-[12px] font-medium leading-snug ${
                    isActive ? "text-white" : "text-white/50 group-hover:text-white/75"
                  }`}>
                    {chat.title}
                  </p>
                  <p className="mt-1 text-[10px] text-white/25">{relativeTime(chat.updatedAt)}</p>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    disabled={isDeleting}
                    className="absolute right-2 top-2.5 rounded-md p-1 text-white/25 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex w-[360px] shrink-0 flex-col border-r border-white/8 bg-[hsl(var(--panel-surface))] xl:w-[390px]">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/6 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
              <Bot className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{activeChatTitle}</p>
              <p className="mt-0.5 text-[11px] text-white/30">GPT-4o · auto-saved</p>
            </div>
          </div>

          <div className="scrollbar-none flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {chatsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/20" />
              </div>
            )}

            {!chatsLoading && displayMessages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-6 px-2">
                <div className="space-y-2 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <Clapperboard className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-white">What&apos;s your video idea?</p>
                  <p className="mx-auto max-w-[220px] text-xs leading-relaxed text-white/35">
                    Describe it and I&apos;ll write a full script with camera plan and B-roll cues.
                  </p>
                </div>

                <div className="w-full space-y-2">
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      disabled={isAtGenerationLimit}
                      className="panel-card-soft panel-hover w-full cursor-pointer px-3.5 py-2.5 text-left text-[12px] leading-snug text-white/45 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Sparkles className="mb-0.5 mr-1.5 inline h-3 w-3 shrink-0 text-primary/60" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!chatsLoading && displayMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  msg.role === "user"
                    ? "border border-primary/25 bg-primary/20"
                    : "border border-white/10 bg-white/6"
                }`}>
                  {msg.role === "user"
                    ? <User className="h-3.5 w-3.5 text-primary" />
                    : <Bot className="h-3.5 w-3.5 text-white/40" />
                  }
                </div>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-tr-sm border border-primary/20 bg-primary/16 text-white/90"
                    : msg.content === "error"
                      ? "rounded-tl-sm border border-red-500/20 bg-red-500/10 text-red-400"
                      : "rounded-tl-sm border border-white/8 bg-white/[0.04] text-white/70"
                }`}>
                  {!msg.summary && msg.role === "assistant" && msg.content !== "error"
                    ? <TypingDots />
                    : msg.role === "user"
                      ? msg.content
                      : (
                        <div className="flex items-start gap-2">
                          {msg.content !== "error" && (
                            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/20">
                              <Check className="h-2.5 w-2.5 text-emerald-400" />
                            </div>
                          )}
                          <span>{msg.summary}</span>
                        </div>
                      )
                  }
                </div>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="shrink-0 border-t border-white/6 px-4 pb-4 pt-3">
            {isAtGenerationLimit && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
                <p className="text-xs leading-snug text-amber-300">You&apos;ve reached your monthly script limit.</p>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="shrink-0 whitespace-nowrap text-xs font-semibold text-amber-400 hover:text-amber-300"
                >
                  Upgrade →
                </button>
              </div>
            )}

            {result && !isAtGenerationLimit && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {["Shorter hook", "More energy", "More casual", "Extend to 10 mins"].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="panel-card-soft panel-hover cursor-pointer px-2.5 py-1 text-[11px] text-white/40 disabled:opacity-40"
                  >
                    {s}
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
                placeholder={
                  isAtGenerationLimit
                    ? "Upgrade to continue..."
                    : result
                      ? "Ask for changes..."
                      : "Describe your video idea..."
                }
                disabled={loading || isAtGenerationLimit}
                className="panel-input scrollbar-none flex-1 resize-none px-4 py-3 text-[13px] leading-relaxed text-white/85 disabled:opacity-40"
                rows={2}
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || input.trim().length < 2 || isAtGenerationLimit}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-white/15">Enter to send · Shift+Enter for newline</p>
              <span className={`text-[11px] font-semibold tabular-nums ${
                usageRemaining <= 0
                  ? "text-red-400"
                  : usageRemaining <= 3
                    ? "text-amber-400"
                    : "text-white/25"
              }`}>
                {scriptLimits.generationsUsed}/{scriptLimits.generationLimit} generations
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex flex-1 flex-col bg-white/[0.01]">
          {!result ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/8 bg-white/4">
                <PenLine className="h-8 w-8 text-white/15" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-white/30">Your script will appear here</p>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-white/18">
                  Start by describing your video idea in the chat. Refine it with follow-up messages.
                </p>
              </div>

              <div className="mt-6 grid w-full gap-4 xl:grid-cols-3">
                {[
                  { icon: Camera, label: "Camera Plan", sub: "Shot angles for every scene", cls: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
                  { icon: Film, label: "B-Roll Ideas", sub: "Visual suggestions per section", cls: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15" },
                  { icon: Lightbulb, label: "Delivery Tips", sub: "How to deliver each line", cls: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                ].map(item => (
                  <PanelCardSoft key={item.label} className={`flex flex-col gap-2.5 p-5 ${item.bg}`}>
                    <item.icon className={`h-5 w-5 ${item.cls}`} />
                    <div>
                      <p className={`text-sm font-semibold ${item.cls}`}>{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/30">{item.sub}</p>
                    </div>
                  </PanelCardSoft>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
                className="flex h-full flex-col"
              >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/6 px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {result.title && (
                      <p className="max-w-[240px] truncate text-sm font-medium text-violet-300/80">{result.title}</p>
                    )}
                    <div className="flex shrink-0 gap-1 rounded-lg border border-white/8 bg-white/5 p-1">
                      {(["script", "plan"] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setRightTab(tab)}
                          className={`cursor-pointer rounded-lg px-4 py-1.5 text-[12px] font-medium transition-all ${
                            rightTab === tab
                              ? "border border-violet-500/30 bg-violet-600/25 text-violet-200 shadow-sm"
                              : "text-white/40 hover:text-white/65"
                          }`}
                        >
                          {tab === "script" ? "Script" : "Video Plan"}
                          {tab === "plan" && isFreeResult && (
                            <span className="ml-1.5 rounded-full border border-amber-500/20 bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-400">
                              Preview
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-3.5 py-2 text-[12px] text-white/40 transition-all hover:border-white/8 hover:bg-white/6 hover:text-white/70"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-3.5 py-2 text-[12px] text-white/40 transition-all hover:border-white/8 hover:bg-white/6 hover:text-white/70"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => setTeleprompterOpen(true)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <MonitorPlay className="h-4 w-4" />
                      Teleprompter
                    </button>
                  </div>
                </div>

                {rightTab === "script" && (
                  <div className="scrollbar-none flex-1 overflow-y-auto px-8 py-7">
                    {isEditing ? (
                      <textarea
                        value={editedScript}
                        onChange={e => setEditedScript(e.target.value)}
                        className="scrollbar-none h-full w-full resize-none rounded-lg border border-white/10 bg-white/4 px-6 py-5 font-mono text-[14px] leading-[1.9] text-white/85 transition-all focus:border-primary/40 focus:outline-none"
                        spellCheck
                        autoFocus
                      />
                    ) : (
                      <div className="w-full whitespace-pre-wrap text-[14px] leading-[1.9] text-white/78">
                        {editedScript.split("\n").map((line, i) => {
                          const isPacingCue = /\[([A-Z ]+)\]/.test(line);
                          return (
                            <p
                              key={i}
                              className={`${line.trim() === "" ? "mb-5" : "mb-1"} ${isPacingCue ? "font-mono text-[12px] italic tracking-wide text-violet-300/50" : ""}`}
                            >
                              {line || "\u00A0"}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === "plan" && (
                  <div className="scrollbar-none flex-1 overflow-y-auto">
                    {isFreeResult && (
                      <PanelCard className="mx-6 mt-5 p-5">
                        <div className="flex items-start gap-3.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/15">
                            <Lock className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">Full Video Plan is a paid feature</p>
                            <p className="mt-1 text-xs leading-relaxed text-white/40">Upgrade to unlock all camera angles, B-roll suggestions, and delivery tips for every section.</p>
                          </div>
                          <button
                            onClick={() => setShowUpgrade(true)}
                            className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          >
                            Upgrade
                          </button>
                        </div>
                      </PanelCard>
                    )}

                    <div className="space-y-3 px-6 py-5">
                      {result.sections.length === 0 && (
                        <p className="py-10 text-center text-sm text-white/25">No sections generated yet.</p>
                      )}
                      {result.sections.map((section, i) => {
                        const isOpen = sectionsExpanded[i] !== false;
                        return (
                          <PanelCard key={i} className="overflow-hidden">
                            <button
                              onClick={() => setSectionsExpanded(prev => ({ ...prev, [i]: !isOpen }))}
                              className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-white/3"
                            >
                              <span className="shrink-0 whitespace-nowrap rounded-full border border-violet-500/20 bg-violet-600/15 px-2.5 py-1 text-[10px] font-bold text-violet-300">
                                {section.start} – {section.end}
                              </span>
                              <span className="flex-1 truncate text-sm font-medium text-white/60">
                                {section.label ? `${section.label}: ` : ""}{section.text.slice(0, 70)}{section.text.length > 70 ? "…" : ""}
                              </span>
                              {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-white/20" /> : <ChevronDown className="h-4 w-4 shrink-0 text-white/20" />}
                            </button>

                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden"
                                >
                                  <div className="grid gap-3 border-t border-white/5 px-5 pb-5 pt-4 sm:grid-cols-3">
                                    {[
                                      { icon: Camera, label: "Camera Angle", value: section.camera_angle, cls: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
                                      { icon: Film, label: "B-Roll", value: section.broll, cls: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15" },
                                      { icon: Lightbulb, label: "Delivery Tip", value: section.presentation_tip, cls: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                                    ].map(card => (
                                      <PanelCardSoft key={card.label} className={`p-3.5 ${card.bg}`}>
                                        <div className="mb-2 flex items-center gap-2">
                                          <card.icon className={`h-3.5 w-3.5 ${card.cls}`} />
                                          <p className={`text-[10px] font-bold uppercase tracking-wider opacity-70 ${card.cls}`}>{card.label}</p>
                                        </div>
                                        <p className="text-[12px] leading-relaxed text-white/60">{card.value || "-"}</p>
                                      </PanelCardSoft>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </PanelCard>
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

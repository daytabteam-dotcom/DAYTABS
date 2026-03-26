import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, Send, Loader2, MonitorPlay, Copy, Check,
  Camera, Film, Lightbulb, Lock, ChevronDown, ChevronUp,
  Pencil, Bot, User, Sparkles, PenLine, Trash2, MessageSquarePlus, Plus,
} from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { useUser } from "@/hooks/use-user";

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

const FREE_MESSAGE_LIMIT = 3;

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScriptPlannerTab() {
  const { user } = useUser();
  const plan = user?.plan ?? "free";
  const isFreeUser = plan === "free";
  const isPremiumUser = plan === "premium";

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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Derived limits
  const userMessageCount = displayMessages.filter(m => m.role === "user").length;
  const isAtMessageLimit = isFreeUser && userMessageCount >= FREE_MESSAGE_LIMIT;
  const newChatLocked = isFreeUser && savedChats.length >= 1;

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
    if (newChatLocked) { setShowUpgrade(true); return; }
    setDisplayMessages([]);
    setApiHistory([]);
    setResult(null);
    setEditedScript("");
    setIsEditing(false);
    setActiveChatId(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [newChatLocked]);

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || isAtMessageLimit) return;

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

      if (res.status === 403 && data.limitReached) {
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
  }, [loading, isAtMessageLimit, displayMessages, apiHistory, activeChatId, persistChat]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedScript || result?.script || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFreeResult = result ? !result.full_plan : false;

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

      {/* Full-bleed 3-column layout */}
      <div
        className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-12 md:-mt-16 flex"
        style={{ height: "calc(100vh - 152px)" }}
      >

        {/* ══ Panel 1: Chat History ══════════════════════════════════════════ */}
        <div className="flex flex-col w-[220px] shrink-0 border-r border-white/8 bg-[#0c0816]">

          {/* Header */}
          <div className="shrink-0 px-4 pt-5 pb-4 border-b border-white/6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Chats</p>
              <button
                onClick={handleNewChat}
                title={newChatLocked ? "Upgrade for more chats" : "New chat"}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  newChatLocked
                    ? "bg-white/4 text-white/20 cursor-not-allowed"
                    : "bg-violet-600/20 hover:bg-violet-600/35 text-violet-400 border border-violet-500/20"
                }`}
              >
                {newChatLocked ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>

            {isFreeUser && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
                <p className="text-[11px] text-white/35">
                  {savedChats.length}/1 chat · Free plan
                </p>
              </div>
            )}
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-none px-2">
            {savedChats.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 px-3 text-center">
                <MessageSquarePlus className="w-6 h-6 text-white/10" />
                <p className="text-xs text-white/20 leading-relaxed">Start a conversation to see your chats here</p>
              </div>
            )}
            {savedChats.map(chat => {
              const isActive = chat.id === activeChatId;
              const isDeleting = deletingId === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => !isActive && loadChat(chat.id)}
                  className={`group relative rounded-xl px-3 py-3 cursor-pointer transition-all ${
                    isActive
                      ? "bg-violet-600/15 border border-violet-500/25"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <p className={`text-[12px] font-medium leading-snug line-clamp-2 pr-6 ${
                    isActive ? "text-white" : "text-white/50 group-hover:text-white/75"
                  }`}>
                    {chat.title}
                  </p>
                  <p className="text-[10px] text-white/25 mt-1">{relativeTime(chat.updatedAt)}</p>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    disabled={isDeleting}
                    className="absolute top-2.5 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/15 text-white/25 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ Panel 2: Chat ══════════════════════════════════════════════════ */}
        <div className="flex flex-col w-[360px] shrink-0 border-r border-white/8 bg-[#0e0a1a]">

          {/* Header */}
          <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-white/6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-600/20 border border-violet-500/25 flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">
                {activeChatId
                  ? (savedChats.find(c => c.id === activeChatId)?.title ?? "AI Content Strategist")
                  : "AI Content Strategist"}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">GPT-4o · auto-saved</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scrollbar-none">
            {chatsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
              </div>
            )}

            {/* Empty state with starters */}
            {!chatsLoading && displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-6 px-2">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-600/15 border border-violet-500/20 flex items-center justify-center mx-auto shadow-lg shadow-violet-500/10">
                    <Clapperboard className="w-7 h-7 text-violet-300" />
                  </div>
                  <p className="text-sm font-semibold text-white">What's your video idea?</p>
                  <p className="text-xs text-white/35 leading-relaxed max-w-[220px] mx-auto">
                    Describe it and I'll write a full script with camera plan and B-roll cues.
                  </p>
                </div>

                <div className="w-full space-y-2">
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      disabled={isAtMessageLimit}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/[0.025] hover:bg-white/[0.06] hover:border-violet-500/25 text-[12px] text-white/45 hover:text-white/75 transition-all cursor-pointer leading-snug disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3 h-3 text-violet-400/50 inline mr-1.5 mb-0.5 shrink-0" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {!chatsLoading && displayMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
                  msg.role === "user"
                    ? "bg-violet-600/25 border border-violet-500/30"
                    : "bg-white/6 border border-white/10"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-3.5 h-3.5 text-violet-300" />
                    : <Bot className="w-3.5 h-3.5 text-white/40" />
                  }
                </div>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-violet-600/20 border border-violet-500/20 text-white/90 rounded-tr-sm"
                    : msg.content === "error"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400 rounded-tl-sm"
                      : "bg-white/[0.04] border border-white/8 text-white/70 rounded-tl-sm"
                }`}>
                  {!msg.summary && msg.role === "assistant" && msg.content !== "error"
                    ? <TypingDots />
                    : msg.role === "user"
                      ? msg.content
                      : (
                        <div className="flex items-start gap-2">
                          {msg.content !== "error" && (
                            <div className="w-4 h-4 rounded-full bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center shrink-0 mt-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
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

          {/* Input area */}
          <div className="shrink-0 px-4 pb-4 pt-3 border-t border-white/6">

            {/* Limit banner */}
            {isAtMessageLimit && (
              <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-xs text-amber-300 leading-snug">
                  3/3 messages used on free plan.
                </p>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="shrink-0 text-xs text-amber-400 font-semibold hover:text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  Upgrade →
                </button>
              </div>
            )}

            {/* Quick refinement chips */}
            {result && !isAtMessageLimit && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {["Shorter hook", "More energy", "More casual", "Extend to 10 mins"].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/30 hover:bg-violet-500/8 text-[11px] text-white/40 hover:text-white/70 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Textarea + send */}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isAtMessageLimit
                    ? "Upgrade to continue…"
                    : result
                      ? "Ask for changes…"
                      : "Describe your video idea…"
                }
                disabled={loading || isAtMessageLimit}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white/85 placeholder:text-white/25 resize-none focus:outline-none focus:border-violet-500/40 focus:bg-white/7 transition-all leading-relaxed disabled:opacity-40 scrollbar-none"
                rows={2}
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || input.trim().length < 2 || isAtMessageLimit}
                className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-violet-500/20 cursor-pointer"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                  : <Send className="w-4 h-4 text-white" />
                }
              </button>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-white/15">Enter to send · Shift+Enter for newline</p>
              {isFreeUser && (
                <span className={`text-[11px] font-semibold tabular-nums ${
                  userMessageCount >= FREE_MESSAGE_LIMIT
                    ? "text-red-400"
                    : userMessageCount >= FREE_MESSAGE_LIMIT - 1
                      ? "text-amber-400"
                      : "text-white/25"
                }`}>
                  {userMessageCount}/{FREE_MESSAGE_LIMIT} messages
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ══ Panel 3: Script / Video Plan ══════════════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 bg-[#090615]">
          {!result ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-6 px-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center shadow-xl">
                <PenLine className="w-8 h-8 text-white/15" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-white/30">Your script will appear here</p>
                <p className="text-sm text-white/18 max-w-xs leading-relaxed mx-auto">
                  Start by describing your video idea in the chat. Refine it with follow-up messages.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6 w-full">
                {[
                  { icon: Camera, label: "Camera Plan", sub: "Shot angles for every scene", cls: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
                  { icon: Film, label: "B-Roll Ideas", sub: "Visual suggestions per section", cls: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15" },
                  { icon: Lightbulb, label: "Delivery Tips", sub: "How to deliver each line", cls: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                ].map(item => (
                  <div key={item.label} className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${item.bg}`}>
                    <item.icon className={`w-5 h-5 ${item.cls}`} />
                    <div>
                      <p className={`text-sm font-semibold ${item.cls}`}>{item.label}</p>
                      <p className="text-[11px] text-white/30 mt-0.5 leading-snug">{item.sub}</p>
                    </div>
                  </div>
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
                className="flex flex-col h-full"
              >
                {/* Toolbar */}
                <div className="shrink-0 px-6 py-4 border-b border-white/6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {result.title && (
                      <p className="text-sm font-medium text-violet-300/80 truncate max-w-[240px]">{result.title}</p>
                    )}
                    {/* Tab switcher */}
                    <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/8 shrink-0">
                      {(["script", "plan"] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setRightTab(tab)}
                          className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                            rightTab === tab
                              ? "bg-violet-600/25 text-violet-200 border border-violet-500/30 shadow-sm"
                              : "text-white/40 hover:text-white/65"
                          }`}
                        >
                          {tab === "script" ? "Script" : "Video Plan"}
                          {tab === "plan" && isFreeResult && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] border border-amber-500/20">
                              Preview
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] text-white/40 hover:text-white/70 hover:bg-white/6 border border-transparent hover:border-white/8 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] text-white/40 hover:text-white/70 hover:bg-white/6 border border-transparent hover:border-white/8 transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => setTeleprompterOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-[12px] font-semibold transition-all shadow-lg shadow-violet-500/20 cursor-pointer"
                    >
                      <MonitorPlay className="w-4 h-4" />
                      Teleprompter
                    </button>
                  </div>
                </div>

                {/* Script view */}
                {rightTab === "script" && (
                  <div className="flex-1 overflow-y-auto px-8 py-7 scrollbar-none">
                    {isEditing ? (
                      <textarea
                        value={editedScript}
                        onChange={e => setEditedScript(e.target.value)}
                        className="w-full h-full bg-white/4 border border-white/10 rounded-2xl px-6 py-5 text-[14px] text-white/85 resize-none focus:outline-none focus:border-violet-500/40 transition-all leading-[1.9] font-mono scrollbar-none"
                        spellCheck
                        autoFocus
                      />
                    ) : (
                      <div className="w-full text-[14px] text-white/78 leading-[1.9] whitespace-pre-wrap">
                        {editedScript.split("\n").map((line, i) => {
                          const isPacingCue = /\[([A-Z ]+)\]/.test(line);
                          return (
                            <p
                              key={i}
                              className={`${line.trim() === "" ? "mb-5" : "mb-1"} ${
                                isPacingCue
                                  ? "font-mono text-[12px] italic text-violet-300/50 tracking-wide"
                                  : ""
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

                {/* Video Plan view */}
                {rightTab === "plan" && (
                  <div className="flex-1 overflow-y-auto scrollbar-none">
                    {isFreeResult && (
                      <div className="mx-6 mt-5 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-600/8 to-purple-600/5 p-5">
                        <div className="flex items-start gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <Lock className="w-4 h-4 text-violet-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white">Full Video Plan is a paid feature</p>
                            <p className="text-xs text-white/40 mt-1 leading-relaxed">Upgrade to unlock all camera angles, B-roll suggestions, and delivery tips for every section.</p>
                          </div>
                          <button
                            onClick={() => setShowUpgrade(true)}
                            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold shadow-md shadow-violet-500/20 cursor-pointer whitespace-nowrap"
                          >
                            Upgrade
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="px-6 py-5 space-y-3">
                      {result.sections.length === 0 && (
                        <p className="text-sm text-white/25 text-center py-10">No sections generated yet.</p>
                      )}
                      {result.sections.map((section, i) => {
                        const isOpen = sectionsExpanded[i] !== false;
                        return (
                          <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
                            <button
                              onClick={() => setSectionsExpanded(prev => ({ ...prev, [i]: !isOpen }))}
                              className="w-full flex items-center gap-3.5 px-5 py-3.5 hover:bg-white/3 transition-colors cursor-pointer text-left"
                            >
                              <span className="shrink-0 px-2.5 py-1 rounded-full bg-violet-600/15 text-violet-300 text-[10px] font-bold border border-violet-500/20 whitespace-nowrap">
                                {section.start} – {section.end}
                              </span>
                              <span className="text-sm font-medium text-white/60 flex-1 truncate">
                                {section.label ? `${section.label}: ` : ""}{section.text.slice(0, 70)}{section.text.length > 70 ? "…" : ""}
                              </span>
                              {isOpen
                                ? <ChevronUp className="w-4 h-4 text-white/20 shrink-0" />
                                : <ChevronDown className="w-4 h-4 text-white/20 shrink-0" />
                              }
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
                                  <div className="px-5 pb-5 grid sm:grid-cols-3 gap-3 border-t border-white/5 pt-4">
                                    {[
                                      { icon: Camera, label: "Camera Angle", value: section.camera_angle, cls: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
                                      { icon: Film, label: "B-Roll", value: section.broll, cls: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15" },
                                      { icon: Lightbulb, label: "Delivery Tip", value: section.presentation_tip, cls: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                                    ].map(card => (
                                      <div key={card.label} className={`rounded-xl border p-3.5 ${card.bg}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                          <card.icon className={`w-3.5 h-3.5 ${card.cls}`} />
                                          <p className={`text-[10px] font-bold uppercase tracking-wider opacity-70 ${card.cls}`}>{card.label}</p>
                                        </div>
                                        <p className="text-[12px] text-white/60 leading-relaxed">{card.value || "—"}</p>
                                      </div>
                                    ))}
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

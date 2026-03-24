import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, Send, Loader2, MonitorPlay, Copy, Check,
  Camera, Film, Lightbulb, Lock, ChevronDown, ChevronUp,
  Pencil, Bot, User, Sparkles, PenLine, Trash2, MessageSquarePlus,
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
  const canCreateNewChat = !isFreeUser || savedChats.length === 0;
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

  useEffect(() => {
    loadChatList();
  }, [loadChatList]);

  // ── Auto-scroll chat ────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  // ── Save / update chat in DB ────────────────────────────────────────────

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
          body: JSON.stringify({
            title: title.slice(0, 80),
            displayMessages: msgs,
            apiHistory: hist,
            result: scriptResult,
          }),
        });
        const data = await res.json();
        if (res.status === 403 && data.limitReached) {
          // Chat limit reached silently (frontend already blocked the button)
          return currentChatId;
        }
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

  // ── Load a specific chat ────────────────────────────────────────────────

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

  // ── Delete a chat ───────────────────────────────────────────────────────

  const deleteChat = useCallback(async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(chatId);
    try {
      await fetch(`/api/script-planner/chats/${chatId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (activeChatId === chatId) handleNewChat();
      setSavedChats(prev => prev.filter(c => c.id !== chatId));
    } catch { /* silent */ }
    finally { setDeletingId(null); }
  }, [activeChatId]);

  // ── New chat ────────────────────────────────────────────────────────────

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

  // ── Send message ────────────────────────────────────────────────────────

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

      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-12 md:-mt-16 flex" style={{ height: "calc(100vh - 152px)" }}>

        {/* ── Panel 1: Chat List ── */}
        <div className="flex flex-col w-[190px] shrink-0 border-r border-white/8 bg-background/60">
          <div className="shrink-0 px-3 py-4 border-b border-white/8">
            <button
              onClick={handleNewChat}
              title={newChatLocked ? "Free plan: 1 chat only. Upgrade for more." : "New chat"}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                newChatLocked
                  ? "bg-white/3 border-white/8 text-white/25"
                  : "bg-primary/15 hover:bg-primary/25 border-primary/25 text-primary"
              }`}
            >
              {newChatLocked
                ? <Lock className="w-3.5 h-3.5" />
                : <MessageSquarePlus className="w-3.5 h-3.5" />
              }
              {newChatLocked ? "Upgrade for more" : "New chat"}
            </button>

            {/* Plan badge */}
            <p className="text-[9px] text-white/20 text-center mt-2">
              {isFreeUser
                ? `${savedChats.length}/1 chat`
                : isPremiumUser
                  ? `${savedChats.length}/20 this month`
                  : "Unlimited chats"
              }
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-2 scrollbar-none">
            {savedChats.length === 0 && (
              <p className="px-3 py-6 text-center text-[10px] text-white/20 leading-relaxed">
                Your saved chats will appear here
              </p>
            )}
            {savedChats.map(chat => {
              const isActive = chat.id === activeChatId;
              const isDeleting = deletingId === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => !isActive && loadChat(chat.id)}
                  className={`group relative mx-2 mb-0.5 rounded-lg px-2.5 py-2.5 cursor-pointer transition-all ${
                    isActive
                      ? "bg-primary/15 border border-primary/25"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <p className={`text-xs font-medium leading-tight line-clamp-2 pr-5 ${
                    isActive ? "text-white" : "text-white/55 group-hover:text-white/80"
                  }`}>
                    {chat.title}
                  </p>
                  <p className="text-[9px] text-white/25 mt-1">{relativeTime(chat.updatedAt)}</p>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    disabled={isDeleting}
                    className="absolute top-2 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Panel 2: Chat ── */}
        <div className="flex flex-col w-[310px] shrink-0 border-r border-white/8 bg-background/40">
          {/* Header */}
          <div className="shrink-0 flex items-center gap-2.5 px-4 py-4 border-b border-white/8">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {activeChatId
                  ? (savedChats.find(c => c.id === activeChatId)?.title ?? "AI Content Strategist")
                  : "AI Content Strategist"
                }
              </p>
              <p className="text-[9px] text-white/25">GPT-4o · auto-saved</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-none">
            {chatsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
              </div>
            )}

            {!chatsLoading && displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-5 px-1 pb-4">
                <div className="text-center space-y-1.5">
                  <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto">
                    <Clapperboard className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-white">What's your video idea?</p>
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    Describe it and I'll write a full script with a camera plan. Refine through conversation.
                  </p>
                </div>
                <div className="w-full space-y-1.5">
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      disabled={isAtMessageLimit}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-white/[0.06] hover:border-primary/25 text-[10px] text-white/40 hover:text-white/70 transition-all cursor-pointer leading-snug disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-primary/50 inline mr-1 mb-0.5" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!chatsLoading && displayMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/30"
                    : "bg-white/8 border border-white/10"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-3 h-3 text-primary" />
                    : <Bot className="w-3 h-3 text-white/40" />
                  }
                </div>
                <div className={`max-w-[82%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/20 text-white/90 rounded-tr-sm"
                    : msg.content === "error"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400 rounded-tl-sm"
                      : "bg-white/[0.04] border border-white/8 text-white/65 rounded-tl-sm"
                }`}>
                  {!msg.summary && msg.role === "assistant" && msg.content !== "error"
                    ? <TypingDots />
                    : msg.role === "user"
                      ? msg.content
                      : (
                        <div className="flex items-start gap-1.5">
                          {msg.content !== "error" && (
                            <div className="w-3 h-3 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center shrink-0 mt-0.5">
                              <div className="w-1 h-1 rounded-full bg-green-400" />
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
          <div className="shrink-0 px-3 py-3 border-t border-white/8">
            {/* Limit reached banner */}
            {isAtMessageLimit && (
              <div className="mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-[10px] text-amber-300 leading-snug">
                  3/3 messages used on free plan.
                </p>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="shrink-0 text-[10px] text-amber-400 font-semibold hover:text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  Upgrade →
                </button>
              </div>
            )}

            {/* Quick chips */}
            {result && !isAtMessageLimit && (
              <div className="mb-2 flex flex-wrap gap-1">
                {["Shorter hook", "More energy", "More casual", "Extend to 10 mins"].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="px-2 py-1 rounded-md bg-white/5 border border-white/8 hover:border-primary/30 hover:bg-primary/8 text-[9px] text-white/35 hover:text-white/65 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-1.5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isAtMessageLimit
                    ? "Upgrade to send more messages…"
                    : result
                      ? "Ask for changes…"
                      : "Describe your video idea…"
                }
                disabled={loading || isAtMessageLimit}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/40 transition-all leading-relaxed disabled:opacity-40 scrollbar-none"
                rows={2}
                style={{ maxHeight: "100px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || input.trim().length < 2 || isAtMessageLimit}
                className="shrink-0 w-8 h-8 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shadow-primary/20 cursor-pointer"
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-white" />
                }
              </button>
            </div>

            {/* Counter / hint row */}
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[9px] text-white/15">Enter to send · Shift+Enter for new line</p>
              {isFreeUser && (
                <span className={`text-[9px] font-semibold tabular-nums ${
                  userMessageCount >= FREE_MESSAGE_LIMIT
                    ? "text-red-400"
                    : userMessageCount >= FREE_MESSAGE_LIMIT - 1
                      ? "text-amber-400"
                      : "text-white/25"
                }`}>
                  {userMessageCount}/{FREE_MESSAGE_LIMIT}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Panel 3: Results ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-background/20">
          {!result ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                <PenLine className="w-7 h-7 text-white/15" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/30">Your script will appear here</p>
                <p className="text-xs text-white/15 max-w-xs leading-relaxed mt-1">
                  Start by describing your video idea in the chat. Refine it with follow-up messages.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2 w-full max-w-md">
                {[
                  { icon: Camera, label: "Camera Plan", cls: "text-blue-400 bg-blue-500/5 border-blue-500/10" },
                  { icon: Film, label: "B-Roll Ideas", cls: "text-purple-400 bg-purple-500/5 border-purple-500/10" },
                  { icon: Lightbulb, label: "Delivery Tips", cls: "text-yellow-400 bg-yellow-500/5 border-yellow-500/10" },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border p-4 flex flex-col items-center gap-2 ${item.cls}`}>
                    <item.icon className={`w-5 h-5 ${item.cls.split(" ")[0]}`} />
                    <p className="text-xs text-white/30 font-medium">{item.label}</p>
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
                transition={{ duration: 0.25 }}
                className="flex flex-col h-full"
              >
                {/* Header */}
                <div className="shrink-0 px-5 py-3.5 border-b border-white/8 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {result.title && (
                      <p className="text-[10px] text-primary/70 font-medium truncate mb-1">{result.title}</p>
                    )}
                    <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/8 w-fit">
                      {(["script", "plan"] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setRightTab(tab)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            rightTab === tab
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "text-white/35 hover:text-white/65"
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white/35 hover:text-white/65 hover:bg-white/6 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white/35 hover:text-white/65 hover:bg-white/6 transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => setTeleprompterOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white text-[11px] font-semibold transition-all shadow-sm shadow-primary/15 cursor-pointer"
                    >
                      <MonitorPlay className="w-3.5 h-3.5" />
                      Teleprompter
                    </button>
                  </div>
                </div>

                {/* Script */}
                {rightTab === "script" && (
                  <div className="flex-1 overflow-y-auto px-5 py-5">
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

                {/* Video Plan */}
                {rightTab === "plan" && (
                  <div className="flex-1 overflow-y-auto">
                    {isFreeResult && (
                      <div className="mx-5 mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                        <div className="flex items-start gap-3">
                          <Lock className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-white">Full Video Plan is a Premium feature</p>
                            <p className="text-[11px] text-white/35 mt-0.5">Upgrade to unlock all camera angles, B-roll, and delivery tips.</p>
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
                    <div className="px-5 py-4 space-y-2.5">
                      {result.sections.length === 0 && (
                        <p className="text-sm text-white/25 text-center py-8">No sections generated yet.</p>
                      )}
                      {result.sections.map((section, i) => {
                        const isOpen = sectionsExpanded[i] !== false;
                        return (
                          <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
                            <button
                              onClick={() => setSectionsExpanded(prev => ({ ...prev, [i]: !isOpen }))}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer text-left"
                            >
                              <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold border border-primary/20">
                                {section.start}, {section.end}
                              </span>
                              <span className="text-xs font-medium text-white/60 flex-1 truncate">
                                {section.label ? `${section.label}: ` : ""}{section.text.slice(0, 65)}{section.text.length > 65 ? "…" : ""}
                              </span>
                              {isOpen
                                ? <ChevronUp className="w-3 h-3 text-white/20 shrink-0" />
                                : <ChevronDown className="w-3 h-3 text-white/20 shrink-0" />
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
                                  <div className="px-4 pb-4 grid sm:grid-cols-3 gap-2 border-t border-white/5 pt-3">
                                    {[
                                      { icon: Camera, label: "Camera Angle", value: section.camera_angle, cls: "text-blue-400 bg-blue-500/5 border-blue-500/10" },
                                      { icon: Film, label: "B-Roll", value: section.broll, cls: "text-purple-400 bg-purple-500/5 border-purple-500/10" },
                                      { icon: Lightbulb, label: "Delivery Tip", value: section.presentation_tip, cls: "text-yellow-400 bg-yellow-500/5 border-yellow-500/10" },
                                    ].map(card => (
                                      <div key={card.label} className={`rounded-lg border p-2.5 ${card.cls}`}>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                          <card.icon className={`w-3 h-3 ${card.cls.split(" ")[0]}`} />
                                          <p className={`text-[9px] font-semibold uppercase tracking-wider opacity-60 ${card.cls.split(" ")[0]}`}>{card.label}</p>
                                        </div>
                                        <p className="text-[10px] text-white/55 leading-relaxed">{card.value || ""}</p>
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

import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, CalendarDays, Check, CheckCircle2, Copy, Filter, Instagram, Linkedin, ListChecks, Music2, Plus, RefreshCcw, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PanelCard, PanelCardSoft, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { GrowthTask, SocialPlanDay, SocialPlatform, SocialPostStatus, SocialWeeklyPlan } from "./types";
import { ApiError } from "./socialApi";

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: string; type?: string } | null;
    return payload?.error || err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

function platformLabel(platform: SocialPlatform) {
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "tiktok") return "TikTok";
  return "Instagram";
}

function formatRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} to ${endDate}`;
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} to ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

type ViewMode = "calendar" | "planner" | "tasks";

function platformIcon(platform: SocialPlatform) {
  if (platform === "linkedin") return Linkedin;
  if (platform === "instagram") return Instagram;
  return Music2;
}

function dayHeader(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: isoDate, date: "" };
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

function toLocalIsoDate(input: Date) {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function statusTone(status: SocialPostStatus) {
  if (status === "posted") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "skipped") return "border-red-300/25 bg-red-400/10 text-red-100";
  return "border-white/10 bg-white/4 text-white/55";
}

function contentTypeTone(contentType?: string) {
  const key = (contentType ?? "").toLowerCase();
  if (key.includes("carousel")) return "border-violet-300/25 bg-violet-500/10 text-violet-100";
  if (key.includes("story")) return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (key.includes("reel") || key.includes("video")) return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  return "border-white/10 bg-white/4 text-white/60";
}

function copyTextForDay(platform: SocialPlatform, day: SocialPlanDay) {
  if (platform === "linkedin") return day.postDraft || day.caption || day.descriptionSuggestion || day.hook || day.contentIdea || "";
  if (platform === "tiktok") return day.script || day.caption || day.descriptionSuggestion || day.hook || day.contentIdea || "";
  const caption = day.caption || day.descriptionSuggestion || "";
  const script = day.script || "";
  if (caption && script) return `${caption}\n\n---\n\n${script}`;
  return caption || script || day.hook || day.contentIdea || "";
}

function platformAccent(platform: SocialPlatform) {
  if (platform === "linkedin") {
    return {
      iconBg: "bg-sky-500/15 border-sky-400/30",
      gradient: "bg-linear-to-r from-sky-500 to-blue-600",
      soft: "bg-sky-500/10 border-sky-400/30",
      tabActive: "border-sky-300/35 bg-sky-500/15 text-white",
    };
  }
  if (platform === "tiktok") {
    return {
      iconBg: "bg-violet-500/12 border-violet-400/30",
      gradient: "bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500",
      soft: "bg-violet-500/10 border-violet-400/30",
      tabActive: "border-violet-300/35 bg-violet-500/15 text-white",
    };
  }
  return {
    iconBg: "bg-pink-500/12 border-pink-400/30",
    gradient: "bg-linear-to-r from-amber-400 via-pink-500 to-violet-600",
    soft: "bg-pink-500/10 border-pink-400/30",
    tabActive: "border-pink-300/35 bg-pink-500/15 text-white",
  };
}

function getAllGrowthTasks(platform: SocialPlatform, days: SocialPlanDay[]) {
  const items: Array<GrowthTask & { key: string; planDayId: string; date: string; ideaTitle: string }> = [];
  for (const day of days) {
    const tasks = day.growthTasks ?? [];
    tasks.forEach((task, index) => {
      const key = task.id ? String(task.id) : `${day.id}:${index}`;
      items.push({ ...task, key, planDayId: day.id, date: day.date, ideaTitle: day.contentIdea });
    });
  }
  return items.filter((task) => task.platform === platform);
}

export function SocialPlanBoard({
  plan,
  working,
  onGenerateNextWeek,
  onPatchDay,
  onDeleteDay,
  onRegenerateDay,
  onCreateDay,
}: {
  plan: SocialWeeklyPlan;
  working: boolean;
  onGenerateNextWeek: () => void;
  onPatchDay: (day: SocialPlanDay, patch: Partial<SocialPlanDay>) => Promise<void> | void;
  onDeleteDay: (day: SocialPlanDay) => Promise<void> | void;
  onRegenerateDay: (day: SocialPlanDay, intent?: string) => Promise<void> | void;
  onCreateDay: (input: { date: string; contentIdea: string; contentType?: string; hook?: string; notes?: string; tags?: string[]; bestPostingTime?: string }) => Promise<string | null> | string | null;
}) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<"create" | "visuals" | "strategy">("create");
  const [manualOpen, setManualOpen] = useState(false);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(() => ({
    date: new Date().toISOString().slice(0, 10),
    contentIdea: "",
    contentType: "",
    hook: "",
    notes: "",
    tags: "",
    bestPostingTime: "",
  }));
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "completed" | "today">("all");
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});
  const [draggingDayId, setDraggingDayId] = useState<string | null>(null);
  const [draggingOverDate, setDraggingOverDate] = useState<string | null>(null);
  const label = platformLabel(plan.platform);
  const days = useMemo(() => (plan.plan.days ?? [])
    .filter((day) => !day.isDeleted)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day), [plan.plan.days]);
  const Icon = platformIcon(plan.platform);

  const byDate = useMemo(() => {
    const map = new Map<string, SocialPlanDay[]>();
    for (const day of days) {
      const effectiveDate = dateOverrides[day.id] ?? day.date;
      map.set(effectiveDate, [...(map.get(effectiveDate) ?? []), day]);
    }
    return map;
  }, [days, dateOverrides]);

  const dates = useMemo(() => {
    const start = new Date(`${plan.startDate}T00:00:00`);
    const values: string[] = [];
    for (let idx = 0; idx < 7; idx += 1) {
      const date = new Date(start);
      date.setDate(date.getDate() + idx);
      values.push(toLocalIsoDate(date));
    }
    return values;
  }, [plan.startDate]);

  function openDay(dayId: string) {
    setActivePanelTab("create");
    setActiveDayId(dayId);
  }

  const today = toLocalIsoDate(new Date());
  const tomorrow = addDaysIso(today, 1);
  const todayDays = useMemo(() => days.filter((day) => (dateOverrides[day.id] ?? day.date) === today), [days, dateOverrides, today]);
  const tomorrowDays = useMemo(() => days.filter((day) => (dateOverrides[day.id] ?? day.date) === tomorrow), [days, dateOverrides, tomorrow]);
  const accent = platformAccent(plan.platform);

  const allTasks = useMemo(() => getAllGrowthTasks(plan.platform, days), [days, plan.platform]);
  const filteredTasks = useMemo(() => {
    if (taskFilter === "today") return allTasks.filter((task) => task.date === today);
    if (taskFilter === "completed") return allTasks.filter((task) => Boolean(task.completed));
    if (taskFilter === "pending") return allTasks.filter((task) => !task.completed);
    return allTasks;
  }, [allTasks, taskFilter, today]);
  const taskProgress = useMemo(() => {
    const total = allTasks.length;
    const done = allTasks.filter((task) => Boolean(task.completed)).length;
    return { total, done };
  }, [allTasks]);

  return (
    <div className="space-y-6">
      <PanelCard className="p-6">
        <PanelHeader className="items-start justify-between gap-6 lg:flex-row">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border", accent.iconBg)}>
                <Icon className="h-6 w-6 text-white/85" />
              </span>
              <div className="min-w-0">
                <PanelTitle>Growth Planner</PanelTitle>
                <PanelSubtitle>
                  {label} weekly plan, {formatRange(plan.startDate, plan.endDate)}
                </PanelSubtitle>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">Platform: <span className="text-white/75">{label}</span></span>
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">Topic: <span className="text-white/75">{plan.topic}</span></span>
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">Posts planned: <span className="text-white/75">{days.length}</span></span>
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">Posting mode: <span className="text-white/75">{plan.postingMode === "ai_optimized" ? "Best Case" : "Manual"}</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[340px]">
            <Button
              type="button"
              className={cn("h-11 justify-center rounded-xl text-white shadow-lg shadow-black/10", accent.gradient)}
              onClick={onGenerateNextWeek}
              disabled={working}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Generate next week
            </Button>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-white/3 p-1">
                {([
                  { id: "calendar" as const, label: "Calendar", Icon: CalendarDays },
                  { id: "planner" as const, label: "Planner", Icon: ListChecks },
                  { id: "tasks" as const, label: "Tasks", Icon: CheckCircle2 },
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setViewMode(item.id)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      viewMode === item.id ? cn("border border-white/10 bg-[#11111a] text-white", accent.soft) : "text-white/60 hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <item.Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PanelHeader>
      </PanelCard>

      {plan.plan.summary ? (
        <PanelCardSoft className="border border-white/10 p-4 text-sm text-white/65">
          {plan.plan.summary}
        </PanelCardSoft>
      ) : null}

      {viewMode === "calendar" ? (
        <div className="space-y-4">
          {(() => {
            const todayTasks = allTasks.filter((task) => task.date === today);
            const hasTodayContent = todayDays.length > 0;
            const hasTodayTasks = todayTasks.length > 0;
            return (
              <PanelCardSoft className={cn("border p-5", accent.soft)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Today’s focus</p>
                    <p className="mt-2 text-sm text-white/75">
                      {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setTomorrowOpen(true)}>
                    View tomorrow’s plan
                  </Button>
                </div>

                {!hasTodayContent && !hasTodayTasks ? (
                  <div className="mt-4">
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-4 text-sm text-white/60">
                      No content or tasks planned for today.
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        className={cn("w-full justify-center rounded-xl text-white", accent.gradient)}
                        onClick={() => {
                          setManualDraft((current) => ({ ...current, date: today }));
                          setManualOpen(true);
                        }}
                        disabled={working}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate idea for today
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full justify-center rounded-xl"
                        onClick={() => {
                          setManualDraft((current) => ({ ...current, date: today }));
                          setManualOpen(true);
                        }}
                        disabled={working}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add manual idea for today
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-6">
                    {hasTodayContent ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Today’s content</p>
                        <div className="mt-3 space-y-3">
                          {todayDays.map((day) => {
                            const status = (day.status ?? "not_finished") as SocialPostStatus;
                            return (
                              <div key={`today-${day.id}`} className="rounded-2xl border border-white/10 bg-[#11111a]/40 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", accent.iconBg)}>
                                      <Icon className="h-5 w-5 text-white/85" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-white">{day.contentIdea}</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", contentTypeTone(day.contentType))}>
                                          {day.contentType ? day.contentType.replace(/_/g, " ") : "post"}
                                        </span>
                                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
                                          {status === "not_finished" ? "Planned" : status}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                                          {day.bestPostingTime || "Time TBD"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openDay(day.id)}>
                                      Open
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="rounded-xl"
                                      onClick={async () => {
                                        await navigator.clipboard.writeText(copyTextForDay(plan.platform, day));
                                        toast({ title: "Copied", description: "Post copied to clipboard." });
                                      }}
                                    >
                                      <Copy className="mr-2 h-4 w-4" />
                                      Copy
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="rounded-xl"
                                      onClick={async () => {
                                        try {
                                          await onPatchDay(day, { status: "posted" });
                                          toast({ title: "Marked as posted", description: "Updated this post to Posted." });
                                        } catch (err) {
                                          toast({ variant: "destructive", title: "Could not update status", description: apiErrorMessage(err, "Please try again.") });
                                        }
                                      }}
                                      disabled={working}
                                    >
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Mark as posted
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {hasTodayTasks ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Today’s tasks</p>
                        <div className="mt-3 space-y-3">
                          {todayTasks.map((task) => {
                            const day = days.find((item) => item.id === task.planDayId) ?? null;
                            const completed = Boolean(task.completed);
                            return (
                              <div key={`today-task-${task.key}`} className={cn("rounded-2xl border border-white/10 bg-white/3 p-4", completed && "opacity-70")}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!day) return;
                                        const tasks = day.growthTasks ?? [];
                                        const next = tasks.map((item, index) => {
                                          const key = item.id ? String(item.id) : `${day.id}:${index}`;
                                          return key === task.key ? { ...item, completed: !completed } : item;
                                        });
                                        try {
                                          await onPatchDay(day, { growthTasks: next });
                                        } catch (err) {
                                          toast({ variant: "destructive", title: "Could not update task", description: apiErrorMessage(err, "Please try again.") });
                                        }
                                      }}
                                      className={cn(
                                        "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                                        completed ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-black/20 text-white/60 hover:bg-white/4 hover:text-white",
                                      )}
                                      aria-label={completed ? "Mark task as pending" : "Mark task as done"}
                                    >
                                      {completed ? <Check className="h-4 w-4" /> : null}
                                    </button>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-white">{task.title}</p>
                                      <p className="mt-1 text-xs text-white/55">{task.suggestedTiming}</p>
                                      {day ? (
                                        <p className="mt-2 text-xs text-white/55">
                                          Related: <button type="button" className="text-white/80 underline-offset-4 hover:underline" onClick={() => openDay(day.id)}>{task.ideaTitle}</button>
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", completed ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/4 text-white/55")}>
                                    {completed ? "Completed" : "Pending"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </PanelCardSoft>
            );
          })()}

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
            {dates.map((date) => (
              <div
                key={date}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDraggingOverDate(date);
                }}
                onDragLeave={() => {
                  setDraggingOverDate((current) => (current === date ? null : current));
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  setDraggingOverDate(null);
                  const dayId = event.dataTransfer.getData("text/dayId");
                  const fromDate = event.dataTransfer.getData("text/fromDate");
                  if (!dayId) return;
                  const day = days.find((item) => item.id === dayId);
                  if (!day) return;
                  const previousDate = fromDate || (dateOverrides[day.id] ?? day.date);
                  if (previousDate === date) return;
                  setDateOverrides((current) => ({ ...current, [day.id]: date }));
                  try {
                    await onPatchDay(day, { date });
                    toast({ title: "Moved", description: "Updated the post date." });
                  } catch (err) {
                    setDateOverrides((current) => {
                      const next = { ...current };
                      delete next[day.id];
                      return next;
                    });
                    toast({ variant: "destructive", title: "Could not move post", description: apiErrorMessage(err, "Please try again.") });
                  }
                }}
                className={cn(
                  "min-h-65 w-[340px] shrink-0 rounded-2xl border bg-white/2.5 p-3 transition-all",
                  draggingOverDate === date ? "border-white/25 bg-white/4 shadow-lg shadow-black/10" : "border-white/10 hover:bg-white/4",
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{dayHeader(date).weekday}</p>
                    <p className="mt-1 text-xs text-white/45">{dayHeader(date).date}</p>
                    <p className="mt-1 text-xs text-white/35">
                      {(byDate.get(date) ?? []).length ? `${(byDate.get(date) ?? []).length} ideas` : "Open"}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {(byDate.get(date) ?? []).map((day) => {
                    const status = (day.status ?? "not_finished") as SocialPostStatus;
                    const effectiveDate = dateOverrides[day.id] ?? day.date;
                    return (
                      <div
                        key={day.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(event) => {
                          setDraggingDayId(day.id);
                          event.dataTransfer.setData("text/dayId", day.id);
                          event.dataTransfer.setData("text/fromDate", effectiveDate);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingDayId(null);
                          setDraggingOverDate(null);
                        }}
                        onClick={() => openDay(day.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") openDay(day.id);
                        }}
                        className={cn("w-full cursor-grab text-left active:cursor-grabbing", draggingDayId === day.id && "opacity-60")}
                      >
                        <PanelCardSoft className="cursor-pointer border border-white/10 p-3 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                <Icon className="h-4 w-4 text-white/70" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{day.contentIdea}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", contentTypeTone(day.contentType))}>
                                    {day.contentType ? day.contentType.replace(/_/g, " ") : "post"}
                                  </span>
                                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
                                    {status === "not_finished" ? "Planned" : status}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] text-white/60">
                                    {day.bestPostingTime || "Time TBD"}
                                  </span>
                                  {day.ideaOrigin === "manual" ? (
                                    <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] text-white/60">
                                      {day.aiImproved ? "AI improved" : "Manual"}
                                    </span>
                                  ) : null}
                                </div>
                                {day.tags?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {day.tags.slice(0, 2).map((tag) => (
                                      <span key={`${day.id}-${tag}`} className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] text-white/60">
                                        {tag.startsWith("#") ? tag : `#${tag}`}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <ArrowRight className="mt-1 h-4 w-4 text-white/35" />
                          </div>
                        </PanelCardSoft>
                      </div>
                    );
                  })}
                  {!byDate.get(date)?.length ? (
                    <PanelCardSoft className="border border-dashed border-white/10 bg-white/3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white/80">No idea planned</p>
                          <p className="mt-1 text-xs text-white/45">Add something quick for this day.</p>
                        </div>
                        <Sparkles className="h-5 w-5 text-white/25" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className={cn("w-full justify-center rounded-xl text-white", accent.gradient)}
                          onClick={() => {
                            setManualDraft((current) => ({ ...current, date }));
                            setManualOpen(true);
                          }}
                          disabled={working}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Generate idea
                        </Button>
                      </div>
                    </PanelCardSoft>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center rounded-xl border-dashed text-white/70 hover:text-white"
                    onClick={() => {
                      setManualDraft((current) => ({ ...current, date }));
                      setManualOpen(true);
                    }}
                    disabled={working}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add manual idea
                  </Button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      ) : viewMode === "planner" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Planner</p>
              <p className="mt-1 text-xs text-white/50">Work through your posts like a to-do list.</p>
            </div>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setManualOpen(true)} disabled={working}>
              <Plus className="mr-2 h-4 w-4" />
              Add manual idea
            </Button>
          </div>

          {(() => {
            const planned = days.filter((day) => (day.status ?? "not_finished") === "not_finished");
            const posted = days.filter((day) => (day.status ?? "not_finished") === "posted");
            const skipped = days.filter((day) => (day.status ?? "not_finished") === "skipped");
            const todayPlanned = planned.filter((day) => day.date === today);
            const upcoming = planned.filter((day) => day.date !== today);
            const sections: Array<{ id: string; title: string; items: SocialPlanDay[] }> = [
              { id: "today", title: "Today", items: todayPlanned },
              { id: "upcoming", title: "Upcoming", items: upcoming },
              { id: "posted", title: "Posted", items: posted },
              { id: "skipped", title: "Skipped", items: skipped },
            ];

            return (
              <div className="space-y-4">
                {sections.map((section) => (
                  <div key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{section.title}</p>
                      <span className="text-xs text-white/35">{section.items.length}</span>
                    </div>
                    {section.items.length ? (
                      <div className="space-y-2">
                        {section.items.map((day) => {
                          const status = (day.status ?? "not_finished") as SocialPostStatus;
                          return (
                            <div key={`planner-${day.id}`} className="rounded-2xl border border-white/10 bg-white/3 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", accent.iconBg)}>
                                    <Icon className="h-5 w-5 text-white/85" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs text-white/45">{dayHeader(day.date).weekday} · {dayHeader(day.date).date}{day.bestPostingTime ? ` · ${day.bestPostingTime}` : ""}</p>
                                    <p className="mt-1 truncate text-sm font-semibold text-white">{day.contentIdea}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", contentTypeTone(day.contentType))}>
                                        {day.contentType ? day.contentType.replace(/_/g, " ") : "post"}
                                      </span>
                                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
                                        {status === "not_finished" ? "Planned" : status}
                                      </span>
                                      {day.ideaOrigin === "manual" ? (
                                        <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                          {day.aiImproved ? "AI improved" : "Manual"}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openDay(day.id)}>
                                    Open
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="rounded-xl"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(copyTextForDay(plan.platform, day));
                                      toast({ title: "Copied", description: "Post copied to clipboard." });
                                    }}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="rounded-xl"
                                    onClick={async () => {
                                      try {
                                        await onRegenerateDay(day);
                                        toast({ title: "Regenerated", description: "Generated a new version of this idea." });
                                      } catch (err) {
                                        toast({ variant: "destructive", title: "Could not regenerate", description: apiErrorMessage(err, "Please try again.") });
                                      }
                                    }}
                                    disabled={working}
                                  >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Regenerate
                                  </Button>
                                  {day.ideaOrigin === "manual" ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="rounded-xl"
                                      onClick={async () => {
                                        const intent = `Improve this user-created idea for ${label}. Keep the original idea, but make it platform-native and execution-ready. Return valid JSON only.`;
                                        try {
                                          await onRegenerateDay(day, intent);
                                          await onPatchDay(day, { aiImproved: true });
                                          toast({ title: "Improved", description: "Updated this idea with AI." });
                                        } catch (err) {
                                          toast({ variant: "destructive", title: "Could not improve idea", description: apiErrorMessage(err, "Please try again.") });
                                        }
                                      }}
                                      disabled={working}
                                    >
                                      <Sparkles className="mr-2 h-4 w-4" />
                                      Improve with AI
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="rounded-xl"
                                    onClick={async () => {
                                      try {
                                        await onPatchDay(day, { status: "posted" });
                                        toast({ title: "Marked as posted", description: "Updated this post to Posted." });
                                      } catch (err) {
                                        toast({ variant: "destructive", title: "Could not update status", description: apiErrorMessage(err, "Please try again.") });
                                      }
                                    }}
                                    disabled={working || status === "posted"}
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Mark as posted
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <PanelCardSoft className="border border-dashed border-white/10 bg-white/3 p-4 text-sm text-white/60">
                        Nothing here yet.
                      </PanelCardSoft>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Tasks</p>
              <p className="mt-1 text-xs text-white/50">All growth tasks for this week in one place.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/60">
              Growth tasks: <span className="text-white/80">{taskProgress.done}/{taskProgress.total}</span> completed
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-white/40" />
            {([
              ["all", "All"],
              ["pending", "Pending"],
              ["completed", "Completed"],
              ["today", "Today"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTaskFilter(id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  taskFilter === id ? cn("border-white/20 bg-white/8 text-white", accent.soft) : "border-white/10 bg-white/4 text-white/60 hover:bg-white/6 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredTasks.length ? (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const day = days.find((item) => item.id === task.planDayId) ?? null;
                const completed = Boolean(task.completed);
                return (
                  <div key={task.key} className={cn("rounded-2xl border border-white/10 bg-white/3 p-4 transition-opacity", completed && "opacity-70")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!day) return;
                            const tasks = day.growthTasks ?? [];
                            const next = tasks.map((item, index) => {
                              const key = item.id ? String(item.id) : `${day.id}:${index}`;
                              return key === task.key ? { ...item, completed: !completed } : item;
                            });
                            try {
                              await onPatchDay(day, { growthTasks: next });
                            } catch (err) {
                              toast({ variant: "destructive", title: "Could not update task", description: apiErrorMessage(err, "Please try again.") });
                            }
                          }}
                          className={cn(
                            "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                            completed ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-black/20 text-white/60 hover:bg-white/4 hover:text-white",
                          )}
                          aria-label={completed ? "Mark task as pending" : "Mark task as done"}
                        >
                          {completed ? <Check className="h-4 w-4" /> : null}
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{task.title}</p>
                          <p className="mt-1 text-xs text-white/55">{task.suggestedTiming}</p>
                          {day ? (
                            <p className="mt-2 text-xs text-white/55">
                              Related post: <button type="button" className="text-white/80 underline-offset-4 hover:underline" onClick={() => openDay(day.id)}>{task.ideaTitle}</button>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", completed ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/4 text-white/55")}>
                        {completed ? "Completed" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/70">{task.description}</p>
                    <p className="mt-2 text-xs text-white/45">Why: {task.reason}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        {task.taskType.replace(/_/g, " ")}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        {dayHeader(task.date).weekday} · {dayHeader(task.date).date}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <PanelCardSoft className="border border-dashed border-white/10 bg-white/3 p-6 text-center text-sm text-white/60">
              No tasks found for this filter.
            </PanelCardSoft>
          )}
        </div>
      )}

      <Dialog open={tomorrowOpen} onOpenChange={(open) => setTomorrowOpen(open)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#11111a] shadow-2xl">
            <div className="flex max-h-[86vh] flex-col text-white">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Tomorrow’s plan</p>
                    <p className="mt-2 text-lg font-semibold text-white">{dayHeader(tomorrow).weekday}, {dayHeader(tomorrow).date}</p>
                    <p className="mt-1 text-sm text-white/55">Planned content and tasks for tomorrow.</p>
                  </div>
                  <DialogPrimitive.Close className="rounded-xl border border-white/10 bg-white/3 p-2 text-white/70 hover:bg-white/6 hover:text-white">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="max-h-[calc(86vh-150px)] overflow-y-auto p-6">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Planned posts</p>
                    <div className="mt-3 space-y-3">
                      {tomorrowDays.length ? (
                        tomorrowDays.map((day) => {
                          const status = (day.status ?? "not_finished") as SocialPostStatus;
                          const preview = plan.platform === "linkedin"
                            ? (day.postDraft || day.caption || day.hook)
                            : plan.platform === "tiktok"
                              ? (day.script || day.caption || day.hook)
                              : (day.caption || day.script || day.hook);
                          return (
                            <div key={`tomorrow-${day.id}`} className="rounded-2xl border border-white/10 bg-white/3 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", accent.iconBg)}>
                                    <Icon className="h-5 w-5 text-white/85" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{day.contentIdea}</p>
                                    {preview ? <p className="mt-1 line-clamp-2 text-xs text-white/60">{preview}</p> : null}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", contentTypeTone(day.contentType))}>
                                        {day.contentType ? day.contentType.replace(/_/g, " ") : "post"}
                                      </span>
                                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
                                        {status === "not_finished" ? "Planned" : status}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                                        {day.bestPostingTime || "Time TBD"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openDay(day.id)}>
                                  Open details
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <PanelCardSoft className="border border-dashed border-white/10 bg-white/3 p-4 text-sm text-white/60">
                          Nothing planned for tomorrow yet.
                        </PanelCardSoft>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Tomorrow’s tasks</p>
                      <span className="text-xs text-white/45">
                        {allTasks.filter((task) => task.date === tomorrow && Boolean(task.completed)).length}/{allTasks.filter((task) => task.date === tomorrow).length} completed
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {allTasks.filter((task) => task.date === tomorrow).length ? (
                        allTasks.filter((task) => task.date === tomorrow).map((task) => {
                          const day = days.find((item) => item.id === task.planDayId) ?? null;
                          const completed = Boolean(task.completed);
                          return (
                            <div key={`tomorrow-task-${task.key}`} className={cn("rounded-2xl border border-white/10 bg-white/3 p-4", completed && "opacity-70")}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!day) return;
                                      const tasks = day.growthTasks ?? [];
                                      const next = tasks.map((item, index) => {
                                        const key = item.id ? String(item.id) : `${day.id}:${index}`;
                                        return key === task.key ? { ...item, completed: !completed } : item;
                                      });
                                      try {
                                        await onPatchDay(day, { growthTasks: next });
                                      } catch (err) {
                                        toast({ variant: "destructive", title: "Could not update task", description: apiErrorMessage(err, "Please try again.") });
                                      }
                                    }}
                                    className={cn(
                                      "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                                      completed ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-black/20 text-white/60 hover:bg-white/4 hover:text-white",
                                    )}
                                    aria-label={completed ? "Mark task as pending" : "Mark task as done"}
                                  >
                                    {completed ? <Check className="h-4 w-4" /> : null}
                                  </button>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white">{task.title}</p>
                                    <p className="mt-1 text-xs text-white/55">{task.suggestedTiming}</p>
                                    {day ? (
                                      <p className="mt-2 text-xs text-white/55">
                                        Related post: <button type="button" className="text-white/80 underline-offset-4 hover:underline" onClick={() => openDay(day.id)}>{task.ideaTitle}</button>
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", completed ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/4 text-white/55")}>
                                  {completed ? "Completed" : "Pending"}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-white/70">{task.description}</p>
                              <p className="mt-2 text-xs text-white/45">Why: {task.reason}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                  {task.taskType.replace(/_/g, " ")}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <PanelCardSoft className="border border-dashed border-white/10 bg-white/3 p-4 text-sm text-white/60">
                          No tasks scheduled for tomorrow.
                        </PanelCardSoft>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setTomorrowOpen(false)}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    className={cn("rounded-xl text-white", accent.gradient)}
                    onClick={() => {
                      setTomorrowOpen(false);
                      setManualDraft((current) => ({ ...current, date: today }));
                      setManualOpen(true);
                    }}
                    disabled={working}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add idea for today
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={(open) => setManualOpen(open)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#11111a] shadow-2xl">
            <div className="flex max-h-[86vh] flex-col text-white">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Add manual idea</p>
                    <p className="mt-2 text-lg font-semibold text-white">Create a post for this week</p>
                    <p className="mt-1 text-sm text-white/55">Save as manual, or save then improve with AI.</p>
                  </div>
                  <DialogPrimitive.Close className="rounded-xl border border-white/10 bg-white/3 p-2 text-white/70 hover:bg-white/6 hover:text-white">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="max-h-[calc(86vh-150px)] overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Idea title</p>
                    <Input
                      value={manualDraft.contentIdea}
                      onChange={(event) => setManualDraft((current) => ({ ...current, contentIdea: event.target.value }))}
                      placeholder="Example: Building in public — what I learned this week"
                      className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Date</p>
                    <Input
                      type="date"
                      value={manualDraft.date}
                      onChange={(event) => setManualDraft((current) => ({ ...current, date: event.target.value }))}
                      className="mt-2 border-white/10 bg-white/4 text-white"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Content type</p>
                    <Input
                      value={manualDraft.contentType}
                      onChange={(event) => setManualDraft((current) => ({ ...current, contentType: event.target.value }))}
                      placeholder={plan.platform === "linkedin" ? "text post / carousel" : plan.platform === "tiktok" ? "video script" : "reel / carousel"}
                      className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Hook (optional)</p>
                    <Textarea
                      value={manualDraft.hook}
                      onChange={(event) => setManualDraft((current) => ({ ...current, hook: event.target.value }))}
                      placeholder="Optional opening line or hook"
                      className="mt-2 min-h-20 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Notes (optional)</p>
                    <Textarea
                      value={manualDraft.notes}
                      onChange={(event) => setManualDraft((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Rough idea, angle, story beats..."
                      className="mt-2 min-h-28 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Tags (optional)</p>
                    <Input
                      value={manualDraft.tags}
                      onChange={(event) => setManualDraft((current) => ({ ...current, tags: event.target.value }))}
                      placeholder="#buildinpublic, #startups"
                      className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Best time (optional)</p>
                    <Input
                      value={manualDraft.bestPostingTime}
                      onChange={(event) => setManualDraft((current) => ({ ...current, bestPostingTime: event.target.value }))}
                      placeholder="09:00 AM"
                      className="mt-2 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setManualOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl"
                    onClick={async () => {
                      const title = manualDraft.contentIdea.trim();
                      if (!title) {
                        toast({ variant: "destructive", title: "Missing title", description: "Add an idea title first." });
                        return;
                      }
                      const newId = await onCreateDay({
                        date: manualDraft.date,
                        contentIdea: title,
                        contentType: manualDraft.contentType.trim() || undefined,
                        hook: manualDraft.hook.trim() || undefined,
                        notes: manualDraft.notes.trim() || undefined,
                        tags: manualDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
                        bestPostingTime: manualDraft.bestPostingTime.trim() || undefined,
                      });
                      toast({ title: "Saved", description: "Added a manual idea to this plan." });
                      setManualOpen(false);
                    }}
                    disabled={working}
                  >
                    Save idea
                  </Button>
                  <Button
                    type="button"
                    className={cn("rounded-xl text-white", accent.gradient)}
                    onClick={async () => {
                      const title = manualDraft.contentIdea.trim();
                      if (!title) {
                        toast({ variant: "destructive", title: "Missing title", description: "Add an idea title first." });
                        return;
                      }
                      const newId = await onCreateDay({
                        date: manualDraft.date,
                        contentIdea: title,
                        contentType: manualDraft.contentType.trim() || undefined,
                        hook: manualDraft.hook.trim() || undefined,
                        notes: manualDraft.notes.trim() || undefined,
                        tags: manualDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
                        bestPostingTime: manualDraft.bestPostingTime.trim() || undefined,
                      });
                      toast({ title: "Saved", description: "Saved your idea. Improving with AI…" });
                      if (newId) {
                        const placeholderDay = {
                          id: newId,
                          day: 0,
                          date: manualDraft.date,
                          contentIdea: title,
                          hook: manualDraft.hook || title,
                          outline: [],
                          bestPostingTime: manualDraft.bestPostingTime,
                          rationale: "",
                          tags: manualDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
                          descriptionSuggestion: manualDraft.notes,
                          thumbnailConcept: "",
                          status: "not_finished",
                          ideaOrigin: "manual",
                          aiImproved: false,
                        } satisfies SocialPlanDay;
                        const intent = `Improve this user-created idea for ${label}. Keep the original idea. Inputs: Platform: ${label}. Idea title: ${title}. User notes: ${manualDraft.notes}. Content type: ${manualDraft.contentType}. Audience: ${plan.audience ?? ""}. Goal: ${plan.goal ?? ""}. Tone: ${plan.tone ?? ""}. Date: ${manualDraft.date}. Return valid JSON only.`;
                        try {
                          await onRegenerateDay(placeholderDay, intent);
                          await onPatchDay(placeholderDay, { ideaOrigin: "manual", aiImproved: true });
                        } catch (err) {
                          toast({ variant: "destructive", title: "Could not improve idea", description: apiErrorMessage(err, "Please try again.") });
                        }
                      }
                      setManualOpen(false);
                    }}
                    disabled={working}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Save and improve with AI
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>

      <Dialog open={Boolean(activeDayId)} onOpenChange={(open) => !open && setActiveDayId(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#11111a] shadow-2xl">
            {(() => {
              const activeDay = days.find((day) => day.id === activeDayId) ?? null;
              if (!activeDay) return null;
              const status = (activeDay.status ?? "not_finished") as SocialPostStatus;
              const relatedTasks = (activeDay.growthTasks ?? []).slice(0, 2);
              const createText = copyTextForDay(plan.platform, activeDay);

              return (
                <div className="flex max-h-[86vh] flex-col text-white">
                  <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", accent.iconBg)}>
                          <Icon className="h-5 w-5 text-white/85" />
                        </span>
                        <div className="min-w-0">
                          <DialogTitle className="truncate text-lg">{activeDay.contentIdea}</DialogTitle>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", contentTypeTone(activeDay.contentType))}>
                              {activeDay.contentType ? activeDay.contentType.replace(/_/g, " ") : "post"}
                            </span>
                            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
                              {status === "not_finished" ? "Planned" : status}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                              {dayHeader(activeDay.date).weekday} · {activeDay.bestPostingTime || "Time TBD"}
                            </span>
                            {activeDay.ideaOrigin === "manual" ? (
                              <span className="rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                                {activeDay.aiImproved ? "AI improved" : "Manual"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={status}
                          onChange={(event) => void onPatchDay(activeDay, { status: event.target.value as SocialPostStatus })}
                          className="rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-xs text-white"
                        >
                          <option value="not_finished">Planned</option>
                          <option value="posted">Posted</option>
                          <option value="skipped">Skipped</option>
                        </select>
                        <DialogPrimitive.Close className="rounded-xl border border-white/10 bg-white/3 p-2 text-white/70 hover:bg-white/6 hover:text-white">
                          <X className="h-4 w-4" />
                          <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                      </div>
                    </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="flex w-full rounded-2xl border border-white/10 bg-white/5 p-1">
                    {([
                      ["create", "Create"],
                      ["visuals", "Visuals"],
                      ["strategy", "Strategy"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActivePanelTab(id)}
                        className={cn(
                          "flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                          activePanelTab === id
                            ? cn("text-white shadow", accent.gradient)
                            : "text-white/60 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(86vh-150px)] overflow-y-auto p-6">
                    {activePanelTab === "create" ? (
                      <div className="space-y-4">
                        {activeDay.hook ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Hook</p>
                            <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.hook}</p>
                          </PanelCardSoft>
                        ) : null}

                        {plan.platform === "linkedin" ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Post draft</p>
                            <Textarea value={activeDay.postDraft || activeDay.caption || activeDay.descriptionSuggestion || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/4 text-white" />
                            {activeDay.cta ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">CTA:</span> {activeDay.cta}</p> : null}
                          </PanelCardSoft>
                        ) : plan.platform === "tiktok" ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Video script</p>
                            <Textarea value={activeDay.script || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/4 text-white" />
                            {activeDay.caption ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">Caption:</span> {activeDay.caption}</p> : null}
                          </PanelCardSoft>
                        ) : (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Caption</p>
                            <Textarea value={activeDay.caption || activeDay.descriptionSuggestion || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/4 text-white" />
                            {activeDay.script ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">Reel script:</span> {activeDay.script}</p> : null}
                          </PanelCardSoft>
                        )}

                        {activeDay.outline?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Execution guide</p>
                            <ul className="mt-2 space-y-1 text-sm text-white/70">
                              {activeDay.outline.slice(0, 12).map((line, idx) => <li key={`${activeDay.id}-o-${idx}`}>• {line}</li>)}
                            </ul>
                          </PanelCardSoft>
                        ) : null}
                      </div>
                    ) : null}

                    {activePanelTab === "visuals" ? (
                      <div className="space-y-4">
                        {activeDay.visualDirection ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Visual direction</p>
                            <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.visualDirection}</p>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.thumbnailConcept ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Cover idea</p>
                            <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.thumbnailConcept}</p>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.carouselSlides?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Carousel slides</p>
                            <div className="mt-3 space-y-2">
                              {activeDay.carouselSlides.slice(0, 10).map((slide) => (
                                <div key={`${activeDay.id}-slide-${slide.slide}`} className="rounded-xl border border-white/10 bg-white/3 p-3">
                                  <p className="text-xs font-semibold text-white">Slide {slide.slide}: {slide.title}</p>
                                  <p className="mt-1 text-xs text-white/65">{slide.text}</p>
                                  {slide.visual ? <p className="mt-2 text-xs text-white/45">Visual: {slide.visual}</p> : null}
                                </div>
                              ))}
                            </div>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.storySequence?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Story sequence</p>
                            <div className="mt-3 space-y-2">
                              {activeDay.storySequence.slice(0, 10).map((step) => (
                                <div key={`${activeDay.id}-story-${step.step}`} className="rounded-xl border border-white/10 bg-white/3 p-3">
                                  <p className="text-xs font-semibold text-white">Step {step.step}: {step.type}</p>
                                  <p className="mt-1 text-xs text-white/65">{step.content}</p>
                                  {step.visualDirection ? <p className="mt-2 text-xs text-white/45">Visual: {step.visualDirection}</p> : null}
                                </div>
                              ))}
                            </div>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.shotList?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Shot list</p>
                            <ul className="mt-2 space-y-1 text-sm text-white/70">
                              {activeDay.shotList.slice(0, 16).map((line, idx) => <li key={`${activeDay.id}-shot-${idx}`}>• {line}</li>)}
                            </ul>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.recordingSuggestions?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Recording suggestions</p>
                            <ul className="mt-2 space-y-1 text-sm text-white/70">
                              {activeDay.recordingSuggestions.slice(0, 12).map((line, idx) => <li key={`${activeDay.id}-rec-${idx}`}>• {line}</li>)}
                            </ul>
                          </PanelCardSoft>
                        ) : null}
                        {activeDay.textOverlays?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Text overlays</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activeDay.textOverlays.slice(0, 10).map((overlay) => (
                                <span key={`${activeDay.id}-overlay-${overlay}`} className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/70">
                                  {overlay}
                                </span>
                              ))}
                            </div>
                          </PanelCardSoft>
                        ) : null}
                      </div>
                    ) : null}

                    {activePanelTab === "strategy" ? (
                      <div className="space-y-4">
                        <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Why this works</p>
                          <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.rationale}</p>
                        </PanelCardSoft>
                        <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Best time</p>
                          <p className="mt-2 text-sm text-white/70">{activeDay.bestPostingTime || "Time TBD"}</p>
                        </PanelCardSoft>
                        {activeDay.tags?.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Hashtags and keywords</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activeDay.tags.slice(0, 18).map((tag) => (
                                <span key={`${activeDay.id}-tag-${tag}`} className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/70">
                                  {tag.startsWith("#") ? tag : `#${tag}`}
                                </span>
                              ))}
                            </div>
                          </PanelCardSoft>
                        ) : null}
                        {relatedTasks.length ? (
                          <PanelCardSoft className="border border-white/10 bg-white/3 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Related tasks</p>
                              <button type="button" className="text-xs text-white/60 hover:text-white" onClick={() => setViewMode("tasks")}>
                                View all tasks
                              </button>
                            </div>
                            <div className="mt-3 space-y-2">
                              {relatedTasks.map((task, idx) => (
                                <div key={`${activeDay.id}-rel-${idx}`} className="rounded-xl border border-white/10 bg-white/3 p-3">
                                  <p className="text-xs font-semibold text-white">{task.title}</p>
                                  <p className="mt-1 text-xs text-white/55">{task.suggestedTiming}</p>
                                </div>
                              ))}
                            </div>
                          </PanelCardSoft>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={async () => {
                          await navigator.clipboard.writeText(createText);
                          toast({ title: "Copied", description: "Post copied to clipboard." });
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={async () => {
                          try {
                            await onRegenerateDay(activeDay);
                            toast({ title: "Regenerated", description: "Generated a new version of this idea." });
                          } catch (err) {
                            toast({ variant: "destructive", title: "Could not regenerate", description: apiErrorMessage(err, "Please try again.") });
                          }
                        }}
                        disabled={working}
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Regenerate
                      </Button>
                      {activeDay.ideaOrigin === "manual" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="rounded-xl"
                          onClick={async () => {
                            const intent = `Improve this user-created idea for ${label}. Keep the original idea. Inputs: Platform: ${label}. Idea title: ${activeDay.contentIdea}. User notes: ${activeDay.postContext ?? ""}. Content type: ${activeDay.contentType ?? ""}. Audience: ${plan.audience ?? ""}. Goal: ${plan.goal ?? ""}. Tone: ${plan.tone ?? ""}. Date: ${activeDay.date}. Return valid JSON only.`;
                            try {
                              await onRegenerateDay(activeDay, intent);
                              await onPatchDay(activeDay, { aiImproved: true });
                              toast({ title: "Improved", description: "Updated this idea with AI." });
                            } catch (err) {
                              toast({ variant: "destructive", title: "Could not improve idea", description: apiErrorMessage(err, "Please try again.") });
                            }
                          }}
                          disabled={working}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Improve with AI
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={async () => {
                          try {
                            await onPatchDay(activeDay, { status: "posted" });
                            toast({ title: "Marked as posted", description: "Updated this post to Posted." });
                          } catch (err) {
                            toast({ variant: "destructive", title: "Could not update status", description: apiErrorMessage(err, "Please try again.") });
                          }
                        }}
                        disabled={working || status === "posted"}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark as posted
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl text-red-200 hover:text-red-100"
                        onClick={async () => {
                          try {
                            await onDeleteDay(activeDay);
                            setActiveDayId(null);
                          } catch (err) {
                            toast({ variant: "destructive", title: "Could not delete idea", description: apiErrorMessage(err, "Please try again.") });
                          }
                        }}
                        disabled={working}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </div>
  );
}

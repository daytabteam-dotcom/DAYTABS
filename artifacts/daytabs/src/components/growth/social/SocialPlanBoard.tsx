import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, Instagram, Linkedin, ListChecks, Music2, RefreshCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PanelCard, PanelCardSoft, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { GrowthTask, SocialPlanDay, SocialPlatform, SocialPostStatus, SocialWeeklyPlan } from "./types";
import { SocialPlanCard } from "./SocialPlanCard";

function platformLabel(platform: SocialPlatform) {
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "tiktok") return "TikTok";
  return "Instagram";
}

function formatRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} to ${endDate}`;
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} to ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

type ViewMode = "calendar" | "planner";

function platformIcon(platform: SocialPlatform) {
  if (platform === "linkedin") return Linkedin;
  if (platform === "instagram") return Instagram;
  return Music2;
}

function dayHeader(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { weekday: isoDate, date: "" };
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

function statusTone(status: SocialPostStatus) {
  if (status === "posted") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "skipped") return "border-red-300/25 bg-red-400/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function contentTypeTone(contentType?: string) {
  const key = (contentType ?? "").toLowerCase();
  if (key.includes("carousel")) return "border-violet-300/25 bg-violet-500/10 text-violet-100";
  if (key.includes("story")) return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (key.includes("reel") || key.includes("video")) return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

function copyLabelForPlatform(platform: SocialPlatform) {
  if (platform === "linkedin") return "Copy LinkedIn Post";
  if (platform === "tiktok") return "Copy Video Script";
  return "Copy Caption";
}

export function SocialPlanBoard({
  plan,
  working,
  onGenerateNextWeek,
  onPatchDay,
  onDeleteDay,
  onRegenerateDay,
}: {
  plan: SocialWeeklyPlan;
  working: boolean;
  onGenerateNextWeek: () => void;
  onPatchDay: (day: SocialPlanDay, patch: Partial<SocialPlanDay>) => void;
  onDeleteDay: (day: SocialPlanDay) => void;
  onRegenerateDay: (day: SocialPlanDay, intent?: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<"create" | "visuals" | "growth" | "strategy">("create");
  const label = platformLabel(plan.platform);
  const days = useMemo(() => (plan.plan.days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day), [plan.plan.days]);
  const Icon = platformIcon(plan.platform);

  const byDate = useMemo(() => {
    const map = new Map<string, SocialPlanDay[]>();
    for (const day of days) map.set(day.date, [...(map.get(day.date) ?? []), day]);
    return map;
  }, [days]);

  const dates = useMemo(() => {
    const start = new Date(`${plan.startDate}T00:00:00Z`);
    const values: string[] = [];
    for (let idx = 0; idx < 7; idx += 1) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + idx);
      values.push(date.toISOString().slice(0, 10));
    }
    return values;
  }, [plan.startDate]);

  return (
    <div className="space-y-6">
      <PanelCard className="p-6">
        <PanelHeader className="items-start justify-between gap-4 md:flex-row">
          <div>
            <PanelTitle>Growth Planner</PanelTitle>
            <PanelSubtitle>
              {label} weekly plan, {formatRange(plan.startDate, plan.endDate)}
            </PanelSubtitle>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                Topic: <span className="text-white/70">{plan.topic}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                Posts planned: <span className="text-white/70">{days.length}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={viewMode === "calendar" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("calendar")}>
              <CalendarDays className="mr-2 h-4 w-4" /> Calendar
            </Button>
            <Button variant={viewMode === "planner" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("planner")}>
              <ListChecks className="mr-2 h-4 w-4" /> Planner
            </Button>
            <Button variant="secondary" className="rounded-lg" onClick={onGenerateNextWeek} disabled={working}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Generate next week
            </Button>
          </div>
        </PanelHeader>
      </PanelCard>

      <div className="sticky top-4 z-10">
        <PanelCardSoft className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#120d1f]/80 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
              Focus: {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="hidden md:inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              {plan.plan.recommendedPostingStrategy ? plan.plan.recommendedPostingStrategy : "Open a card to see the execution plan, visuals, and growth tasks."}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-lg"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                const todayDay = days.find((day) => day.date === today) ?? days[0];
                if (todayDay) setActiveDayId(todayDay.id);
              }}
              disabled={!days.length}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Copy today’s post
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="rounded-lg"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                const todayDay = days.find((day) => day.date === today) ?? days[0];
                if (!todayDay) return;
                onPatchDay(todayDay, { status: "posted" });
              }}
              disabled={!days.length || working}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark as posted
            </Button>
          </div>
        </PanelCardSoft>
      </div>

      {plan.plan.summary ? (
        <PanelCardSoft className="border border-white/10 p-4 text-sm text-white/65">
          {plan.plan.summary}
        </PanelCardSoft>
      ) : null}

      {viewMode === "calendar" ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {dates.map((date) => (
              <div key={date} className="min-h-[260px] w-[340px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.025] p-3 transition-all hover:bg-white/[0.04]">
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
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setActiveDayId(day.id)}
                        className="w-full text-left"
                      >
                        <PanelCardSoft className="border border-white/10 p-3 transition-all hover:-translate-y-0.5 hover:bg-white/[0.06]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
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
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-white/35">{dayHeader(day.date).weekday}</span>
                          </div>
                          {day.tags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {day.tags.slice(0, 3).map((tag) => (
                                <span key={`${day.id}-${tag}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </PanelCardSoft>
                      </button>
                    );
                  })}
                  {!byDate.get(date)?.length ? (
                    <PanelCardSoft className="border border-dashed border-white/10 p-4 text-sm text-white/45">
                      No planned idea for this date.
                    </PanelCardSoft>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {days.map((day) => (
            <SocialPlanCard
              key={day.id}
              day={day}
              working={working}
              onPatch={(patch) => onPatchDay(day, patch)}
              onDelete={() => onDeleteDay(day)}
              onRegenerate={() => onRegenerateDay(day)}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(activeDayId)} onOpenChange={(open) => !open && setActiveDayId(null)}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-[680px] overflow-y-auto border-white/10 bg-[#0b0b0f] p-0 text-white sm:rounded-2xl md:fixed md:right-6 md:top-6 md:h-[calc(100vh-3rem)] md:w-[520px] md:translate-x-0">
          {(() => {
            const activeDay = days.find((day) => day.id === activeDayId) ?? null;
            if (!activeDay) return null;
            const status = (activeDay.status ?? "not_finished") as SocialPostStatus;
            const tasks: GrowthTask[] = activeDay.growthTasks ?? [];
            const createText = plan.platform === "linkedin"
              ? (activeDay.postDraft || activeDay.descriptionSuggestion || "")
              : plan.platform === "tiktok"
                ? (activeDay.script || activeDay.descriptionSuggestion || "")
                : (activeDay.caption || activeDay.descriptionSuggestion || "");

            return (
              <>
                <DialogHeader className="border-b border-white/10 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                        <Icon className="h-5 w-5 text-white/75" />
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
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                            {dayHeader(activeDay.date).weekday} · {activeDay.bestPostingTime || "Time TBD"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <select
                      value={status}
                      onChange={(event) => onPatchDay(activeDay, { status: event.target.value as SocialPostStatus })}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white"
                    >
                      <option value="not_finished">Planned</option>
                      <option value="posted">Posted</option>
                      <option value="skipped">Skipped</option>
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="rounded-lg bg-white text-black hover:bg-white/90"
                      onClick={async () => {
                        await navigator.clipboard.writeText(createText);
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {copyLabelForPlatform(plan.platform)}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg"
                      onClick={() => onPatchDay(activeDay, { status: "posted" })}
                      disabled={working}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Mark as posted
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg"
                      onClick={() => onRegenerateDay(activeDay)}
                      disabled={working}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg text-red-200 hover:text-red-100"
                      onClick={() => onDeleteDay(activeDay)}
                      disabled={working}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { label: "Make it more viral", intent: "Make it more viral with a stronger hook and clearer tension." },
                      { label: "Make it more personal", intent: "Make it more personal and founder-led with a specific story." },
                      { label: "Make it shorter", intent: "Make it shorter and easier to execute." },
                      { label: "Make it more educational", intent: "Make it more educational with a clear framework and steps." },
                      { label: "Turn into carousel", intent: "Convert this idea into a carousel, include slide-by-slide structure." },
                      { label: "Turn into video script", intent: "Convert this idea into a video script, include shots and overlays." },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => onRegenerateDay(activeDay, chip.intent)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
                        disabled={working}
                      >
                        <Wand2 className="h-3.5 w-3.5 text-violet-200" />
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </DialogHeader>

                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["create", "Create"],
                      ["visuals", "Visuals"],
                      ["growth", "Growth"],
                      ["strategy", "Strategy"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActivePanelTab(id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          activePanelTab === id ? "border-white/20 bg-white/[0.08] text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.07] hover:text-white",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {activePanelTab === "create" ? (
                    <div className="mt-5 space-y-4">
                      <PanelCardSoft className="border border-white/10 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Hook</p>
                        <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.hook}</p>
                      </PanelCardSoft>
                      {plan.platform === "linkedin" ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Post draft</p>
                          <Textarea value={activeDay.postDraft || activeDay.descriptionSuggestion || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/[0.04] text-white" />
                          {activeDay.cta ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">CTA:</span> {activeDay.cta}</p> : null}
                        </PanelCardSoft>
                      ) : plan.platform === "tiktok" ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Video script</p>
                          <Textarea value={activeDay.script || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/[0.04] text-white" />
                          {activeDay.caption ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">Caption:</span> {activeDay.caption}</p> : null}
                        </PanelCardSoft>
                      ) : (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Caption</p>
                          <Textarea value={activeDay.caption || activeDay.descriptionSuggestion || ""} readOnly className="mt-2 min-h-56 border-white/10 bg-white/[0.04] text-white" />
                          {activeDay.script ? <p className="mt-3 text-sm text-white/65"><span className="text-white/85">Reel script:</span> {activeDay.script}</p> : null}
                        </PanelCardSoft>
                      )}
                      {activeDay.outline?.length ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Execution guide</p>
                          <ul className="mt-2 space-y-1 text-sm text-white/70">
                            {activeDay.outline.slice(0, 12).map((line, idx) => <li key={`${activeDay.id}-o-${idx}`}>• {line}</li>)}
                          </ul>
                        </PanelCardSoft>
                      ) : null}
                    </div>
                  ) : null}

                  {activePanelTab === "visuals" ? (
                    <div className="mt-5 space-y-4">
                      {activeDay.visualDirection ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Visual direction</p>
                          <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.visualDirection}</p>
                        </PanelCardSoft>
                      ) : null}
                      {activeDay.thumbnailConcept ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Cover idea</p>
                          <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.thumbnailConcept}</p>
                        </PanelCardSoft>
                      ) : null}
                      {activeDay.carouselSlides?.length ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Carousel slides</p>
                          <div className="mt-3 space-y-2">
                            {activeDay.carouselSlides.slice(0, 10).map((slide) => (
                              <div key={`${activeDay.id}-slide-${slide.slide}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <p className="text-xs font-semibold text-white">Slide {slide.slide}: {slide.title}</p>
                                <p className="mt-1 text-xs text-white/65">{slide.text}</p>
                                {slide.visual ? <p className="mt-2 text-xs text-white/45">Visual: {slide.visual}</p> : null}
                              </div>
                            ))}
                          </div>
                        </PanelCardSoft>
                      ) : null}
                      {activeDay.shotList?.length ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Shot list</p>
                          <ul className="mt-2 space-y-1 text-sm text-white/70">
                            {activeDay.shotList.slice(0, 16).map((line, idx) => <li key={`${activeDay.id}-shot-${idx}`}>• {line}</li>)}
                          </ul>
                        </PanelCardSoft>
                      ) : null}
                      {activeDay.textOverlays?.length ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Text overlays</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeDay.textOverlays.slice(0, 10).map((overlay) => (
                              <span key={`${activeDay.id}-overlay-${overlay}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                                {overlay}
                              </span>
                            ))}
                          </div>
                        </PanelCardSoft>
                      ) : null}
                    </div>
                  ) : null}

                  {activePanelTab === "growth" ? (
                    <div className="mt-5 space-y-3">
                      {tasks.length ? (
                        tasks.map((task, index) => (
                          <PanelCardSoft key={`${activeDay.id}-task-${index}`} className="border border-white/10 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{task.title}</p>
                                <p className="mt-1 text-xs text-white/55">{task.suggestedTiming}</p>
                              </div>
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65">
                                <input
                                  type="checkbox"
                                  checked={Boolean(task.completed)}
                                  onChange={(event) => {
                                    const next = tasks.map((item, i) => i === index ? ({ ...item, completed: event.target.checked }) : item);
                                    onPatchDay(activeDay, { growthTasks: next });
                                  }}
                                />
                                Done
                              </label>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-white/70">{task.description}</p>
                            <p className="mt-2 text-xs text-white/45">Why it matters: {task.reason}</p>
                            {task.targetTopicOrHashtag ? <p className="mt-2 text-xs text-white/45">Target: {task.targetTopicOrHashtag}</p> : null}
                          </PanelCardSoft>
                        ))
                      ) : (
                        <PanelCardSoft className="border border-dashed border-white/10 p-4 text-sm text-white/45">
                          No growth tasks yet. Regenerate this idea to add tasks.
                        </PanelCardSoft>
                      )}
                    </div>
                  ) : null}

                  {activePanelTab === "strategy" ? (
                    <div className="mt-5 space-y-4">
                      <PanelCardSoft className="border border-white/10 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Why this works</p>
                        <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.rationale}</p>
                      </PanelCardSoft>
                      <PanelCardSoft className="border border-white/10 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Best time</p>
                        <p className="mt-2 text-sm text-white/70">{activeDay.bestPostingTime || "Time TBD"}</p>
                      </PanelCardSoft>
                      {activeDay.tags?.length ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Hashtags and keywords</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeDay.tags.slice(0, 18).map((tag) => (
                              <span key={`${activeDay.id}-tag-${tag}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </PanelCardSoft>
                      ) : null}
                      {activeDay.postContext ? (
                        <PanelCardSoft className="border border-white/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Angle</p>
                          <p className="mt-2 text-sm leading-6 text-white/75">{activeDay.postContext}</p>
                        </PanelCardSoft>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

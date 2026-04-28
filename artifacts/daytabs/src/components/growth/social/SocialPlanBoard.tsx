import { useMemo, useState } from "react";
import { CalendarDays, ListChecks, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelCard, PanelCardSoft, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import type { SocialPlanDay, SocialPlatform, SocialWeeklyPlan } from "./types";
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
  onRegenerateDay: (day: SocialPlanDay) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const label = platformLabel(plan.platform);
  const days = useMemo(() => (plan.plan.days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day), [plan.plan.days]);

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
                    <p className="text-sm font-semibold text-white">{date}</p>
                    <p className="mt-1 text-xs text-white/35">
                      {(byDate.get(date) ?? []).length ? `${(byDate.get(date) ?? []).length} ideas` : "Open"}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {(byDate.get(date) ?? []).map((day) => (
                    <SocialPlanCard
                      key={day.id}
                      day={day}
                      working={working}
                      onPatch={(patch) => onPatchDay(day, patch)}
                      onDelete={() => onDeleteDay(day)}
                      onRegenerate={() => onRegenerateDay(day)}
                    />
                  ))}
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
    </div>
  );
}


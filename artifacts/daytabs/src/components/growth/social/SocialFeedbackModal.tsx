import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCardSoft } from "@/components/panel-system";
import type { SocialPlatform, SocialPlanDay, SocialPostPerformanceFeedback, SocialPostPerformance, SocialPostStatus } from "./types";
import { cn } from "@/lib/utils";

function platformLabel(platform: SocialPlatform) {
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "tiktok") return "TikTok";
  return "Instagram";
}

const STATUS_OPTIONS: Array<{ value: SocialPostStatus; label: string }> = [
  { value: "posted", label: "Posted" },
  { value: "skipped", label: "Skipped" },
  { value: "not_finished", label: "Not finished" },
];

const PERF_OPTIONS: Array<{ value: SocialPostPerformance; label: string }> = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "average", label: "Average" },
  { value: "poor", label: "Poor" },
  { value: "unknown", label: "Unknown" },
];

export function SocialFeedbackModal({
  open,
  platform,
  days,
  followersCount,
  onFollowersCountChange,
  onClose,
  onSkip,
  onSubmit,
  working,
}: {
  open: boolean;
  platform: SocialPlatform;
  days: SocialPlanDay[];
  followersCount: string;
  onFollowersCountChange: (value: string) => void;
  working: boolean;
  onClose: () => void;
  onSkip: () => void;
  onSubmit: (feedback: SocialPostPerformanceFeedback[]) => void;
}) {
  const label = platformLabel(platform);

  const initial = useMemo(() => {
    return Object.fromEntries(
      days.map((day) => [
        day.id,
        {
          status: (day.status ?? "not_finished") as SocialPostStatus,
          performance: "unknown" as SocialPostPerformance,
          viewsOrImpressions: "",
          likes: "",
          comments: "",
          shares: "",
          saves: "",
          newFollowers: "",
          whatWorked: "",
          whatDidNotWork: "",
          userNotes: "",
        },
      ]),
    ) as Record<string, any>;
  }, [days]);

  const [draft, setDraft] = useState<Record<string, any>>(initial);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#11111a] shadow-2xl">
          <div className="flex max-h-[86vh] flex-col text-white">
            <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <DialogHeader className="space-y-1 pr-10">
                  <DialogTitle className="text-xl text-white">How did last week&apos;s {label} posts perform?</DialogTitle>
                  <DialogDescription className="text-white/55">Add quick feedback so DayTabs can create a smarter plan for next week.</DialogDescription>
                </DialogHeader>
                <DialogPrimitive.Close className="rounded-xl border border-white/10 bg-white/3 p-2 text-white/70 hover:bg-white/6 hover:text-white">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>
            </div>

            <div className="max-h-[calc(86vh-150px)] overflow-y-auto p-6">
              <PanelCardSoft className="mb-4 border border-white/10 bg-white/3 p-4">
                <p className="text-xs font-semibold text-white">Current followers / subscribers (optional)</p>
                <p className="mt-1 text-xs text-white/50">Used to adapt next week&apos;s plan + growth tasks to your current growth stage.</p>
                <Input
                  value={followersCount}
                  onChange={(event) => onFollowersCountChange(event.target.value)}
                  placeholder="Example: 1200"
                  inputMode="numeric"
                  className="mt-3 border-white/10 bg-white/4 text-white placeholder:text-white/30"
                />
              </PanelCardSoft>
              <div className="space-y-4">
          {days.map((day) => {
            const value = draft[day.id] ?? {};
            return (
              <PanelCardSoft key={day.id} className="border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">{day.contentIdea}</p>
                    <p className="mt-1 text-xs text-white/45">{day.date}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={value.status}
                      onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, status: event.target.value } }))}
                      className="rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-xs text-white"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={value.performance}
                      onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, performance: event.target.value } }))}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs text-white",
                        value.performance === "great" || value.performance === "good"
                          ? "border-emerald-300/20 bg-emerald-500/10"
                          : value.performance === "poor"
                            ? "border-red-300/20 bg-red-500/10"
                            : "border-white/10 bg-white/4",
                      )}
                    >
                      {PERF_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input
                    value={value.viewsOrImpressions}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, viewsOrImpressions: event.target.value } }))}
                    placeholder="Views or impressions"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.likes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, likes: event.target.value } }))}
                    placeholder="Likes"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.comments}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, comments: event.target.value } }))}
                    placeholder="Comments"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.shares}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, shares: event.target.value } }))}
                    placeholder="Shares"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.saves}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, saves: event.target.value } }))}
                    placeholder="Saves"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.newFollowers}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, newFollowers: event.target.value } }))}
                    placeholder="New followers"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Input
                    value={value.whatWorked}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, whatWorked: event.target.value } }))}
                    placeholder="What worked?"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.whatDidNotWork}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, whatDidNotWork: event.target.value } }))}
                    placeholder="What did not work?"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={value.userNotes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [day.id]: { ...value, userNotes: event.target.value } }))}
                    placeholder="Notes"
                    className="border-white/10 bg-white/4 text-white placeholder:text-white/30"
                  />
                </div>
              </PanelCardSoft>
            );
          })}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#11111a]/95 p-6 backdrop-blur">
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onSkip} disabled={working}>
                  Skip Feedback
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const feedback: SocialPostPerformanceFeedback[] = days.map((day) => {
                      const value = draft[day.id] ?? {};
                      const num = (v: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
                      return {
                        planDayId: day.id,
                        date: day.date,
                        contentIdea: day.contentIdea,
                        platform,
                        status: (value.status ?? "not_finished") as SocialPostStatus,
                        performance: (value.performance ?? "unknown") as SocialPostPerformance,
                        viewsOrImpressions: num(value.viewsOrImpressions),
                        likes: num(value.likes),
                        comments: num(value.comments),
                        shares: num(value.shares),
                        saves: num(value.saves),
                        newFollowers: num(value.newFollowers),
                        whatWorked: value.whatWorked?.trim() || undefined,
                        whatDidNotWork: value.whatDidNotWork?.trim() || undefined,
                        userNotes: value.userNotes?.trim() || undefined,
                      };
                    });
                    onSubmit(feedback);
                  }}
                  disabled={working}
                >
                  {working ? "Saving..." : "Save Feedback and Generate Next Week"}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { RefreshCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PanelCardSoft } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { SocialPlanDay, SocialPostStatus } from "./types";

function statusTone(status: SocialPostStatus) {
  if (status === "posted") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "skipped") return "border-red-300/25 bg-red-400/10 text-red-100";
  return "border-white/10 bg-white/4 text-white/55";
}

export function SocialPlanCard({
  day,
  working,
  onPatch,
  onDelete,
  onRegenerate,
}: {
  day: SocialPlanDay;
  working?: boolean;
  onPatch: (patch: Partial<SocialPlanDay>) => void;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    contentIdea: day.contentIdea,
    hook: day.hook,
    outline: day.outline.join("\n"),
    bestPostingTime: day.bestPostingTime,
    rationale: day.rationale,
    tags: day.tags.join(", "),
    descriptionSuggestion: day.descriptionSuggestion,
    thumbnailConcept: day.thumbnailConcept,
    soundSuggestion: day.soundSuggestion ?? "",
    status: (day.status ?? "not_finished") as SocialPostStatus,
  }));

  const dateLabel = useMemo(() => {
    const date = new Date(`${day.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return day.date;
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }, [day.date]);

  const status = (day.status ?? "not_finished") as SocialPostStatus;

  if (!editing) {
    return (
      <PanelCardSoft className="border border-white/10 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{dateLabel}</p>
            <p className="mt-2 text-base font-semibold text-white">{day.contentIdea}</p>
            {day.hook ? <p className="mt-2 text-sm text-white/55">{day.hook}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(status))}>
              {status === "not_finished" ? "Planned" : status}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/3.5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Outline</p>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              {day.outline.slice(0, 6).map((line, idx) => <li key={`${day.id}-o-${idx}`}>• {line}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/3.5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Post direction</p>
            <p className="mt-2 text-sm leading-6 text-white/70 line-clamp-6">{day.descriptionSuggestion}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/3.5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Best time</p>
            <p className="mt-2 text-sm text-white/70">{day.bestPostingTime || "Time TBD"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/3.5 p-3 md:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Why this works</p>
            <p className="mt-2 text-sm leading-6 text-white/70 line-clamp-4">{day.rationale}</p>
          </div>
        </div>

        {day.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {day.tags.slice(0, 14).map((tag) => (
              <span key={`${day.id}-t-${tag}`} className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/65">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="rounded-lg" onClick={() => setEditing(true)} disabled={working}>
            Edit
          </Button>
          <Button type="button" variant="secondary" className="rounded-lg" onClick={onRegenerate} disabled={working}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
          <Button type="button" variant="secondary" className="rounded-lg text-red-200 hover:text-red-100" onClick={onDelete} disabled={working}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </PanelCardSoft>
    );
  }

  return (
    <PanelCardSoft className="border border-white/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{dateLabel}</p>
          <p className="mt-2 text-sm font-semibold text-white/75">Edit idea</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as SocialPostStatus }))}
            className="rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-xs text-white"
          >
            <option value="not_finished">Planned</option>
            <option value="posted">Posted</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Content idea</p>
          <Textarea value={draft.contentIdea} onChange={(e) => setDraft((p) => ({ ...p, contentIdea: e.target.value }))} className="mt-2 min-h-16 border-white/10 bg-white/4 text-white" />
        </div>
        <div className="lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Hook</p>
          <Textarea value={draft.hook} onChange={(e) => setDraft((p) => ({ ...p, hook: e.target.value }))} className="mt-2 min-h-16 border-white/10 bg-white/4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Outline (one per line)</p>
          <Textarea value={draft.outline} onChange={(e) => setDraft((p) => ({ ...p, outline: e.target.value }))} className="mt-2 min-h-40 border-white/10 bg-white/4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Description or caption</p>
          <Textarea value={draft.descriptionSuggestion} onChange={(e) => setDraft((p) => ({ ...p, descriptionSuggestion: e.target.value }))} className="mt-2 min-h-40 border-white/10 bg-white/4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Best posting time</p>
          <Textarea value={draft.bestPostingTime} onChange={(e) => setDraft((p) => ({ ...p, bestPostingTime: e.target.value }))} className="mt-2 min-h-16 border-white/10 bg-white/4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Hashtags</p>
          <Textarea value={draft.tags} onChange={(e) => setDraft((p) => ({ ...p, tags: e.target.value }))} className="mt-2 min-h-16 border-white/10 bg-white/4 text-white" />
        </div>
        <div className="lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Why this works</p>
          <Textarea value={draft.rationale} onChange={(e) => setDraft((p) => ({ ...p, rationale: e.target.value }))} className="mt-2 min-h-24 border-white/10 bg-white/4 text-white" />
        </div>
        <div className="lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Cover or visual concept</p>
          <Textarea value={draft.thumbnailConcept} onChange={(e) => setDraft((p) => ({ ...p, thumbnailConcept: e.target.value }))} className="mt-2 min-h-16 border-white/10 bg-white/4 text-white" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="rounded-lg"
          onClick={() => {
            onPatch({
              contentIdea: draft.contentIdea.trim(),
              hook: draft.hook.trim(),
              outline: draft.outline.split("\n").map((line) => line.trim()).filter(Boolean),
              bestPostingTime: draft.bestPostingTime.trim(),
              rationale: draft.rationale.trim(),
              tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
              descriptionSuggestion: draft.descriptionSuggestion.trim(),
              thumbnailConcept: draft.thumbnailConcept.trim(),
              soundSuggestion: draft.soundSuggestion.trim() || null,
              status: draft.status,
            });
            setEditing(false);
          }}
          disabled={working}
        >
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
        <Button type="button" variant="secondary" className="rounded-lg" onClick={() => setEditing(false)} disabled={working}>
          Cancel
        </Button>
      </div>
    </PanelCardSoft>
  );
}


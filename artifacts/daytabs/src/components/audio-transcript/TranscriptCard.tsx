import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AudioTranscriptProject, AudioTranslation } from "./types";
import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

function dateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export function TranscriptCard({
  project,
  translations,
  onOpen,
  onDelete,
}: {
  project: AudioTranscriptProject;
  translations: AudioTranslation[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const completedTranslations = translations.filter((t) => t.status === "completed").map((t) => t.targetLanguage);
  const statusTone =
    project.status === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : project.status === "failed" ? "border-red-500/20 bg-red-500/10 text-red-200"
      : "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return (
    <PanelCardSoft className="p-5">
      <div className="flex items-start gap-4">
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(168,85,247,0.18),transparent_55%),rgba(255,255,255,0.03)]">
          <div className="absolute inset-0 opacity-60">
            <div className="absolute -left-8 top-6 h-16 w-16 rounded-full bg-pink-500/25 blur-2xl" />
            <div className="absolute -right-8 bottom-0 h-16 w-16 rounded-full bg-violet-500/25 blur-2xl" />
          </div>
          <div className="relative z-10 flex h-full items-center justify-center">
            <AudioLines className="h-6 w-6 text-white/85" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 flex items-end gap-1 opacity-80">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="w-1 rounded bg-white/30"
                style={{ height: `${6 + ((i * 7) % 18)}px` }}
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white/90">{project.title}</div>
              <div className="mt-1 text-xs text-white/55 truncate">
                {project.audioFileName ?? "Audio"} · {dateLabel(project.createdAt)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn("border", statusTone)}>{project.status}</Badge>
              {project.audioDeleted ? (
                <Badge className="border border-amber-400/20 bg-amber-500/10 text-amber-200">
                  audio removed
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="border border-white/10 bg-white/[0.04] text-white/75">
              src: {project.sourceLanguage ?? "auto"}
            </Badge>
            {project.detectedLanguage ? (
              <Badge className="border border-white/10 bg-white/[0.04] text-white/75">
                detected: {project.detectedLanguage}
              </Badge>
            ) : null}
            {completedTranslations.length ? (
              <Badge className="border border-white/10 bg-white/[0.04] text-white/75">
                {completedTranslations.length} translation{completedTranslations.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onOpen}>Open</Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
          </div>
        </div>
      </div>
    </PanelCardSoft>
  );
}

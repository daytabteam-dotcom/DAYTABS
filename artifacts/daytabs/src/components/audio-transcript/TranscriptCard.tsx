import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { AudioTranscriptProject, AudioTranslation } from "./types";

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
  return (
    <PanelCardSoft className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white/90">{project.title}</div>
          <div className="mt-1 text-xs text-white/55">
            {project.audioFileName ?? "Audio"} · {dateLabel(project.createdAt)} · {project.status}
          </div>
          <div className="mt-2 text-xs text-white/55">
            Source: {project.sourceLanguage ?? "auto"}{project.detectedLanguage ? ` · Detected: ${project.detectedLanguage}` : ""}
          </div>
          {project.audioDeleted ? <div className="mt-2 text-xs text-amber-200">Original audio file removed after processing</div> : null}
          {completedTranslations.length ? (
            <div className="mt-2 text-xs text-white/55">Translations: {completedTranslations.join(", ")}</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onOpen}>Open</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
        </div>
      </div>
    </PanelCardSoft>
  );
}


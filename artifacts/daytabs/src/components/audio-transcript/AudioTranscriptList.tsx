import React from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import type { AudioTranscriptProject, AudioTranslation } from "./types";
import { TranscriptCard } from "./TranscriptCard";

export function AudioTranscriptList({
  projects,
  translationsByProject,
  onOpen,
  onDelete,
}: {
  projects: AudioTranscriptProject[];
  translationsByProject: Record<string, AudioTranslation[]>;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}) {
  return (
    <PanelCard className="p-6">
      <PanelEyebrow>Saved</PanelEyebrow>
      <PanelTitle className="text-2xl">Transcripts</PanelTitle>
      <PanelSubtitle>Every upload is saved as a card with transcripts and translations.</PanelSubtitle>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {projects.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">No transcripts yet. Upload an audio file to start.</PanelCardSoft>
        ) : (
          projects.map((p) => (
            <TranscriptCard
              key={p.id}
              project={p}
              translations={translationsByProject[p.id] ?? []}
              onOpen={() => onOpen(p.id)}
              onDelete={() => onDelete(p.id)}
            />
          ))
        )}
      </div>
    </PanelCard>
  );
}


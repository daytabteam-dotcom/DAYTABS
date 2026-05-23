import React from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import type { AudioTranscriptProject, AudioTranslation } from "./types";
import { TranscriptCard } from "./TranscriptCard";
import { Captions } from "lucide-react";

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
          <PanelCardSoft className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Captions className="h-6 w-6 text-white/70" />
              </div>
              <div className="mt-4 text-lg font-semibold text-white/85">No transcripts yet</div>
              <div className="mt-1 max-w-md text-sm text-white/55">
                Upload an audio file to generate a timestamped transcript. Then translate and export subtitles.
              </div>
            </div>
          </PanelCardSoft>
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

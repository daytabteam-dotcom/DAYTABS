import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { AudioTranscriptProject, AudioTranslation } from "./types";
import { TranscriptViewer } from "./TranscriptViewer";
import { parseSegments, convertSegmentsToSRT } from "./utils";
import { TranslationPanel } from "./TranslationPanel";

export function AudioTranscriptDetail({
  project,
  translations,
  onBack,
  onTranslationSaved,
}: {
  project: AudioTranscriptProject;
  translations: AudioTranslation[];
  onBack: () => void;
  onTranslationSaved: (t: AudioTranslation) => void;
}) {
  const [tab, setTab] = useState<"original" | "translations">("original");
  const segments = useMemo(() => parseSegments(project.transcriptSegments), [project.transcriptSegments]);

  function download(filename: string, content: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PanelCard className="p-6">
        <PanelHeader className="justify-between gap-4">
          <div className="space-y-1">
            <PanelEyebrow>Detail</PanelEyebrow>
            <PanelTitle className="text-2xl">{project.title}</PanelTitle>
            <PanelSubtitle>
              {project.audioFileName ?? "Audio"} · {project.status}
            </PanelSubtitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
          </div>
        </PanelHeader>

        {project.audioDeleted ? (
          <PanelCardSoft className="mt-4 p-4 text-sm text-amber-200">
            Original audio file removed after processing
          </PanelCardSoft>
        ) : project.audioFileUrl ? (
          <div className="mt-4">
            <audio controls src={project.audioFileUrl} className="w-full" />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("original")}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${tab === "original" ? "border-pink-500/35 bg-pink-500/10 text-pink-200" : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80 hover:border-white/18"}`}
          >
            Original transcript
          </button>
          <button
            type="button"
            onClick={() => setTab("translations")}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${tab === "translations" ? "border-pink-500/35 bg-pink-500/10 text-pink-200" : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80 hover:border-white/18"}`}
          >
            Translations
          </button>
        </div>
      </PanelCard>

      {tab === "original" ? (
        <PanelCard className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <PanelEyebrow>Original</PanelEyebrow>
              <PanelTitle className="text-2xl">Transcript</PanelTitle>
              <PanelSubtitle>Timestamped segments.</PanelSubtitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(project.fullTranscript ?? "")}>Copy</Button>
              <Button variant="outline" onClick={() => download(`${project.title}.txt`, project.fullTranscript ?? "")}>Download TXT</Button>
              <Button variant="outline" onClick={() => download(`${project.title}.json`, JSON.stringify(segments, null, 2), "application/json")}>Download JSON</Button>
              <Button variant="outline" onClick={() => download(`${project.title}.srt`, convertSegmentsToSRT(segments, "original"))}>Download SRT</Button>
            </div>
          </div>
          <TranscriptViewer segments={segments} mode="original" />
        </PanelCard>
      ) : (
        <TranslationPanel project={project} translations={translations} onTranslated={onTranslationSaved} />
      )}
    </div>
  );
}


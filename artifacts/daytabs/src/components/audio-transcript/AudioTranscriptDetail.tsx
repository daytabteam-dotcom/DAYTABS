import React, { useMemo } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { AudioTranscriptProject } from "./types";
import { TranscriptViewer } from "./TranscriptViewer";
import { parseSegments, convertSegmentsToSRT } from "./utils";

export function AudioTranscriptDetail({
  project,
  onBack,
}: {
  project: AudioTranscriptProject;
  onBack: () => void;
}) {
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

      </PanelCard>

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
            <Button variant="outline" onClick={() => download(`${project.title}.srt`, convertSegmentsToSRT(segments))}>Download SRT</Button>
          </div>
        </div>
        <TranscriptViewer segments={segments} />
      </PanelCard>
    </div>
  );
}

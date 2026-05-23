import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { AudioTranscriptProject, AudioTranslation } from "./types";
import { LanguageSelector, TARGET_LANG_OPTIONS } from "./LanguageSelector";
import { parseTranslatedSegments, convertSegmentsToSRT } from "./utils";
import { translateTranscript } from "./audioTranscriptApi";
import { TranscriptViewer } from "./TranscriptViewer";

export function TranslationPanel({
  project,
  translations,
  onTranslated,
}: {
  project: AudioTranscriptProject;
  translations: AudioTranslation[];
  onTranslated: (t: AudioTranslation) => void;
}) {
  const [target, setTarget] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => translations.find((t) => t.targetLanguage === target && t.status === "completed") ?? null, [translations, target]);

  async function onTranslate() {
    setLoading(true);
    setError(null);
    try {
      const res = await translateTranscript(project.id, target);
      onTranslated(res.translation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  }

  const translatedSegments = parseTranslatedSegments(selected?.translatedSegments);

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
    <PanelCard className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <PanelEyebrow>Translations</PanelEyebrow>
          <PanelTitle className="text-2xl">Translate Transcript</PanelTitle>
          <PanelSubtitle>Preserves timestamps and segment IDs.</PanelSubtitle>
        </div>
        <Button onClick={onTranslate} disabled={loading || project.status !== "completed"}>
          {loading ? "Translating…" : "Translate"}
        </Button>
      </div>

      <LanguageSelector label="Target language" value={target} onChange={setTarget} options={TARGET_LANG_OPTIONS} />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {selected ? (
        <div className="space-y-3">
          <TranscriptViewer segments={translatedSegments} mode="translated" />
          <PanelCardSoft className="p-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(selected.translatedFullText ?? "")}>Copy translated</Button>
            <Button variant="outline" onClick={() => download(`${project.title}-${target}.txt`, selected.translatedFullText ?? "")}>Download TXT</Button>
            <Button variant="outline" onClick={() => download(`${project.title}-${target}.json`, JSON.stringify(selected.translatedSegments ?? [], null, 2), "application/json")}>Download JSON</Button>
            <Button variant="outline" onClick={() => download(`${project.title}-${target}.srt`, convertSegmentsToSRT(translatedSegments, "translated"))}>Download SRT</Button>
          </PanelCardSoft>
        </div>
      ) : (
        <PanelCardSoft className="p-5 text-sm text-white/60">
          No saved translation for this language yet.
        </PanelCardSoft>
      )}
    </PanelCard>
  );
}


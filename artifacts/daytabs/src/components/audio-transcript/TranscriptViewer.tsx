import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import type { TranscriptSegment, TranslatedSegment } from "./types";

export function TranscriptViewer({
  segments,
  mode,
}: {
  segments: TranscriptSegment[] | TranslatedSegment[];
  mode: "original" | "translated";
}) {
  if (!segments.length) {
    return <PanelCardSoft className="p-5 text-sm text-white/60">No transcript segments yet.</PanelCardSoft>;
  }
  return (
    <PanelCardSoft className="p-4">
      <div className="max-h-[520px] overflow-auto space-y-3 pr-2">
        {segments.map((s: any) => (
          <div key={s.id} className="text-sm text-white/80 leading-6">
            <span className="mr-2 text-xs text-white/40 font-mono">
              [{String(s.start_time).slice(0, 8)} - {String(s.end_time).slice(0, 8)}]
            </span>
            {mode === "translated" ? s.translated_text : s.text}
          </div>
        ))}
      </div>
    </PanelCardSoft>
  );
}


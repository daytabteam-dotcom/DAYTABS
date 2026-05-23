import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import type { CineStyle } from "../types";

function chips(values: string[] | null) {
  const list = (values ?? []).slice(0, 8);
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((v) => (
        <span key={v} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/60">
          {v}
        </span>
      ))}
    </div>
  );
}

export function StylePreview({ style }: { style: CineStyle }) {
  return (
    <PanelCardSoft className="p-4">
      <div className="text-sm font-semibold text-white/90">{style.name}</div>
      {style.description ? <div className="mt-1 text-xs text-white/55">{style.description}</div> : null}
      {style.referenceImageUrl ? (
        <img src={style.referenceImageUrl} alt="Style reference" className="mt-3 aspect-video w-full rounded-xl border border-white/10 object-cover" />
      ) : null}
      <div className="mt-3 space-y-2 text-xs text-white/55">
        <div><span className="text-white/70">Style prompt:</span> {style.stylePrompt}</div>
        {style.negativePrompt ? <div><span className="text-white/70">Negative:</span> {style.negativePrompt}</div> : null}
      </div>
      <div className="mt-3 space-y-2">
        {style.colorPalette ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/35">Palette</div>
            {chips(style.colorPalette)}
          </div>
        ) : null}
        {style.moodKeywords ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/35">Mood</div>
            {chips(style.moodKeywords)}
          </div>
        ) : null}
      </div>
    </PanelCardSoft>
  );
}


import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { CineStyle } from "../types";

export function CineStyleCard({
  style,
  onEdit,
  onDelete,
  onUse,
}: {
  style: CineStyle;
  onEdit: () => void;
  onDelete: () => void;
  onUse?: () => void;
}) {
  return (
    <PanelCardSoft className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white/90">{style.name}</div>
          {style.description ? <div className="mt-1 text-xs text-white/55">{style.description}</div> : null}
        </div>
        <div className="flex gap-2">
          {onUse ? <Button size="sm" variant="outline" onClick={onUse}>Use</Button> : null}
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
        </div>
      </div>
      {style.referenceImageUrl ? (
        <img src={style.referenceImageUrl} alt="Style reference" className="mt-4 aspect-video w-full rounded-xl border border-white/10 object-cover" />
      ) : null}
      <div className="mt-4 line-clamp-3 text-xs text-white/55">
        <span className="text-white/70">Prompt:</span> {style.stylePrompt}
      </div>
    </PanelCardSoft>
  );
}


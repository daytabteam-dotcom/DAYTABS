import React from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { CineAsset } from "./types";

export function ShotImageGallery({
  assets,
  selectedAssetId,
  onSelect,
}: {
  assets: CineAsset[];
  selectedAssetId: string | null;
  onSelect: (asset: CineAsset) => void;
}) {
  const shots = assets.filter((a) => a.category === "shot");
  return (
    <PanelCard className="p-6">
      <PanelEyebrow>Shots</PanelEyebrow>
      <PanelTitle className="text-2xl">Shot Image Gallery</PanelTitle>
      <PanelSubtitle>Pick one image to convert into video.</PanelSubtitle>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shots.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">No shot images yet.</PanelCardSoft>
        ) : (
          shots.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset)}
              className={cn(
                "overflow-hidden rounded-2xl border bg-white/[0.03] p-2 text-left transition-all",
                selectedAssetId === asset.id ? "border-pink-500/40" : "border-white/10 hover:border-white/20",
              )}
            >
              <img src={asset.url} alt="Shot" className="aspect-video w-full rounded-xl object-cover" />
              <div className="mt-2 px-1 text-xs text-white/50">Select for video</div>
            </button>
          ))
        )}
      </div>
    </PanelCard>
  );
}


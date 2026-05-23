import React from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import type { CineAsset } from "./types";

export function ExportPanel({ finalVideo }: { finalVideo: CineAsset | null }) {
  return (
    <PanelCard className="p-6">
      <PanelEyebrow>Export</PanelEyebrow>
      <PanelTitle className="text-2xl">Download MP4</PanelTitle>
      <PanelSubtitle>When your video is ready, preview and download the final MP4.</PanelSubtitle>

      <div className="mt-5">
        {finalVideo ? (
          <div className="space-y-3">
            <video controls src={finalVideo.url} className="w-full rounded-2xl border border-white/10 bg-black/40" />
            <Button asChild>
              <a href={finalVideo.url} download>
                Download MP4
              </a>
            </Button>
          </div>
        ) : (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            No final video yet. Generate one in the Video step.
          </PanelCardSoft>
        )}
      </div>
    </PanelCard>
  );
}


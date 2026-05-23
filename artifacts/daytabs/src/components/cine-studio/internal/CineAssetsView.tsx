import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { listCineAssets } from "../cineStudioApi";
import type { CineAsset } from "../types";

export function CineAssetsView({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const [assets, setAssets] = useState<CineAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCineAssets(60);
      setAssets(res.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const sorted = useMemo(() => {
    return [...assets];
  }, [assets]);

  return (
    <PanelCard className="p-6">
      <PanelHeader className="justify-between gap-4">
        <div className="space-y-1">
          <PanelEyebrow>CineStudio</PanelEyebrow>
          <PanelTitle className="text-2xl">Assets</PanelTitle>
          <PanelSubtitle>Recent images and videos across all projects.</PanelSubtitle>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
      </PanelHeader>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            {loading ? "Loading assets…" : "No assets yet. Generate a sheet, angle, scene, shot, or video."}
          </PanelCardSoft>
        ) : (
          sorted.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpenProject(a.projectId)}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-left transition-all hover:bg-white/[0.05]"
            >
              {a.type === "video" ? (
                <video src={a.url} controls className="w-full rounded-xl border border-white/10 bg-black/40" />
              ) : (
                <img src={a.url} alt={a.category} className="aspect-video w-full rounded-xl object-cover" />
              )}
              <div className="mt-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs text-white/60">{a.category}</div>
                <div className="text-[11px] text-white/35">Open project</div>
              </div>
            </button>
          ))
        )}
      </div>
    </PanelCard>
  );
}


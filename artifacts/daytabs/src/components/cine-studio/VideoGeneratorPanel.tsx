import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCostBadge } from "./CreditCostBadge";
import { generateVideoFromImage, getCineJobStatus } from "./cineStudioApi";
import type { CineAsset, CineJob, CineStylePreset, CineVideoSettings } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

function creditCost(settings: CineVideoSettings) {
  if (settings.duration === "5s" && settings.quality === "fast") return 15;
  if (settings.duration === "10s" && settings.quality === "standard") return 30;
  if (settings.duration === "15s" && settings.quality === "HD") return 60;
  return 30;
}

export function VideoGeneratorPanel({
  projectId,
  imageAsset,
  onVideoAsset,
}: {
  projectId: string;
  imageAsset: CineAsset | null;
  onVideoAsset: (asset: CineAsset) => void;
}) {
  const [settings, setSettings] = useState<CineVideoSettings>({
    duration: "5s",
    quality: "fast",
    aspectRatio: "16:9",
    cameraMotion: "static",
    customMotionPrompt: "",
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<CineJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<StyleSelection>({ kind: "builtin", styleId: null, stylePreset: "Hollywood Realism" });

  const cost = useMemo(() => creditCost(settings), [settings]);

  useEffect(() => {
    if (!imageAsset) return;
    if (imageAsset.styleId) {
      setStyle((prev) => ({ ...prev, kind: "user", styleId: imageAsset.styleId! }));
    }
  }, [imageAsset?.id]);

  async function onGenerate() {
    if (!imageAsset) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateVideoFromImage({
        project_id: projectId,
        asset_id: imageAsset.id,
        image_url: imageAsset.url,
        duration: settings.duration,
        quality: settings.quality,
        aspect_ratio: settings.aspectRatio,
        camera_motion: settings.cameraMotion,
        custom_motion_prompt: settings.customMotionPrompt?.trim() || undefined,
        style_id: style.kind === "user" ? style.styleId : null,
        style_preset: style.stylePreset as CineStylePreset,
      });
      setJobId(res.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start video");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await getCineJobStatus(jobId);
        if (cancelled) return;
        setJob(res.job);
        if (res.asset) {
          onVideoAsset(res.asset);
          window.clearInterval(interval);
        }
        if (res.job.status === "failed" || res.job.status === "completed") {
          window.clearInterval(interval);
        }
      } catch {
        // ignore transient
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, onVideoAsset]);

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Video</PanelEyebrow>
          <PanelTitle className="text-2xl">Generate Video</PanelTitle>
          <PanelSubtitle>Seedance animates your selected shot image with subtle cinematic motion.</PanelSubtitle>
        </div>
        <div className="flex items-center gap-2">
          <CreditCostBadge cost={cost} />
          <Button onClick={onGenerate} disabled={loading || !imageAsset}>
            {loading ? "Starting…" : "Generate Video"}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50">Duration</label>
              <select value={settings.duration} onChange={(e) => setSettings((s) => ({ ...s, duration: e.target.value as any }))} className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
                <option value="5s">5s</option>
                <option value="10s">10s</option>
                <option value="15s">15s</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50">Quality</label>
              <select value={settings.quality} onChange={(e) => setSettings((s) => ({ ...s, quality: e.target.value as any }))} className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
                <option value="fast">fast</option>
                <option value="standard">standard</option>
                <option value="HD">HD</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50">Aspect ratio</label>
              <select value={settings.aspectRatio} onChange={(e) => setSettings((s) => ({ ...s, aspectRatio: e.target.value as any }))} className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50">Camera motion</label>
              <select value={settings.cameraMotion} onChange={(e) => setSettings((s) => ({ ...s, cameraMotion: e.target.value as any }))} className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
                <option value="static">static</option>
                <option value="slow zoom in">slow zoom in</option>
                <option value="slow zoom out">slow zoom out</option>
                <option value="slow pan left">slow pan left</option>
                <option value="slow pan right">slow pan right</option>
                <option value="dolly in">dolly in</option>
                <option value="handheld subtle">handheld subtle</option>
              </select>
            </div>
          </div>
          <label className="block text-xs text-white/50">Custom motion prompt (optional)</label>
          <Input value={settings.customMotionPrompt ?? ""} onChange={(e) => setSettings((s) => ({ ...s, customMotionPrompt: e.target.value }))} placeholder="Optional: override subtle motion prompt…" className="panel-input" />
          <StyleSelector value={style} onChange={setStyle} label="Style" helper="Preserves visual continuity during motion (no re-styling)." />
        </div>

        <div>
          {imageAsset ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <img src={imageAsset.url} alt="Selected for video" className="aspect-video w-full rounded-xl object-cover" />
              <div className="mt-2 px-1 text-xs text-white/50">Selected shot image</div>
            </div>
          ) : (
            <PanelCardSoft className="p-5 text-sm text-white/60">Select a shot image first.</PanelCardSoft>
          )}
        </div>
      </div>

      {job ? (
        <div className="mt-5 text-sm text-white/65">
          Status: <span className="text-white/85 font-semibold">{job.status}</span>
          {job.errorMessage ? <span className="ml-2 text-red-300">{job.errorMessage}</span> : null}
        </div>
      ) : null}
    </PanelCard>
  );
}

import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { generateShotImage, generateShotList } from "./cineStudioApi";
import { CreditCostBadge } from "./CreditCostBadge";
import type { CineAsset, CineCharacter, CineShot, CineStylePreset } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

export function ShotListGenerator({
  projectId,
  character,
  sceneDescription,
  assets,
  onShots,
  onAssetsAdded,
}: {
  projectId: string;
  character: CineCharacter;
  sceneDescription: string;
  assets: CineAsset[];
  onShots: (shots: CineShot[]) => void;
  onAssetsAdded: (assets: CineAsset[]) => void;
}) {
  const [loadingList, setLoadingList] = useState(false);
  const [loadingShot, setLoadingShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [shots, setShots] = useState<CineShot[]>([]);
  const [style, setStyle] = useState<StyleSelection>(() => {
    const preset = (character.stylePreset as CineStylePreset) ?? "Hollywood Realism";
    return character.styleId
      ? { kind: "user", styleId: character.styleId, stylePreset: preset }
      : { kind: "builtin", styleId: null, stylePreset: preset };
  });

  const shotAssets = useMemo(() => assets.filter((a) => a.category === "shot"), [assets]);

  async function onGenerateList() {
    setLoadingList(true);
    setError(null);
    try {
      const res = await generateShotList({ project_id: projectId, character_id: character.id, scene_description: sceneDescription });
      setShots(res.shots);
      onShots(res.shots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate shot list");
    } finally {
      setLoadingList(false);
    }
  }

  async function onGenerateImage(shot: CineShot) {
    setLoadingShot(shot.title);
    setError(null);
    try {
      const res = await generateShotImage({
        project_id: projectId,
        character_id: character.id,
        shot_prompt: shot.image_prompt,
        style_id: style.kind === "user" ? style.styleId : null,
        style_preset: style.stylePreset,
        aspect_ratio: aspectRatio,
      });
      onAssetsAdded([res.asset]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate shot image");
    } finally {
      setLoadingShot(null);
    }
  }

  return (
    <div className="space-y-4">
      <PanelCard className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <PanelEyebrow>Shots</PanelEyebrow>
            <PanelTitle className="text-2xl">Shot List</PanelTitle>
            <PanelSubtitle>Generate 5 cinematic shots, then generate images for the shots you like.</PanelSubtitle>
          </div>
          <div className="flex items-center gap-2">
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className="panel-input px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
            <Button onClick={onGenerateList} disabled={loadingList || !sceneDescription.trim()}>
              {loadingList ? "Generating…" : "Generate Shot List"}
            </Button>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {(shots.length ? shots : []).map((shot) => (
            <PanelCardSoft key={shot.title} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white/90">{shot.title}</div>
                  <div className="mt-1 text-xs text-white/55">{shot.description}</div>
                </div>
                <div className="shrink-0"><CreditCostBadge cost={3} /></div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-white/55">
                <div><span className="text-white/70">Camera:</span> {shot.camera_angle}</div>
                <div><span className="text-white/70">Emotion:</span> {shot.emotion}</div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => onGenerateImage(shot)} disabled={!!loadingShot || !character.lockedIdentity}>
                  {loadingShot === shot.title ? "Generating…" : "Generate image"}
                </Button>
              </div>
            </PanelCardSoft>
          ))}
          {shots.length === 0 ? (
            <PanelCardSoft className="p-5 text-sm text-white/60">
              Generate a shot list to begin planning cinematic coverage.
            </PanelCardSoft>
          ) : null}
        </div>

        <div className="mt-5">
          <StyleSelector value={style} onChange={setStyle} label="Style" helper="Applies to shot image generation and video continuity." />
        </div>
      </PanelCard>

      <PanelCard className="p-6">
        <PanelEyebrow>Shot images</PanelEyebrow>
        <PanelTitle className="text-2xl">Generated Shots</PanelTitle>
        <PanelSubtitle>Select one to animate in the Video step.</PanelSubtitle>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shotAssets.length === 0 ? (
            <PanelCardSoft className="p-5 text-sm text-white/60">No shot images yet.</PanelCardSoft>
          ) : (
            shotAssets.slice(0, 12).map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                <img src={asset.url} alt="Shot" className="aspect-video w-full rounded-xl object-cover" />
                <div className="mt-2 px-1 text-xs text-white/50">Shot</div>
              </div>
            ))
          )}
        </div>
      </PanelCard>
    </div>
  );
}

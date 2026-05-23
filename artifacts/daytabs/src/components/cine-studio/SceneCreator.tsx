import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CreditCostBadge } from "./CreditCostBadge";
import { createScene } from "./cineStudioApi";
import type { CineAsset, CineCharacter, CineStylePreset } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

export function SceneCreator({
  projectId,
  character,
  assets,
  onAssetsAdded,
}: {
  projectId: string;
  character: CineCharacter;
  assets: CineAsset[];
  onAssetsAdded: (assets: CineAsset[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneDescription, setSceneDescription] = useState("");
  const [location, setLocation] = useState("");
  const [mood, setMood] = useState("tense but grounded");
  const [lighting, setLighting] = useState("cinematic practical lighting");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [style, setStyle] = useState<StyleSelection>(() => {
    const preset = (character.stylePreset as CineStylePreset) ?? "Hollywood Realism";
    return character.styleId
      ? { kind: "user", styleId: character.styleId, stylePreset: preset }
      : { kind: "builtin", styleId: null, stylePreset: preset };
  });

  const sceneAsset = useMemo(() => assets.find((a) => a.category === "scene"), [assets]);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      const combined = [
        sceneDescription.trim(),
        location.trim() ? `Location: ${location.trim()}` : "",
        mood.trim() ? `Mood: ${mood.trim()}` : "",
        lighting.trim() ? `Lighting: ${lighting.trim()}` : "",
      ].filter(Boolean).join("\n");

      const res = await createScene({
        project_id: projectId,
        character_id: character.id,
        scene_description: combined,
        style_preset: style.stylePreset as CineStylePreset,
        style_id: style.kind === "user" ? style.styleId : null,
        aspect_ratio: aspectRatio,
      });
      onAssetsAdded([res.asset]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scene");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Scene</PanelEyebrow>
          <PanelTitle className="text-2xl">Create Cinematic Scene</PanelTitle>
          <PanelSubtitle>OpenAI polishes the prompt. Gemini generates the scene image using your locked character reference.</PanelSubtitle>
        </div>
        <div className="flex items-center gap-2">
          <CreditCostBadge cost={3} />
          <Button onClick={onGenerate} disabled={loading || !character.lockedIdentity || !sceneDescription.trim()}>
            {loading ? "Generating…" : "Generate Scene Image"}
          </Button>
        </div>
      </div>

      {!character.lockedIdentity ? (
        <PanelCardSoft className="mt-5 p-5 text-sm text-white/60">
          Lock character identity first to preserve face and outfit across the scene and shots.
        </PanelCardSoft>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Scene description</label>
          <Textarea value={sceneDescription} onChange={(e) => setSceneDescription(e.target.value)} placeholder="Describe the moment (storytelling-focused)…" className="panel-input min-h-[120px]" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., rainy alley" className="panel-input" />
            </div>
            <div>
              <label className="block text-xs text-white/50">Mood</label>
              <Input value={mood} onChange={(e) => setMood(e.target.value)} className="panel-input" />
            </div>
          </div>
          <label className="block text-xs text-white/50">Lighting</label>
          <Input value={lighting} onChange={(e) => setLighting(e.target.value)} className="panel-input" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50">Aspect ratio</label>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
            <div>
              <StyleSelector value={style} onChange={setStyle} label="Style" />
            </div>
          </div>
        </div>
        <div>
          {sceneAsset ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <img src={sceneAsset.url} alt="Scene" className="aspect-video w-full rounded-xl object-cover" />
              <div className="mt-2 px-1 text-xs text-white/50">Latest scene image</div>
            </div>
          ) : (
            <PanelCardSoft className="h-full p-5 text-sm text-white/60">
              Scene image will appear here.
            </PanelCardSoft>
          )}
        </div>
      </div>
    </PanelCard>
  );
}

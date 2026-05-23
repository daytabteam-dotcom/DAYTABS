import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditCostBadge } from "./CreditCostBadge";
import { generateCharacterAngle, lockCharacter, setCharacterStyle } from "./cineStudioApi";
import type { CineAngle, CineAsset, CineCharacter, CineStylePreset } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

const ANGLES: Array<{ label: string; value: CineAngle }> = [
  { label: "Front", value: "front view" },
  { label: "Side", value: "side view" },
  { label: "3/4 Left", value: "3/4 left" },
  { label: "3/4 Right", value: "3/4 right" },
  { label: "Back", value: "back view" },
  { label: "Full Body", value: "full body" },
  { label: "Face Close-Up", value: "face close-up" },
  { label: "Over Shoulder", value: "over-the-shoulder" },
];

export function CharacterAngleGallery({
  character,
  assets,
  onAssetsAdded,
  onCharacterUpdated,
}: {
  character: CineCharacter;
  assets: CineAsset[];
  onAssetsAdded: (assets: CineAsset[]) => void;
  onCharacterUpdated: (character: CineCharacter) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [style, setStyle] = useState<StyleSelection>(() => {
    const preset = (character.stylePreset as CineStylePreset) ?? "Hollywood Realism";
    return character.styleId
      ? { kind: "user", styleId: character.styleId, stylePreset: preset }
      : { kind: "builtin", styleId: null, stylePreset: preset };
  });

  const angleAssets = useMemo(() => assets.filter((a) => a.category === "angle"), [assets]);

  async function onGenerate(angle: CineAngle) {
    if (!character.referenceImageUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateCharacterAngle(character.id, {
        reference_image_url: character.referenceImageUrl,
        angle,
        aspect_ratio: aspectRatio,
        style_id: style.kind === "user" ? style.styleId : null,
        style_preset: style.stylePreset,
      });
      onAssetsAdded([res.asset]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate angle");
    } finally {
      setLoading(false);
    }
  }

  async function onUseAsReference(url: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await lockCharacter(character.id, url);
      onCharacterUpdated(res.character);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set reference");
    } finally {
      setLoading(false);
    }
  }

  async function onStyleChange(next: StyleSelection) {
    setStyle(next);
    const styleId = next.kind === "user" ? next.styleId : null;
    try {
      const res = await setCharacterStyle(character.id, styleId);
      onCharacterUpdated(res.character);
    } catch {
      // ignore
    }
  }

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Angles</PanelEyebrow>
          <PanelTitle className="text-2xl">Character Angles</PanelTitle>
          <PanelSubtitle>Generate angles that preserve the locked identity.</PanelSubtitle>
        </div>
        <div className="flex items-center gap-2">
          <CreditCostBadge cost={2} />
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className="panel-input px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </div>
      </div>

      {!character.lockedIdentity ? (
        <PanelCardSoft className="mt-5 p-5 text-sm text-white/60">
          Lock character identity first (select a sheet image and lock it).
        </PanelCardSoft>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {ANGLES.map((a) => (
          <Button
            key={a.value}
            variant="outline"
            onClick={() => onGenerate(a.value)}
            disabled={loading || !character.lockedIdentity || !character.referenceImageUrl}
            className="border-white/12"
          >
            {a.label}
          </Button>
        ))}
      </div>

      <div className="mt-5">
        <StyleSelector value={style} onChange={onStyleChange} label="Style" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {angleAssets.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            Generate a few angles to help the model stay consistent across scenes and shots.
          </PanelCardSoft>
        ) : (
          angleAssets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <img src={asset.url} alt="Angle" className="aspect-video w-full rounded-xl object-cover" />
              <div className="mt-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs text-white/60">{String(asset.metadata?.angle ?? "angle")}</div>
                <button
                  type="button"
                  onClick={() => onUseAsReference(asset.url)}
                  className={cn("text-xs font-semibold", character.referenceImageUrl === asset.url ? "text-pink-200" : "text-white/60 hover:text-white")}
                >
                  {character.referenceImageUrl === asset.url ? "Reference" : "Use as reference"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}

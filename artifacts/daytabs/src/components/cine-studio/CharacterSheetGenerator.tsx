import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditCostBadge } from "./CreditCostBadge";
import { generateCharacterSheet, lockCharacter, setCharacterStyle } from "./cineStudioApi";
import type { CineAsset, CineCharacter, CineStylePreset } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

export function CharacterSheetGenerator({
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
  const [selectedRef, setSelectedRef] = useState<string | null>(character.referenceImageUrl ?? null);
  const [style, setStyle] = useState<StyleSelection>(() => {
    const preset = (character.stylePreset as CineStylePreset) ?? "Hollywood Realism";
    return character.styleId
      ? { kind: "user", styleId: character.styleId, stylePreset: preset }
      : { kind: "builtin", styleId: null, stylePreset: preset };
  });

  const sheetAssets = useMemo(() => assets.filter((a) => a.category === "character_sheet"), [assets]);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateCharacterSheet(character.id, {
        aspect_ratio: aspectRatio,
        style_id: style.kind === "user" ? style.styleId : null,
        style_preset: style.stylePreset,
      });
      onAssetsAdded(res.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate sheet");
    } finally {
      setLoading(false);
    }
  }

  async function onLock() {
    if (!selectedRef) return;
    setLoading(true);
    setError(null);
    try {
      const res = await lockCharacter(character.id, selectedRef);
      onCharacterUpdated(res.character);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock identity");
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
      // keep UI responsive; generation calls will still fail if mismatched
    }
  }

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Character sheet</PanelEyebrow>
          <PanelTitle className="text-2xl">Generate Sheet</PanelTitle>
          <PanelSubtitle>Pick the best reference image, then lock the identity for angles and shots.</PanelSubtitle>
        </div>
        <div className="flex items-center gap-2">
          <CreditCostBadge cost={5} />
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className="panel-input px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
          <Button onClick={onGenerate} disabled={loading || !character.identityPrompt}>{loading ? "Generating…" : "Generate"}</Button>
        </div>
      </div>

      <div className="mt-4">
        <StyleSelector value={style} onChange={onStyleChange} label="Style" />
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sheetAssets.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            {character.identityPrompt ? "Generate a sheet to begin locking identity." : "Create identity prompt first."}
          </PanelCardSoft>
        ) : (
          sheetAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelectedRef(asset.url)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-2 text-left transition-all",
                selectedRef === asset.url ? "border-pink-500/40" : "border-white/10 hover:border-white/20",
              )}
            >
              <img src={asset.url} alt="Character sheet view" className="aspect-video w-full rounded-xl object-cover" />
              <div className="mt-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs text-white/60">{String(asset.metadata?.view ?? "view")}</div>
                {selectedRef === asset.url ? <span className="text-xs font-semibold text-pink-200">Selected</span> : null}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-white/50">
          {character.lockedIdentity ? "Identity locked. You can now generate angles and shots." : "Select a reference image and lock identity."}
        </div>
        <Button variant={character.lockedIdentity ? "secondary" : "default"} onClick={onLock} disabled={loading || !selectedRef}>
          {character.lockedIdentity ? "Identity Locked" : "Lock Character Identity"}
        </Button>
      </div>
    </PanelCard>
  );
}

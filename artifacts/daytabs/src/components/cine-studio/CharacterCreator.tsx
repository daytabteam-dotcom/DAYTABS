import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCineCharacter, generateCharacterIdentity } from "./cineStudioApi";
import type { CineCharacter, CineStylePreset } from "./types";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

export function CharacterCreator({
  projectId,
  onCreated,
  initialStyle,
}: {
  projectId: string;
  onCreated: (character: CineCharacter) => void;
  initialStyle?: StyleSelection;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [age, setAge] = useState("");
  const [genderPresentation, setGenderPresentation] = useState("");
  const [outfit, setOutfit] = useState("");
  const [personality, setPersonality] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [realismLevel, setRealismLevel] = useState("cinematic realism");
  const [negativeNotes, setNegativeNotes] = useState("distorted hands, face morphing, plastic skin, over-smoothing");
  const [style, setStyle] = useState<StyleSelection>(initialStyle ?? { kind: "builtin", styleId: null, stylePreset: "Hollywood Realism" });

  const basePrompt = useMemo(() => {
    const parts = [
      shortDescription && `Short description: ${shortDescription}`,
      age && `Age: ${age}`,
      genderPresentation && `Gender/presentation: ${genderPresentation}`,
      outfit && `Outfit: ${outfit}`,
      personality && `Personality: ${personality}`,
      visualStyle && `Visual style: ${visualStyle}`,
      realismLevel && `Realism: ${realismLevel}`,
      negativeNotes && `Negative: ${negativeNotes}`,
    ].filter(Boolean);
    return parts.join("\n");
  }, [shortDescription, age, genderPresentation, outfit, personality, visualStyle, realismLevel, negativeNotes]);

  async function onCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createCineCharacter({
        project_id: projectId,
        name: name.trim(),
        base_prompt: basePrompt || name.trim(),
        style_preset: style.stylePreset as CineStylePreset,
        style_id: style.kind === "user" ? style.styleId : null,
      });
      const character = created.character;
      const identity = await generateCharacterIdentity(character.id, {
        name: name.trim(),
        age,
        gender_presentation: genderPresentation,
        outfit,
        personality,
        visual_style: visualStyle,
        realism_level: realismLevel,
        extra_notes: shortDescription,
        negative_notes: negativeNotes,
      });
      onCreated(identity.character);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create character");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <PanelCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <PanelEyebrow>Character</PanelEyebrow>
            <PanelTitle className="text-2xl">Create Character</PanelTitle>
            <PanelSubtitle>Define identity once, then generate consistent sheets, angles, and shots.</PanelSubtitle>
          </div>
          <Button onClick={onCreate} disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create Character"}
          </Button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs text-white/50">Character name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Nora — Night Journalist" className="panel-input" />
            <label className="block text-xs text-white/50">Short description</label>
            <Textarea value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="A grounded protagonist for a YouTube crime story…" className="panel-input min-h-[88px]" />
          </div>
          <div className="space-y-3">
            <StyleSelector
              value={style}
              onChange={setStyle}
              label="Style"
              helper="Pick a built-in cinematic preset or one of your saved styles."
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50">Age</label>
                <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g., 28" className="panel-input" />
              </div>
              <div>
                <label className="block text-xs text-white/50">Gender/presentation</label>
                <Input value={genderPresentation} onChange={(e) => setGenderPresentation(e.target.value)} placeholder="e.g., feminine" className="panel-input" />
              </div>
            </div>
            <label className="block text-xs text-white/50">Outfit</label>
            <Input value={outfit} onChange={(e) => setOutfit(e.target.value)} placeholder="e.g., trench coat, black boots" className="panel-input" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs text-white/50">Personality</label>
            <Input value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="e.g., calm, analytical, empathetic" className="panel-input" />
            <label className="block text-xs text-white/50">Visual style</label>
            <Input value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder="e.g., cinematic noir realism" className="panel-input" />
          </div>
          <div className="space-y-3">
            <label className="block text-xs text-white/50">Realism level</label>
            <Input value={realismLevel} onChange={(e) => setRealismLevel(e.target.value)} placeholder="cinematic realism" className="panel-input" />
            <label className="block text-xs text-white/50">Negative notes</label>
            <Input value={negativeNotes} onChange={(e) => setNegativeNotes(e.target.value)} placeholder="what to avoid" className="panel-input" />
          </div>
        </div>
      </PanelCard>
      <PanelCardSoft className="p-5 text-xs text-white/55">
        Identity prompt is generated with OpenAI for consistency planning. Images/videos are generated with Gemini + Seedance only.
      </PanelCardSoft>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCineStyle, createStyleFromDescription, createStyleFromReference } from "../cineStudioApi";
import type { CineStyle } from "../types";

function splitCsv(raw: string) {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function CineStyleCreator({ onCreated }: { onCreated: (style: CineStyle) => void }) {
  const [mode, setMode] = useState<"manual" | "planner" | "reference">("manual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [colors, setColors] = useState("");
  const [mood, setMood] = useState("");
  const [texture, setTexture] = useState("");
  const [lighting, setLighting] = useState("");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (mode === "manual") return !!stylePrompt.trim();
    if (mode === "reference") return !!referenceImageUrl.trim();
    return true;
  }, [name, mode, stylePrompt, referenceImageUrl]);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === "manual") {
        const res = await createCineStyle({
          name: name.trim(),
          description: description.trim() || undefined,
          style_prompt: stylePrompt.trim(),
          negative_prompt: negativePrompt.trim() || undefined,
          color_palette: splitCsv(colors),
          mood_keywords: splitCsv(mood),
          texture_keywords: splitCsv(texture),
          lighting_keywords: splitCsv(lighting),
          reference_image_url: referenceImageUrl.trim() || undefined,
        });
        onCreated(res.style);
        setStylePrompt("");
        setNegativePrompt("");
        setReferenceImageUrl("");
        return;
      }

      if (mode === "reference") {
        const res = await createStyleFromReference({
          name: name.trim(),
          description: description.trim() || undefined,
          reference_image_url: referenceImageUrl.trim(),
        });
        onCreated(res.style);
        setReferenceImageUrl("");
        return;
      }

      const res = await createStyleFromDescription({
        name: name.trim(),
        description: description.trim() || undefined,
        colors: splitCsv(colors),
        mood: splitCsv(mood),
        texture: splitCsv(texture),
        lighting: splitCsv(lighting),
        negative_notes: negativePrompt.trim() || undefined,
      });
      onCreated(res.style);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create style");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Styles</PanelEyebrow>
          <PanelTitle className="text-2xl">Create Style</PanelTitle>
          <PanelSubtitle>Save reusable visual styles and apply them across all CineStudio projects.</PanelSubtitle>
        </div>
        <div className="flex items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="panel-input px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80">
            <option value="manual">Manual</option>
            <option value="planner">From description (AI)</option>
            <option value="reference">From reference image (AI)</option>
          </select>
          <Button onClick={onSubmit} disabled={loading || !canSubmit}>
            {loading ? "Saving…" : "Save Style"}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Style name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Oil Color Cartoon Mood" className="panel-input" />
          <label className="block text-xs text-white/50">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short explanation for future you…" className="panel-input min-h-[88px]" />
          <label className="block text-xs text-white/50">Reference image URL (optional)</label>
          <Input value={referenceImageUrl} onChange={(e) => setReferenceImageUrl(e.target.value)} placeholder="https://..." className="panel-input" />
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Main colors (comma-separated)</label>
          <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="orange, purple, warm neutrals" className="panel-input" />
          <label className="block text-xs text-white/50">Mood</label>
          <Input value={mood} onChange={(e) => setMood(e.target.value)} placeholder="dreamy, emotional, warm" className="panel-input" />
          <label className="block text-xs text-white/50">Texture</label>
          <Input value={texture} onChange={(e) => setTexture(e.target.value)} placeholder="brush texture, imperfect hand-painted look" className="panel-input" />
          <label className="block text-xs text-white/50">Lighting</label>
          <Input value={lighting} onChange={(e) => setLighting(e.target.value)} placeholder="soft dreamy lighting, practicals" className="panel-input" />
        </div>
      </div>

      {mode === "manual" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs text-white/50">Style prompt</label>
            <Textarea value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} placeholder="oil color painting style, cartoonish but cinematic, ..." className="panel-input min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-white/50">Negative prompt</label>
            <Textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="photorealistic, plastic skin, ..." className="panel-input min-h-[120px]" />
          </div>
        </div>
      ) : (
        <PanelCardSoft className="mt-4 p-4 text-xs text-white/55">
          {mode === "planner"
            ? "AI will convert your description, palette, mood, texture, and lighting into a reusable style prompt."
            : "AI will analyze the reference image URL and create a reusable style prompt (no characters, style only)."}
        </PanelCardSoft>
      )}
    </PanelCard>
  );
}


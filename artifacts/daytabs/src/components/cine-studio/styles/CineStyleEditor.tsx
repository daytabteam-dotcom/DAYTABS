import React, { useState } from "react";
import { PanelCard, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCineStyle } from "../cineStudioApi";
import type { CineStyle } from "../types";

export function CineStyleEditor({
  style,
  onSaved,
  onClose,
}: {
  style: CineStyle;
  onSaved: (style: CineStyle) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description ?? "");
  const [stylePrompt, setStylePrompt] = useState(style.stylePrompt);
  const [negativePrompt, setNegativePrompt] = useState(style.negativePrompt ?? "");
  const [referenceImageUrl, setReferenceImageUrl] = useState(style.referenceImageUrl ?? "");

  async function onSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await updateCineStyle(style.id, {
        name: name.trim(),
        description: description.trim(),
        style_prompt: stylePrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        reference_image_url: referenceImageUrl.trim(),
      });
      onSaved(res.style);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update style");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PanelCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <PanelEyebrow>Edit style</PanelEyebrow>
          <PanelTitle className="text-2xl">{style.name}</PanelTitle>
          <PanelSubtitle>Update your reusable style prompt and preview reference.</PanelSubtitle>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={loading || !name.trim() || !stylePrompt.trim()}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="panel-input" />
          <label className="block text-xs text-white/50">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="panel-input min-h-[90px]" />
          <label className="block text-xs text-white/50">Reference image URL</label>
          <Input value={referenceImageUrl} onChange={(e) => setReferenceImageUrl(e.target.value)} className="panel-input" />
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Style prompt</label>
          <Textarea value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} className="panel-input min-h-[140px]" />
          <label className="block text-xs text-white/50">Negative prompt</label>
          <Textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} className="panel-input min-h-[100px]" />
        </div>
      </div>
    </PanelCard>
  );
}


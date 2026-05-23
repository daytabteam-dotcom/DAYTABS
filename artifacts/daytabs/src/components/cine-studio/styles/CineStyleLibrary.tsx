import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { deleteCineStyle, listCineStyles } from "../cineStudioApi";
import type { CineStyle } from "../types";
import { CineStyleCard } from "./CineStyleCard";
import { CineStyleCreator } from "./CineStyleCreator";
import { CineStyleEditor } from "./CineStyleEditor";
import { StylePreview } from "./StylePreview";

export function CineStyleLibrary() {
  const [styles, setStyles] = useState<CineStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<CineStyle | null>(null);
  const [editing, setEditing] = useState<CineStyle | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCineStyles();
      setStyles(res.styles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load styles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const sorted = useMemo(() => {
    return [...styles].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [styles]);

  async function onDelete(style: CineStyle) {
    if (!confirm(`Delete style "${style.name}"?`)) return;
    try {
      await deleteCineStyle(style.id);
      setActiveStyle((cur) => (cur?.id === style.id ? null : cur));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete style");
    }
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <CineStyleEditor
          style={editing}
          onSaved={(updated) => {
            setStyles((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setActiveStyle(updated);
          }}
          onClose={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CineStyleCreator
        onCreated={(style) => {
          setStyles((prev) => [style, ...prev]);
          setActiveStyle(style);
        }}
      />

      <PanelCard className="p-6">
        <PanelHeader className="justify-between gap-4">
          <div className="space-y-1">
            <PanelEyebrow>Library</PanelEyebrow>
            <PanelTitle className="text-2xl">Saved Styles</PanelTitle>
            <PanelSubtitle>Reuse styles across all projects and keep visuals consistent.</PanelSubtitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
          </div>
        </PanelHeader>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            {sorted.length === 0 ? (
              <PanelCardSoft className="p-5 text-sm text-white/60">
                {loading ? "Loading styles…" : "No saved styles yet. Create one to reuse style consistency."}
              </PanelCardSoft>
            ) : (
              sorted.map((s) => (
                <div key={s.id} onClick={() => setActiveStyle(s)} className="cursor-pointer">
                  <CineStyleCard
                    style={s}
                    onEdit={() => setEditing(s)}
                    onDelete={() => onDelete(s)}
                  />
                </div>
              ))
            )}
          </div>
          <div className="space-y-3">
            {activeStyle ? (
              <>
                <StylePreview style={activeStyle} />
                <Button variant="outline" onClick={() => setEditing(activeStyle)}>Edit</Button>
              </>
            ) : (
              <PanelCardSoft className="p-5 text-sm text-white/60">Select a style to preview it.</PanelCardSoft>
            )}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}


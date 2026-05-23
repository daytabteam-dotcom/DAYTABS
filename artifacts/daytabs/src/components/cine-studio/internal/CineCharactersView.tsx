import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { listCineCharacters } from "../cineStudioApi";
import type { CineCharacter } from "../types";

export function CineCharactersView({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const [characters, setCharacters] = useState<CineCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCineCharacters();
      setCharacters(res.characters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load characters");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const sorted = useMemo(() => {
    return [...characters].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [characters]);

  return (
    <PanelCard className="p-6">
      <PanelHeader className="justify-between gap-4">
        <div className="space-y-1">
          <PanelEyebrow>CineStudio</PanelEyebrow>
          <PanelTitle className="text-2xl">Characters</PanelTitle>
          <PanelSubtitle>All characters across your CineStudio projects.</PanelSubtitle>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
      </PanelHeader>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sorted.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            {loading ? "Loading characters…" : "No characters yet. Create one inside a project."}
          </PanelCardSoft>
        ) : (
          sorted.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpenProject(c.projectId)}
              className="panel-hover text-left rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05]"
            >
              <div className="text-sm font-semibold text-white/90">{c.name}</div>
              <div className="mt-1 text-xs text-white/55">
                {c.lockedIdentity ? "Identity locked" : "Identity not locked"} · {c.stylePreset}
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/35">Open project</div>
            </button>
          ))
        )}
      </div>
    </PanelCard>
  );
}


import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createCineProject, listCineProjects } from "./cineStudioApi";
import type { CineProject } from "./types";

export function CineProjectList({
  activeProjectId,
  onSelect,
}: {
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const [projects, setProjects] = useState<CineProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [projects]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCineProjects();
      setProjects(res.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    const value = title.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createCineProject({ title: value });
      setTitle("");
      await refresh();
      onSelect(res.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <PanelCard className="p-6">
      <PanelHeader className="justify-between gap-4">
        <div className="space-y-1">
          <PanelEyebrow>CineStudio</PanelEyebrow>
          <PanelTitle className="text-2xl">Projects</PanelTitle>
          <PanelSubtitle>Create your first cinematic AI character and turn it into a video.</PanelSubtitle>
        </div>
        <div className="flex w-full max-w-md gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New CineStudio Project title" className="panel-input" />
          <Button onClick={onCreate} disabled={loading || !title.trim()}>New</Button>
        </div>
      </PanelHeader>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sorted.length === 0 ? (
          <PanelCardSoft className="p-5 text-sm text-white/60">
            {loading ? "Loading projects…" : "No projects yet. Create one to start your pipeline."}
          </PanelCardSoft>
        ) : (
          sorted.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "panel-hover text-left rounded-2xl border p-5 transition-all",
                activeProjectId === p.id
                  ? "border-pink-500/30 bg-pink-500/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
              )}
              onClick={() => onSelect(p.id)}
            >
              <div className="text-sm font-semibold text-white/90">{p.title}</div>
              {p.description ? <div className="mt-1 text-xs text-white/50">{p.description}</div> : null}
              <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/35">Open pipeline</div>
            </button>
          ))
        )}
      </div>
    </PanelCard>
  );
}


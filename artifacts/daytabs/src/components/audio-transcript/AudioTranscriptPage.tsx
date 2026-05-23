import React, { useEffect, useMemo, useState } from "react";
import { PanelPage } from "@/components/panel-system";
import { usePlan } from "@/hooks/use-plan";
import { AudioTranscriptUpgradeCard } from "./AudioTranscriptUpgradeCard";
import { AudioUploadCard } from "./AudioUploadCard";
import { AudioTranscriptList } from "./AudioTranscriptList";
import { AudioTranscriptDetail } from "./AudioTranscriptDetail";
import { deleteAudioTranscriptProject, getAudioTranscriptProjectDetail, listAudioTranscriptProjects } from "./audioTranscriptApi";
import type { AudioTranscriptProject, AudioTranslation } from "./types";

export function AudioTranscriptPage() {
  const { plan, loading } = usePlan();
  const [projects, setProjects] = useState<AudioTranscriptProject[]>([]);
  const [translationsByProject, setTranslationsByProject] = useState<Record<string, AudioTranslation[]>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<{ project: AudioTranscriptProject; translations: AudioTranslation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshList() {
    setError(null);
    try {
      const res = await listAudioTranscriptProjects();
      setProjects(res.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcripts");
    }
  }

  async function openDetail(projectId: string) {
    setError(null);
    setActiveProjectId(projectId);
    try {
      const res = await getAudioTranscriptProjectDetail(projectId);
      setActiveDetail({ project: res.project, translations: res.translations ?? [] });
      setTranslationsByProject((prev) => ({ ...prev, [projectId]: res.translations ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcript");
    }
  }

  async function onDelete(projectId: string) {
    if (!confirm("Delete this transcript project?")) return;
    try {
      await deleteAudioTranscriptProject(projectId);
      setActiveProjectId(null);
      setActiveDetail(null);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  useEffect(() => {
    if (!plan?.isStudio) return;
    refreshList();
  }, [plan?.isStudio]);

  const active = useMemo(() => (activeDetail && activeProjectId === activeDetail.project.id ? activeDetail : null), [activeDetail, activeProjectId]);

  if (loading || !plan) {
    return <PanelPage className="mx-0 max-w-none py-0" />;
  }

  if (!plan.isStudio) {
    return (
      <PanelPage className="mx-0 max-w-none space-y-6 py-0">
        <AudioTranscriptUpgradeCard />
      </PanelPage>
    );
  }

  return (
    <PanelPage className="mx-0 max-w-none space-y-6 py-0">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {!active ? (
        <>
          <AudioUploadCard
            onCreated={(p) => {
              setProjects((prev) => [p, ...prev]);
              openDetail(p.id);
            }}
          />
          <AudioTranscriptList
            projects={projects}
            translationsByProject={translationsByProject}
            onOpen={openDetail}
            onDelete={onDelete}
          />
        </>
      ) : (
        <AudioTranscriptDetail
          project={active.project}
          translations={active.translations}
          onBack={() => {
            setActiveDetail(null);
            setActiveProjectId(null);
            refreshList();
          }}
          onTranslationSaved={(t) => {
            setActiveDetail((cur) => {
              if (!cur) return cur;
              const next = [...(cur.translations ?? []).filter((x) => x.id !== t.id), t];
              return { ...cur, translations: next };
            });
          }}
        />
      )}
    </PanelPage>
  );
}


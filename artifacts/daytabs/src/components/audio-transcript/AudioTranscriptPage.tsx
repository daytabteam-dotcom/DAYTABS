import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelPage, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { usePlan } from "@/hooks/use-plan";
import { AudioTranscriptUpgradeCard } from "./AudioTranscriptUpgradeCard";
import { AudioUploadCard } from "./AudioUploadCard";
import { AudioTranscriptList } from "./AudioTranscriptList";
import { AudioTranscriptDetail } from "./AudioTranscriptDetail";
import { deleteAudioTranscriptProject, getAudioTranscriptProjectDetail, listAudioTranscriptProjects } from "./audioTranscriptApi";
import type { AudioTranscriptProject } from "./types";
import { Badge } from "@/components/ui/badge";
import { Captions } from "lucide-react";

function hoursLabel(secondsTotal: number) {
  const hours = secondsTotal / 3600;
  if (hours < 1) return `${Math.round(secondsTotal / 60)} min`;
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} hr`;
}

export function AudioTranscriptPage() {
  const { plan, loading } = usePlan();
  const [projects, setProjects] = useState<AudioTranscriptProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<AudioTranscriptProject | null>(null);
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
      setActiveDetail(res.project);
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

  const active = useMemo(() => (activeDetail && activeProjectId === activeDetail.id ? activeDetail : null), [activeDetail, activeProjectId]);
  const stats = useMemo(() => {
    const transcripts = projects.length;
    const langs = new Set<string>();
    let seconds = 0;
    for (const p of projects) {
      if (p.detectedLanguage) langs.add(p.detectedLanguage);
      if (p.sourceLanguage) langs.add(p.sourceLanguage);
      const dur = Number(p.audioDurationSeconds ?? 0);
      if (Number.isFinite(dur) && dur > 0) seconds += dur;
    }
    return { transcripts, languagesUsed: langs.size, seconds };
  }, [projects]);

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
    <PanelPage className="mx-auto w-full max-w-6xl space-y-8 py-0">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {!active ? (
        <>
          <PanelCard className="p-6 md:p-8">
            <PanelHeader className="justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="panel-card-soft flex h-11 w-11 items-center justify-center">
                    <Captions className="h-5 w-5 text-pink-300" />
                  </div>
                  <div>
                    <PanelEyebrow>Studio workspace</PanelEyebrow>
                    <PanelTitle className="text-3xl">Audio 2 Transcript</PanelTitle>
                  </div>
                </div>
                <PanelSubtitle className="max-w-2xl">
                  Turn audio into accurate timestamped transcripts that are searchable and exportable.
                </PanelSubtitle>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge className="border border-white/10 bg-white/[0.04] text-white/80">
                  {stats.transcripts} transcripts
                </Badge>
                <Badge className="border border-white/10 bg-white/[0.04] text-white/80">
                  {stats.languagesUsed} languages
                </Badge>
                <Badge className="border border-white/10 bg-white/[0.04] text-white/80">
                  {hoursLabel(stats.seconds)} processed
                </Badge>
              </div>
            </PanelHeader>
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {[
                { n: "1", label: "Upload" },
                { n: "2", label: "Transcribe" },
                { n: "3", label: "Export" },
              ].map((s) => (
                <PanelCardSoft key={s.n} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/85">
                      {s.n}
                    </div>
                    <div className="text-sm font-semibold text-white/80">{s.label}</div>
                  </div>
                </PanelCardSoft>
              ))}
            </div>
          </PanelCard>
          <AudioUploadCard
            onCreated={(p) => {
              setProjects((prev) => [p, ...prev]);
              openDetail(p.id);
            }}
          />
          <AudioTranscriptList
            projects={projects}
            onOpen={openDetail}
            onDelete={onDelete}
          />
        </>
      ) : (
        <AudioTranscriptDetail
          project={active}
          onBack={() => {
            setActiveDetail(null);
            setActiveProjectId(null);
            refreshList();
          }}
        />
      )}
    </PanelPage>
  );
}

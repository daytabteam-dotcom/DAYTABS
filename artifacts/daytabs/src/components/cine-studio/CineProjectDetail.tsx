import React, { useEffect, useMemo, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import { fetchCineCredits, getCineProject, setProjectStyle } from "./cineStudioApi";
import type { CineAsset, CineCharacter, CineJob, CineProject, CineStylePreset } from "./types";
import { CharacterCreator } from "./CharacterCreator";
import { CharacterSheetGenerator } from "./CharacterSheetGenerator";
import { CharacterAngleGallery } from "./CharacterAngleGallery";
import { SceneCreator } from "./SceneCreator";
import { ShotImageGallery } from "./ShotImageGallery";
import { ShotListGenerator } from "./ShotListGenerator";
import { VideoGeneratorPanel } from "./VideoGeneratorPanel";
import { ExportPanel } from "./ExportPanel";
import { JobStatusCard } from "./JobStatusCard";
import { StyleSelector, type StyleSelection } from "./styles/StyleSelector";

type StepId = "project" | "character" | "angles" | "scene" | "shots" | "video" | "export";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "project", label: "Project" },
  { id: "character", label: "Character" },
  { id: "angles", label: "Angles" },
  { id: "scene", label: "Scene" },
  { id: "shots", label: "Shots" },
  { id: "video", label: "Video" },
  { id: "export", label: "Export" },
];

export function CineProjectDetail({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<CineProject | null>(null);
  const [characters, setCharacters] = useState<CineCharacter[]>([]);
  const [assets, setAssets] = useState<CineAsset[]>([]);
  const [jobs, setJobs] = useState<CineJob[]>([]);
  const [creditsRemaining, setCreditsRemaining] = useState<number>(0);
  const [step, setStep] = useState<StepId>("project");
  const [projectStyle, setProjectStyleState] = useState<StyleSelection>({ kind: "builtin", styleId: null, stylePreset: "Hollywood Realism" });

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedShotAssetId, setSelectedShotAssetId] = useState<string | null>(null);
  const [selectedVideoAsset, setSelectedVideoAsset] = useState<CineAsset | null>(null);

  const selectedCharacter = useMemo(() => {
    const preferred = selectedCharacterId ? characters.find((c) => c.id === selectedCharacterId) : null;
    return preferred ?? characters[0] ?? null;
  }, [characters, selectedCharacterId]);

  const sceneDescription = useMemo(() => {
    const scene = assets.find((a) => a.category === "scene");
    const raw = (scene?.metadata?.sceneDescription ?? scene?.metadata?.scene_description) as string | undefined;
    return raw ?? "";
  }, [assets]);

  const selectedShotAsset = useMemo(() => {
    if (!selectedShotAssetId) return null;
    return assets.find((a) => a.id === selectedShotAssetId) ?? null;
  }, [assets, selectedShotAssetId]);

  const finalVideo = useMemo(() => assets.find((a) => a.category === "final_video") ?? null, [assets]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await getCineProject(projectId);
      setProject(res.project);
      setCharacters(res.characters ?? []);
      setAssets(res.assets ?? []);
      setJobs(res.jobs ?? []);
      setCreditsRemaining(res.credits.remaining ?? 0);
      if (!selectedCharacterId && res.characters?.[0]?.id) setSelectedCharacterId(res.characters[0].id);
      const preset = (res.characters?.[0]?.stylePreset as CineStylePreset) ?? "Hollywood Realism";
      setProjectStyleState(
        res.project.styleId
          ? { kind: "user", styleId: res.project.styleId, stylePreset: preset }
          : { kind: "builtin", styleId: null, stylePreset: preset },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCredits() {
    try {
      const res = await fetchCineCredits();
      setCreditsRemaining(res.credits.remaining ?? 0);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  function addAssets(next: CineAsset[]) {
    setAssets((prev) => [...next, ...prev]);
    refreshCredits();
  }

  function updateCharacter(next: CineCharacter) {
    setCharacters((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }

  async function onProjectStyleChange(next: StyleSelection) {
    setProjectStyleState(next);
    try {
      const res = await setProjectStyle(projectId, next.kind === "user" ? next.styleId : null);
      setProject(res.project);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <PanelCard className="p-6">
        <PanelHeader className="justify-between gap-6">
          <div className="space-y-1">
            <PanelEyebrow>Pipeline</PanelEyebrow>
            <PanelTitle className="text-2xl">{project?.title ?? "CineStudio Project"}</PanelTitle>
            <PanelSubtitle>Project → Character → Angles → Scene → Shots → Video → Export</PanelSubtitle>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/45">Credits</div>
            <div className="text-2xl font-semibold text-white/90">{creditsRemaining}</div>
          </div>
        </PanelHeader>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                step === s.id
                  ? "border-pink-500/35 bg-pink-500/10 text-pink-200"
                  : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80 hover:border-white/18",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <StyleSelector value={projectStyle} onChange={onProjectStyleChange} label="Project default style" helper="Used as a default when creating new characters/scenes (identity always wins)." />
        </div>
      </PanelCard>

      {loading ? (
        <PanelCardSoft className="p-6 text-sm text-white/60">Loading project…</PanelCardSoft>
      ) : null}

      {step === "project" ? (
        <PanelCard className="p-6">
          <PanelEyebrow>Project</PanelEyebrow>
          <PanelTitle className="text-2xl">Assets</PanelTitle>
          <PanelSubtitle>Everything you generate is saved to this project.</PanelSubtitle>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.length === 0 ? (
              <PanelCardSoft className="p-5 text-sm text-white/60">No assets yet. Start with Character.</PanelCardSoft>
            ) : (
              assets.slice(0, 9).map((a) => (
                <div key={a.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  {a.type === "video" ? (
                    <video src={a.url} controls className="w-full rounded-xl border border-white/10 bg-black/40" />
                  ) : (
                    <img src={a.url} alt={a.category} className="aspect-video w-full rounded-xl object-cover" />
                  )}
                  <div className="mt-2 px-1 text-xs text-white/50">{a.category}</div>
                </div>
              ))
            )}
          </div>
        </PanelCard>
      ) : null}

      {step === "character" ? (
        selectedCharacter ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCharacterId(c.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                    selectedCharacter.id === c.id ? "border-pink-500/35 bg-pink-500/10 text-pink-200" : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80 hover:border-white/18",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <CharacterSheetGenerator
              character={selectedCharacter}
              assets={assets.filter((a) => a.characterId === selectedCharacter.id)}
              onAssetsAdded={addAssets}
              onCharacterUpdated={(c) => {
                updateCharacter(c);
                setSelectedCharacterId(c.id);
              }}
            />
          </div>
        ) : (
          <CharacterCreator
            projectId={projectId}
            initialStyle={projectStyle}
            onCreated={(c) => {
              setCharacters((prev) => [c, ...prev]);
              setSelectedCharacterId(c.id);
              setStep("character");
            }}
          />
        )
      ) : null}

      {step === "angles" ? (
        selectedCharacter ? (
          <CharacterAngleGallery
            character={selectedCharacter}
            assets={assets.filter((a) => a.characterId === selectedCharacter.id)}
            onAssetsAdded={addAssets}
            onCharacterUpdated={(c) => updateCharacter(c)}
          />
        ) : (
          <PanelCardSoft className="p-6 text-sm text-white/60">Create a character first.</PanelCardSoft>
        )
      ) : null}

      {step === "scene" ? (
        selectedCharacter ? (
          <SceneCreator
            projectId={projectId}
            character={selectedCharacter}
            assets={assets}
            onAssetsAdded={addAssets}
          />
        ) : (
          <PanelCardSoft className="p-6 text-sm text-white/60">Create a character first.</PanelCardSoft>
        )
      ) : null}

      {step === "shots" ? (
        selectedCharacter ? (
          <div className="space-y-6">
            <ShotListGenerator
              projectId={projectId}
              character={selectedCharacter}
              sceneDescription={sceneDescription}
              assets={assets.filter((a) => a.characterId === selectedCharacter.id)}
              onShots={() => {}}
              onAssetsAdded={addAssets}
            />
            <ShotImageGallery
              assets={assets.filter((a) => a.characterId === selectedCharacter.id)}
              selectedAssetId={selectedShotAssetId}
              onSelect={(asset) => {
                setSelectedShotAssetId(asset.id);
                setSelectedVideoAsset(asset);
              }}
            />
          </div>
        ) : (
          <PanelCardSoft className="p-6 text-sm text-white/60">Create a character first.</PanelCardSoft>
        )
      ) : null}

      {step === "video" ? (
        <VideoGeneratorPanel
          projectId={projectId}
          imageAsset={selectedVideoAsset ?? selectedShotAsset}
          onVideoAsset={(asset) => {
            addAssets([asset]);
            setSelectedVideoAsset(asset);
            setStep("export");
          }}
        />
      ) : null}

      {step === "export" ? <ExportPanel finalVideo={finalVideo} /> : null}

      <PanelCard className="p-6">
        <PanelEyebrow>Status</PanelEyebrow>
        <PanelTitle className="text-2xl">Recent Jobs</PanelTitle>
        <PanelSubtitle>Queued, processing, completed, and failed generations.</PanelSubtitle>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {jobs.length === 0 ? (
            <PanelCardSoft className="p-5 text-sm text-white/60">No jobs yet.</PanelCardSoft>
          ) : (
            jobs.slice(0, 6).map((job) => <JobStatusCard key={job.id} job={job} />)
          )}
        </div>
      </PanelCard>
    </div>
  );
}

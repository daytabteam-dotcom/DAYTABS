import React, { useState } from "react";
import { PanelCard, PanelPage } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import { CineProjectList } from "./CineProjectList";
import { CineProjectDetail } from "./CineProjectDetail";
import { StudioOnlyGuard } from "./StudioOnlyGuard";
import { CineStyleLibrary } from "./styles/CineStyleLibrary";
import { CineAssetsView } from "./internal/CineAssetsView";
import { CineCharactersView } from "./internal/CineCharactersView";

export function CineStudioPage() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<"projects" | "characters" | "styles" | "assets">("projects");

  return (
    <StudioOnlyGuard>
      <PanelPage className="mx-0 max-w-none space-y-6 py-0">
        <PanelCard className="p-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "projects", label: "Projects" },
              { id: "characters", label: "Characters" },
              { id: "styles", label: "Styles" },
              { id: "assets", label: "Assets" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id as any)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                  section === s.id
                    ? "border-pink-500/35 bg-pink-500/10 text-pink-200"
                    : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80 hover:border-white/18",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </PanelCard>

        {section === "projects" ? (
          <>
            <CineProjectList
              activeProjectId={activeProjectId}
              onSelect={(id) => {
                setActiveProjectId(id);
                setSection("projects");
              }}
            />
            {activeProjectId ? <CineProjectDetail projectId={activeProjectId} /> : null}
          </>
        ) : null}

        {section === "characters" ? <CineCharactersView onOpenProject={(id) => { setActiveProjectId(id); setSection("projects"); }} /> : null}
        {section === "styles" ? <CineStyleLibrary /> : null}
        {section === "assets" ? <CineAssetsView onOpenProject={(id) => { setActiveProjectId(id); setSection("projects"); }} /> : null}
      </PanelPage>
    </StudioOnlyGuard>
  );
}

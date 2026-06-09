import React, { useState } from "react";
import { PanelCard, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { Captions } from "lucide-react";

export function AudioTranscriptUpgradeCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PanelCard className="p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="panel-card-soft flex h-11 w-11 items-center justify-center">
                <Captions className="h-5 w-5 text-pink-300" />
              </div>
              <div>
                <PanelEyebrow>Studio feature</PanelEyebrow>
                <PanelTitle>Audio 2 Transcript</PanelTitle>
              </div>
            </div>
            <PanelSubtitle className="mt-0">
              Upload audio and get accurate timestamped transcripts with export tools.
            </PanelSubtitle>
          </div>
          <div className="w-full md:w-[260px]">
            <Button onClick={() => setOpen(true)} className="w-full border-pink-400/35 bg-pink-500 text-white hover:bg-pink-400">
              Upgrade to Studio
            </Button>
          </div>
        </div>
      </PanelCard>
      {open ? <PlanPickerModal onClose={() => setOpen(false)} highlightPlan="studio" /> : null}
    </>
  );
}

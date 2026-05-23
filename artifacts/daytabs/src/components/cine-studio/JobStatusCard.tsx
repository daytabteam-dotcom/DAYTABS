import React from "react";
import { PanelCardSoft } from "@/components/panel-system";
import { cn } from "@/lib/utils";
import type { CineJob } from "./types";

function statusClass(status: string) {
  if (status === "completed") return "text-emerald-300";
  if (status === "failed") return "text-red-300";
  if (status === "processing") return "text-amber-200";
  return "text-white/70";
}

export function JobStatusCard({ job }: { job: CineJob }) {
  return (
    <PanelCardSoft className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Job</p>
          <p className="text-sm font-semibold text-white/85">{job.jobType}</p>
          <p className={cn("text-xs", statusClass(job.status))}>
            {job.status}{job.costCredits ? ` · ${job.costCredits} credits` : ""}
          </p>
          {job.errorMessage ? <p className="text-xs text-red-300">{job.errorMessage}</p> : null}
        </div>
        <div className="text-right text-xs text-white/35">
          <div>{job.provider}</div>
        </div>
      </div>
    </PanelCardSoft>
  );
}


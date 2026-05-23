import React, { type FormEvent, useState } from "react";
import { usePlan } from "@/hooks/use-plan";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelPage, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Check, Film, Loader2 } from "lucide-react";
import { cineNotify } from "./cineStudioApi";
import { UpgradeToStudioCard } from "./UpgradeToStudioCard";

export function StudioOnlyGuard({ children }: { children: React.ReactNode }) {
  const { plan, loading } = usePlan();
  const [openUpgrade, setOpenUpgrade] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onNotify(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    setSubmitting(true);
    setError(null);
    try {
      await cineNotify(value);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !plan) {
    return (
      <PanelPage className="mx-0 max-w-none py-0">
        <PanelCard className="p-6">
          <PanelEyebrow>Loading</PanelEyebrow>
          <PanelTitle className="text-2xl">Preparing CineStudio…</PanelTitle>
          <PanelSubtitle>Checking your plan and credits.</PanelSubtitle>
        </PanelCard>
      </PanelPage>
    );
  }

  if (!plan.isStudio) {
    return (
      <PanelPage className="mx-0 max-w-none space-y-6 py-0">
        <UpgradeToStudioCard onUpgrade={() => setOpenUpgrade(true)} />
        <PanelCard className="p-6 md:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="max-w-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="panel-card-soft relative flex h-11 w-11 items-center justify-center">
                  <Film className="h-5 w-5 text-pink-300" />
                </div>
                <div>
                  <PanelEyebrow>Premium pipeline</PanelEyebrow>
                  <PanelTitle>CineStudio</PanelTitle>
                </div>
              </div>
              <PanelSubtitle className="mt-0">
                A Studio-only cinematic character-to-video pipeline. Join the waitlist and we’ll notify you about access and updates.
              </PanelSubtitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Consistent character sheets + angles",
                  "Cinematic scenes + shot images",
                  "Seedance image-to-video",
                  "Project-based asset library",
                ].map((feature) => (
                  <PanelCardSoft key={feature} className="flex items-center gap-3 p-3 text-sm text-white/60">
                    <Check className="h-4 w-4 shrink-0 text-pink-300" />
                    {feature}
                  </PanelCardSoft>
                ))}
              </div>
            </div>
            <div className="w-full md:w-[320px]">
              {submitted ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
                  <Check className="h-4 w-4" />
                  We'll notify you about CineStudio.
                </div>
              ) : (
                <form onSubmit={onNotify} className="space-y-3">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={submitting}
                    className="panel-input w-full px-4 py-3 disabled:opacity-50"
                  />
                  {error ? <p className="text-xs text-red-400">{error}</p> : null}
                  <Button type="submit" disabled={submitting} className="w-full border-pink-400/35 bg-pink-500 text-white hover:bg-pink-400">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                    {submitting ? "Submitting..." : "Notify me"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </PanelCard>
        {openUpgrade ? <PlanPickerModal onClose={() => setOpenUpgrade(false)} highlightPlan="studio" /> : null}
      </PanelPage>
    );
  }

  return <>{children}</>;
}

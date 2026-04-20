import React, { useState } from "react";
import { motion } from "framer-motion";
import { Camera, MonitorPlay, Trash2, Type } from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { Button } from "@/components/ui/button";
import {
  PanelPage,
  PanelHeader,
  PanelTitle,
  PanelSubtitle,
  PanelCard,
  PanelCardSoft,
} from "@/components/panel-system";

const PLACEHOLDER = `Welcome to DayTabs Teleprompter.

Paste or type your script here. Each paragraph will scroll smoothly so you can read naturally while looking at the camera.

Use Play for teleprompter-only mode, or choose Teleprompter + record to preview your speed and text size first. When you're ready, Record gives you a 3, 2, 1 countdown before scrolling and capture start together.

Good luck with your video!`;

export default function TeleprompterTab() {
  const [script, setScript] = useState("");
  const [open, setOpen] = useState(false);
  const [startInRecordMode, setStartInRecordMode] = useState(false);
  const hasScript = Boolean(script.trim());

  const displayScript = script.trim();

  return (
    <>
      {open && (
        <Teleprompter script={displayScript} startInRecordMode={startInRecordMode} onClose={() => setOpen(false)} />
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-page max-w-7xl space-y-6"
      >
        <PanelHeader className="gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-primary" />
              <PanelTitle>Teleprompter</PanelTitle>
            </div>
            <PanelSubtitle>
              Paste your script, then choose between a clean teleprompter view or a record mode with preview controls and a 3, 2, 1 countdown before capture starts.
            </PanelSubtitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!hasScript}
              onClick={() => {
                setStartInRecordMode(false);
                setOpen(true);
              }}
            >
              <MonitorPlay className="mr-2 h-4 w-4" />
              Use teleprompter
            </Button>
            <Button
              disabled={!hasScript}
              onClick={() => {
                setStartInRecordMode(true);
                setOpen(true);
              }}
            >
              <Camera className="mr-2 h-4 w-4" />
              Teleprompter + record
            </Button>
          </div>
        </PanelHeader>

        <PanelCard className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
            <span className="flex items-center gap-2 text-sm text-white/55 font-medium">
              <Type className="w-4 h-4 text-white/35" />
              Your script
            </span>
            {script && (
              <button
                onClick={() => setScript("")}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={PLACEHOLDER}
            className="w-full bg-transparent px-5 py-4 text-sm leading-relaxed min-h-[420px] resize-none text-white/80 placeholder:text-white/20 focus:outline-none"
            spellCheck
          />
        </PanelCard>

        <PanelCardSoft className="space-y-1.5 p-4 text-xs text-white/35">
          {!hasScript ? (
            <p className="text-sm font-medium text-amber-200">
              Paste your script first to unlock the teleprompter and recording view.
            </p>
          ) : null}
          <p className="text-white/55">
            Use teleprompter keeps the camera off. Teleprompter + record lets you preview the scroll first, then starts camera access and local recording only after you press Record.
          </p>
          <p className="font-semibold text-white/55 mb-2">Keyboard shortcuts</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">
                Space
              </kbd>{" "}
              Play / Pause
            </span>
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">
                ↑
              </kbd>{" "}
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">
                ↓
              </kbd>{" "}
              Adjust speed
            </span>
            <span>
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">
                Esc
              </kbd>{" "}
              Close
            </span>
          </div>
        </PanelCardSoft>
      </motion.div>
    </>
  );
}

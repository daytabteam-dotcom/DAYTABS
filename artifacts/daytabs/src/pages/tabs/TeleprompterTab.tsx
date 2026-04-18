import React, { useState } from "react";
import { motion } from "framer-motion";
import { MonitorPlay, Trash2, Type } from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";
import { Button } from "@/components/ui/button";

const PLACEHOLDER = `Welcome to DayTabs Teleprompter.

Paste or type your script here. Each paragraph will scroll smoothly so you can read naturally while looking at the camera.

Use the Play button (or press Space) to start. Adjust speed and font size to your comfort before you begin recording.

Good luck with your video!`;

export default function TeleprompterTab() {
  const [script, setScript] = useState("");
  const [open, setOpen] = useState(false);

  const displayScript = script.trim() || PLACEHOLDER;

  return (
    <>
      {open && <Teleprompter script={displayScript} onClose={() => setOpen(false)} />}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-primary" />
              <h2 className="text-3xl font-bold text-white">Teleprompter</h2>
            </div>
            <p className="text-white/45 text-sm mt-2">Paste your script, set your pace, and read cleanly on camera.</p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <MonitorPlay className="w-4 h-4 mr-2" />
            Start
          </Button>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/[0.025] overflow-hidden">
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
            onChange={e => setScript(e.target.value)}
            placeholder={PLACEHOLDER}
            className="w-full bg-transparent px-5 py-4 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none leading-relaxed min-h-[420px]"
            spellCheck
          />
        </div>

        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4 text-xs text-white/35 space-y-1.5">
          <p className="font-semibold text-white/55 mb-2">Keyboard shortcuts</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Space</kbd> Play / Pause</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">↑</kbd> <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">↓</kbd> Adjust speed</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Esc</kbd> Close</span>
          </div>
        </div>
      </motion.div>
    </>
  );
}

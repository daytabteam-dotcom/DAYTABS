import React, { useState } from "react";
import { motion } from "framer-motion";
import { MonitorPlay, Trash2 } from "lucide-react";
import { Teleprompter } from "@/components/Teleprompter";

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
        className="max-w-3xl mx-auto space-y-6"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Teleprompter</h2>
          <p className="text-white/50 text-sm">Paste your script below and press Teleprompter to start reading.</p>
        </div>

        <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
            <span className="text-sm text-white/50 font-medium">Your Script</span>
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
            className="w-full bg-transparent px-5 py-4 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none leading-relaxed min-h-[380px]"
            spellCheck
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setOpen(true)}
            className="flex-1 flex items-center justify-center gap-2.5 py-4 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white font-bold text-base transition-all shadow-lg shadow-primary/25"
          >
            <MonitorPlay className="w-5 h-5" />
            Start Teleprompter
          </button>
        </div>

        <div className="glass-card rounded-xl p-4 border border-white/5 text-xs text-white/30 space-y-1.5">
          <p className="font-semibold text-white/40 mb-2">Keyboard shortcuts</p>
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

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, ChevronUp, ChevronDown, RotateCcw, Minus, Plus } from "lucide-react";

interface TeleprompterProps {
  script: string;
  onClose: () => void;
}

export function Teleprompter({ script, onClose }: TeleprompterProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [fontSize, setFontSize] = useState(32);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const reset = useCallback(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setPlaying(false);
  }, []);

  useEffect(() => {
    const tick = (now: number) => {
      if (!playing) return;
      const delta = now - (lastTimeRef.current || now);
      lastTimeRef.current = now;
      if (containerRef.current) {
        containerRef.current.scrollTop += (speed * delta) / 100;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setPlaying(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (playing) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === "ArrowUp") setSpeed(s => Math.min(10, Math.round((s + 0.5) * 2) / 2));
      if (e.key === "ArrowDown") setSpeed(s => Math.max(0.5, Math.round((s - 0.5) * 2) / 2));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const adjustSpeed = (delta: number) =>
    setSpeed(s => Math.min(10, Math.max(0.5, Math.round((s + delta) * 2) / 2)));
  const adjustFont = (delta: number) =>
    setFontSize(s => Math.min(72, Math.max(16, s + delta)));

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Controls bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-black/90 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(p => !p)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl font-semibold text-white hover:bg-primary/80 transition-colors"
          >
            {playing ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Play</>}
          </button>
          <button
            onClick={reset}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
            title="Reset to top"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-6">
          {/* Speed control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-wider">Speed</span>
            <button onClick={() => adjustSpeed(-0.5)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <span className="text-white font-mono font-bold w-10 text-center tabular-nums">{speed.toFixed(1)}×</span>
            <button onClick={() => adjustSpeed(0.5)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Font size control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-wider">Size</span>
            <button onClick={() => adjustFont(-4)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-white font-mono font-bold w-8 text-center tabular-nums">{fontSize}</span>
            <button onClick={() => adjustFont(4)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scroll viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden select-none"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="h-[45vh]" />
        <div
          className="max-w-4xl mx-auto px-8 pb-[50vh]"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.7, color: "white", fontWeight: 500 }}
        >
          {script.split("\n").map((line, i) => (
            <p key={i} className={line.trim() === "" ? "mb-8" : "mb-3"}>
              {line || "\u00A0"}
            </p>
          ))}
        </div>
      </div>

      {/* Center-line focus gradient */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <div className="absolute inset-x-0 top-[38%] bottom-[38%] bg-transparent" />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.85) 100%)",
          }}
        />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-primary/25" />
      </div>

      {/* Key hints */}
      <div className="shrink-0 flex items-center justify-center gap-8 py-2 border-t border-white/5 bg-black/80 text-xs text-white/25">
        <span>Space: Play / Pause</span>
        <span>↑ ↓: Speed</span>
        <span>Esc: Close</span>
      </div>
    </div>
  );
}

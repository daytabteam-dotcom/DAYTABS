import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Minus, Plus, Gauge, Type, ChevronLeft, ChevronRight } from "lucide-react";

interface TeleprompterProps {
  script: string;
  onClose: () => void;
}

export function Teleprompter({ script, onClose }: TeleprompterProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [fontSize, setFontSize] = useState(36);
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setPlaying(false);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [playing]);

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
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); revealControls(); }
      if (e.key === "ArrowUp") setSpeed(s => Math.min(10, Math.round((s + 0.5) * 2) / 2));
      if (e.key === "ArrowDown") setSpeed(s => Math.max(0.5, Math.round((s - 0.5) * 2) / 2));
      revealControls();
    };
    const handleMove = () => revealControls();
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousemove", handleMove);
    };
  }, [onClose, revealControls]);

  const adjustSpeed = (delta: number) =>
    setSpeed(s => Math.min(10, Math.max(0.5, parseFloat((s + delta).toFixed(1)))));
  const adjustFont = (delta: number) =>
    setFontSize(s => Math.min(80, Math.max(20, s + delta)));

  const speedPercent = Math.round(((speed - 0.5) / 9.5) * 100);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">

      {/* ── Top control bar ─────────────────────────────────────────────────── */}
      <div
        className={`shrink-0 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black via-black/95 to-transparent">

          {/* Left: Close */}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/90 transition-all border border-white/10"
          >
            <X className="w-4 h-4" />
            <span className="text-sm font-medium">Close</span>
          </button>

          {/* Center: Core playback controls */}
          <div className="flex items-center gap-3">
            {/* Reset */}
            <button
              onClick={reset}
              title="Restart from top"
              className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/90 flex items-center justify-center transition-all border border-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Play / Pause — main CTA */}
            <button
              onClick={() => setPlaying(p => !p)}
              className={`flex items-center gap-2.5 px-7 py-3 rounded-2xl font-bold text-base transition-all shadow-2xl ${
                playing
                  ? "bg-white text-black hover:bg-white/90 shadow-white/20"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/40"
              }`}
            >
              {playing
                ? <><Pause className="w-5 h-5" /><span>Pause</span></>
                : <><Play className="w-5 h-5" /><span>Play</span></>
              }
            </button>
          </div>

          {/* Right: Speed + Font size */}
          <div className="flex items-center gap-5">

            {/* Speed control */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-1 text-white/40">
                <Gauge className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-widest">Speed</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustSpeed(-0.5)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/18 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="w-14 text-center">
                  <span className="text-white font-mono font-bold text-lg tabular-nums">{speed.toFixed(1)}</span>
                  <span className="text-white/30 text-xs">×</span>
                </div>
                <button
                  onClick={() => adjustSpeed(0.5)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/18 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {/* Speed bar */}
              <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${speedPercent}%` }}
                />
              </div>
            </div>

            {/* Font size control */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-1 text-white/40">
                <Type className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-widest">Size</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustFont(-4)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/18 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-white font-mono font-bold text-lg tabular-nums w-10 text-center">{fontSize}</span>
                <button
                  onClick={() => adjustFont(4)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/18 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {/* Size preview bar */}
              <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.round(((fontSize - 20) / 60) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scroll viewport ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: "none" }}
        onClick={() => setPlaying(p => !p)}
      >
        {/* Top spacer so text starts at center */}
        <div className="h-[42vh]" />

        {/* Script text */}
        <div
          className="max-w-4xl mx-auto px-10 pb-[50vh]"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.75,
            color: "rgba(255,255,255,0.92)",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {script.split("\n").map((line, i) => {
            const isPacingCue = /^\[([A-Z ]+)\]$/.test(line.trim());
            return (
              <p
                key={i}
                className={line.trim() === "" ? "mb-8" : "mb-3"}
                style={isPacingCue ? {
                  fontSize: `${Math.max(14, fontSize * 0.45)}px`,
                  color: "rgba(167,139,250,0.5)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  letterSpacing: "0.08em",
                } : {}}
              >
                {line || "\u00A0"}
              </p>
            );
          })}
        </div>
      </div>

      {/* ── Focus gradient overlay (dimmer top/bottom, bright center) ────────── */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 22%, transparent 35%, transparent 65%, rgba(0,0,0,0.3) 78%, rgba(0,0,0,0.92) 100%)",
          }}
        />
        {/* Center read-line */}
        <div className="absolute left-8 right-8 top-1/2 -translate-y-px h-px bg-violet-500/20" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-[1px] flex justify-center">
          <div className="w-1 h-1 rounded-full bg-violet-500/40" />
        </div>
      </div>

      {/* ── Bottom key hints ──────────────────────────────────────────────────── */}
      <div
        className={`shrink-0 transition-all duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center justify-center gap-8 py-2.5 bg-gradient-to-t from-black to-transparent text-[11px] text-white/25">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Space</kbd>
            Play / Pause
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">↑ ↓</kbd>
            Speed
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Click</kbd>
            Toggle
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Esc</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

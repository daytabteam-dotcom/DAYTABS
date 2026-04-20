import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Minus,
  Plus,
  Gauge,
  Type,
  ChevronLeft,
  ChevronRight,
  Camera,
  CameraOff,
  Circle,
  Download,
  Settings,
} from "lucide-react";

interface TeleprompterProps {
  script: string;
  onClose: () => void;
  startInRecordMode?: boolean;
}

export function Teleprompter({ script, onClose, startInRecordMode = false }: TeleprompterProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [fontSize, setFontSize] = useState(36);
  const [showControls, setShowControls] = useState(true);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const latestDownloadUrlRef = useRef<string | null>(null);
  const scrollOffsetRef = useRef(0);
  const maxScrollRef = useRef(0);
  const stopCameraAfterRecordingRef = useRef(false);

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

  const syncScrollPosition = useCallback((offset = scrollOffsetRef.current) => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(0, -${offset}px, 0)`;
    }
  }, []);

  const syncScrollBounds = useCallback(() => {
    const viewportHeight = containerRef.current?.clientHeight ?? 0;
    const contentHeight = contentRef.current?.scrollHeight ?? 0;
    maxScrollRef.current = Math.max(0, contentHeight - viewportHeight);
    scrollOffsetRef.current = Math.min(scrollOffsetRef.current, maxScrollRef.current);
    syncScrollPosition();
  }, [syncScrollPosition]);

  const stopMediaTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraRequested(false);
    setCameraReady(false);
  }, []);

  const getSupportedMimeType = useCallback(() => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
  }, []);

  const saveBlobToDevice = useCallback((blob: Blob) => {
    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const url = URL.createObjectURL(blob);
    if (latestDownloadUrlRef.current) URL.revokeObjectURL(latestDownloadUrlRef.current);
    latestDownloadUrlRef.current = url;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daytabs-teleprompter-${timestamp}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setSavedMessage("Saved to this device");
    if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
    saveMessageTimerRef.current = setTimeout(() => setSavedMessage(null), 3200);
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || typeof MediaRecorder === "undefined") {
      setCameraError("Recording is not supported in this browser.");
      return false;
    }

    try {
      const mimeType = getSupportedMimeType();
      chunksRef.current = [];
      const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const nextMimeType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: nextMimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        if (blob.size > 0) saveBlobToDevice(blob);
        if (stopCameraAfterRecordingRef.current) {
          stopCameraAfterRecordingRef.current = false;
          stopMediaTracks();
        }
      };
      recorder.start();
      setRecording(true);
      setSavedMessage(null);
      return true;
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not start recording.");
      return false;
    }
  }, [getSupportedMimeType, saveBlobToDevice, stopMediaTracks]);

  const startCamera = useCallback(async () => {
    setCameraRequested(true);
    setCameraError(null);
    setCameraReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return false;
    }

    try {
      stopMediaTracks();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          setCameraReady(true);
          void video.play().catch(() => undefined);
        };
        if (video.readyState >= 1) {
          setCameraReady(true);
          await video.play().catch(() => undefined);
        }
      } else {
        setCameraReady(true);
      }
      return true;
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not access the front camera.");
      return false;
    }
  }, [stopMediaTracks]);

  const stopRecordingSession = useCallback(() => {
    setPlaying(false);
    stopCameraAfterRecordingRef.current = recording;
    if (recording) {
      stopRecording();
    } else {
      stopMediaTracks();
    }
    revealControls();
  }, [recording, revealControls, stopMediaTracks, stopRecording]);

  const beginRecordingSession = useCallback(async () => {
    const ready = cameraReady || await startCamera();
    if (!ready) return;
    const didStartRecording = startRecording();
    if (!didStartRecording) return;
    setPlaying(true);
    revealControls();
  }, [cameraReady, revealControls, startCamera, startRecording]);

  const reset = useCallback(() => {
    setPlaying(false);
    scrollOffsetRef.current = 0;
    syncScrollPosition(0);
    if (startInRecordMode) {
      stopRecordingSession();
    }
  }, [startInRecordMode, stopRecordingSession, syncScrollPosition]);

  const togglePrimaryAction = useCallback(() => {
    if (startInRecordMode) {
      if (playing || recording) {
        stopRecordingSession();
        return;
      }
      void beginRecordingSession();
      return;
    }

    setPlaying((current) => !current);
    revealControls();
  }, [beginRecordingSession, playing, recording, revealControls, startInRecordMode, stopRecordingSession]);

  useEffect(() => {
    const tick = (now: number) => {
      if (!playing) return;

      const delta = now - (lastTimeRef.current || now);
      lastTimeRef.current = now;

      if (contentRef.current) {
        scrollOffsetRef.current = Math.min(maxScrollRef.current, scrollOffsetRef.current + (speed * delta) / 12);
        syncScrollPosition();
        if (scrollOffsetRef.current >= maxScrollRef.current) {
          setPlaying(false);
          if (startInRecordMode && (recording || cameraReady)) {
            stopRecordingSession();
          }
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
  }, [cameraReady, playing, recording, speed, startInRecordMode, stopRecordingSession, syncScrollPosition]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        togglePrimaryAction();
      }
      if (e.key === "ArrowUp") setSpeed((s) => Math.min(10, Math.round((s + 0.5) * 2) / 2));
      if (e.key === "ArrowDown") setSpeed((s) => Math.max(0.5, Math.round((s - 0.5) * 2) / 2));
      revealControls();
    };

    const handleMove = () => revealControls();

    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousemove", handleMove);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousemove", handleMove);
    };
  }, [onClose, revealControls, togglePrimaryAction]);

  useEffect(() => {
    syncScrollBounds();
  }, [fontSize, script, syncScrollBounds]);

  useEffect(() => {
    const handleResize = () => syncScrollBounds();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
      stopCameraAfterRecordingRef.current = false;
      stopRecording();
      stopMediaTracks();
      if (latestDownloadUrlRef.current) {
        URL.revokeObjectURL(latestDownloadUrlRef.current);
        latestDownloadUrlRef.current = null;
      }
    };
  }, [stopMediaTracks, stopRecording, syncScrollBounds]);

  const adjustSpeed = (delta: number) =>
    setSpeed((s) => Math.min(10, Math.max(0.5, parseFloat((s + delta).toFixed(1)))));
  const adjustFont = (delta: number) =>
    setFontSize((s) => Math.min(80, Math.max(20, s + delta)));

  const speedPercent = Math.round(((speed - 0.5) / 9.5) * 100);
  const primaryActionLabel = startInRecordMode
    ? (playing || recording ? "Stop" : "Record")
    : (playing ? "Pause" : "Play");
  const primaryActionIcon = startInRecordMode
    ? (playing || recording ? Circle : Camera)
    : (playing ? Pause : Play);
  const PrimaryActionIcon = primaryActionIcon;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-black select-none">
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          className={startInRecordMode && cameraReady ? "h-full w-full object-cover scale-x-[-1]" : "hidden"}
          autoPlay
          muted
          playsInline
        />
        {startInRecordMode && !cameraReady ? (
          <div className="flex h-full w-full items-center justify-center bg-[#050505]">
            <div className="max-w-md px-6 text-center text-white/60">
              <CameraOff className="mx-auto h-10 w-10 text-white/35" />
              <p className="mt-4 text-base font-medium text-white/80">
                {cameraError ? "Front camera unavailable" : cameraRequested ? "Starting front camera" : "Camera starts when you record"}
              </p>
              <p className="mt-2 text-sm leading-6">
                {cameraError ?? "Press Record when you're ready. We only ask for camera access for teleprompter + record mode."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="absolute inset-0 bg-black/60" />

      <div
        className={`shrink-0 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="relative z-20 flex items-center justify-between gap-4 px-4 py-4 bg-gradient-to-b from-black via-black/95 to-transparent sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-white/50 transition-all hover:bg-white/15 hover:text-white/90"
            >
              <X className="w-4 h-4" />
              <span className="hidden text-sm font-medium sm:inline">Close</span>
            </button>
            <div className="hidden rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/75 sm:block">
              <p className="font-semibold text-white">
                {startInRecordMode
                  ? (cameraReady ? "Front camera live" : "Camera starts on Record")
                  : "Teleprompter only"}
              </p>
              <p className="mt-1 text-white/45">
                {startInRecordMode ? "Recordings save to this device only" : "Camera stays off until you choose record mode"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={reset}
              title="Restart from top"
              className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/90 flex items-center justify-center transition-all border border-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePrimaryAction}
              className={`flex items-center gap-2.5 px-7 py-3 rounded-2xl font-bold text-base transition-all shadow-2xl ${
                playing || recording
                  ? "bg-white text-black hover:bg-white/90 shadow-white/20"
                  : startInRecordMode
                    ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/35"
                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/40"
              }`}
            >
              <PrimaryActionIcon className={`w-5 h-5 ${startInRecordMode && (playing || recording) ? "fill-current" : ""}`} />
              <span>{primaryActionLabel}</span>
            </button>
          </div>

          <div className="hidden items-center gap-5 md:flex">
            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 xl:flex">
              <Download className="h-3.5 w-3.5 text-white/45" />
              <span>{savedMessage ?? (recording ? "Recording locally" : "Not recording")}</span>
            </div>

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
                  <span className="text-white/30 text-xs">x</span>
                </div>
                <button
                  onClick={() => adjustSpeed(0.5)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/18 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${speedPercent}%` }}
                />
              </div>
            </div>

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

      <div
        ref={containerRef}
        className="relative z-20 flex-1 overflow-hidden"
        style={{ scrollbarWidth: "none" }}
        onClick={!startInRecordMode ? togglePrimaryAction : undefined}
      >
        <div ref={contentRef} className="will-change-transform">
          <div className="h-[42vh]" />

          <div
            className="mx-auto max-w-3xl px-6 pb-[12rem] pt-2 sm:px-10 sm:pb-[50vh]"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.98)",
              fontWeight: 600,
              letterSpacing: "0.01em",
              textShadow: "0 3px 16px rgba(0,0,0,0.9)",
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
                    color: "rgba(216,180,254,0.85)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    letterSpacing: "0.08em",
                    textShadow: "0 2px 10px rgba(0,0,0,0.75)",
                  } : {}}
                >
                  {line || "\u00A0"}
                </p>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.52) 22%, rgba(0,0,0,0.12) 35%, rgba(0,0,0,0.12) 65%, rgba(0,0,0,0.52) 78%, rgba(0,0,0,0.96) 100%)",
          }}
        />
        <div className="absolute left-8 right-8 top-1/2 -translate-y-px h-px bg-violet-500/20" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-[1px] flex justify-center">
          <div className="w-1 h-1 rounded-full bg-violet-500/40" />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="pointer-events-auto rounded-[28px] border border-white/10 bg-black/85 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {settingsOpen ? (
            <div className="mb-3 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-white/55">
                <span className="font-semibold uppercase tracking-[0.16em]">Teleprompter settings</span>
                <span>{savedMessage ?? (recording ? "Recording locally" : "Not recording")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => adjustSpeed(-0.5)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Slower
                </button>
                <button
                  onClick={() => adjustSpeed(0.5)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Faster
                </button>
                <button
                  onClick={() => adjustFont(-4)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Smaller text
                </button>
                <button
                  onClick={() => adjustFont(4)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Bigger text
                </button>
                <button
                  onClick={reset}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Restart
                </button>
                <button
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white"
                >
                  Close teleprompter
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>Speed {speed.toFixed(1)}x</span>
                <span>Text {fontSize}px</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePrimaryAction}
              className={`flex min-h-16 flex-1 items-center justify-center gap-3 rounded-[22px] px-5 text-base font-semibold transition-all ${
                playing || recording
                  ? "bg-white text-black hover:bg-white/90"
                  : startInRecordMode
                    ? "bg-red-500 text-white hover:bg-red-400"
                    : "bg-violet-600 text-white hover:bg-violet-500"
              }`}
            >
              <PrimaryActionIcon className={`h-5 w-5 ${startInRecordMode && (playing || recording) ? "fill-current" : ""}`} />
              <span>{primaryActionLabel}</span>
            </button>
            <button
              onClick={() => setSettingsOpen((current) => !current)}
              className="flex min-h-16 min-w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.06] text-white"
              aria-label="Open teleprompter settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`shrink-0 transition-all duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="relative z-20 hidden items-center justify-center gap-8 bg-gradient-to-t from-black to-transparent py-2.5 text-[11px] text-white/25 md:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Space</kbd>
            {startInRecordMode ? "Record / Stop" : "Play / Pause"}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">↑ ↓</kbd>
            Speed
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Click</kbd>
            {startInRecordMode ? "Adjust text only" : "Toggle"}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono text-[10px]">Rec</kbd>
            Save locally
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Camera, Circle, Download, Play, Pause, RotateCcw, ShieldCheck, UserPlus, X, LogIn } from "lucide-react";
import Navbar from "@/components/Navbar";
import { authApi } from "@/lib/api";

function asToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("daytabs_token") ?? "";
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function createSignupGateImage(): Promise<string> {
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0b0b12");
  gradient.addColorStop(1, "#120a1e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(124,58,237,0.22)";
  ctx.beginPath();
  ctx.ellipse(width * 0.76, height * 0.18, 340, 220, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  drawRoundedRect(ctx, 44, 44, 260, 54, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("DayTabs", 70, 78);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "900 42px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("Create a free account", 44, 150);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "650 22px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const lines = wrapText(ctx, "to download your recording. No credit card required.", width - 88);
  lines.slice(0, 2).forEach((line, idx) => ctx.fillText(line, 44, 190 + idx * 30));

  return canvas.toDataURL("image/png");
}

function downloadBlob(blob: Blob) {
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daytabs-teleprompter-${timestamp}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function TeleprompterFeaturePage() {
  const [script, setScript] = useState(`Paste your script here.\n\nTip: Keep sentences short and easy to read out loud.`);
  const lines = useMemo(() => script.split(/\n+/).map((l) => l.trim()).filter(Boolean), [script]);

  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [downloadGateOpen, setDownloadGateOpen] = useState(false);
  const pendingBlobRef = useRef<Blob | null>(null);
  const [gateImage, setGateImage] = useState<string>("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupWorking, setSignupWorking] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");

  const discardPendingRecording = useCallback(() => {
    pendingBlobRef.current = null;
    setGateImage("");
    setDownloadGateOpen(false);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraOrientationRef = useRef<"portrait" | "landscape" | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const drawRafRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scrollOffsetRef = useRef(0);
  const maxScrollRef = useRef(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncScrollBounds = useCallback(() => {
    const viewportHeight = containerRef.current?.clientHeight ?? 0;
    const contentHeight = contentRef.current?.scrollHeight ?? 0;
    maxScrollRef.current = Math.max(0, contentHeight - viewportHeight);
    scrollOffsetRef.current = Math.min(scrollOffsetRef.current, maxScrollRef.current);
    if (contentRef.current) contentRef.current.style.transform = `translate3d(0, -${scrollOffsetRef.current}px, 0)`;
  }, []);

  const resetScrollPosition = useCallback(() => {
    scrollOffsetRef.current = 0;
    if (contentRef.current) contentRef.current.style.transform = "translate3d(0, 0, 0)";
  }, []);

  useEffect(() => {
    syncScrollBounds();
  }, [lines.length, syncScrollBounds]);

  useEffect(() => {
    const onResize = () => syncScrollBounds();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncScrollBounds]);

  const stopMediaTracks = useCallback(() => {
    if (drawRafRef.current) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = 0;
    }
    if (canvasStreamRef.current) {
      for (const track of canvasStreamRef.current.getTracks()) track.stop();
      canvasStreamRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownValue(null);
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

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return false;
    }

    try {
      stopMediaTracks();
      const supported = navigator.mediaDevices.getSupportedConstraints?.() ?? {};
      const desiredOrientation: "portrait" | "landscape" = (() => {
        if (typeof window.matchMedia === "function" && window.matchMedia("(orientation: portrait)").matches) return "portrait";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const screenOrientation = (window.screen as any)?.orientation?.type as string | undefined;
        if (screenOrientation?.includes("portrait")) return "portrait";
        return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
      })();

      const buildConstraints = (orientation: "portrait" | "landscape", strict: boolean): MediaTrackConstraints => {
        const idealWidth = orientation === "portrait" ? 1080 : 1920;
        const idealHeight = orientation === "portrait" ? 1920 : 1080;
        const aspect = orientation === "portrait" ? 9 / 16 : 16 / 9;
        const videoConstraints: MediaTrackConstraints = { facingMode: "user" };
        if (supported.width) videoConstraints.width = strict ? { ideal: idealWidth, min: 720 } : { ideal: idealWidth };
        if (supported.height) videoConstraints.height = strict ? { ideal: idealHeight, min: 720 } : { ideal: idealHeight };
        if (supported.aspectRatio) videoConstraints.aspectRatio = strict ? { exact: aspect } : aspect;
        if (supported.frameRate) videoConstraints.frameRate = { ideal: 30, max: 60 };
        if ((supported as any).resizeMode) (videoConstraints as any).resizeMode = "crop-and-scale";
        if (!strict) {
          (videoConstraints as any).advanced = [
            supported.width && supported.height ? { width: idealWidth, height: idealHeight } : {},
          ].filter((x: any) => Object.keys(x).length);
        }
        return videoConstraints;
      };

      const stream = await navigator.mediaDevices.getUserMedia({ video: buildConstraints(desiredOrientation, false), audio: true });

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      const width = typeof settings.width === "number" ? settings.width : null;
      const height = typeof settings.height === "number" ? settings.height : null;
      const actualOrientation: "portrait" | "landscape" | null =
        width && height ? (height >= width ? "portrait" : "landscape") : null;

      if (track && actualOrientation && actualOrientation !== desiredOrientation) {
        try {
          await track.applyConstraints(buildConstraints(desiredOrientation, true));
        } catch {
          // ignore
        }
        const next = track.getSettings?.() ?? {};
        const nextW = typeof next.width === "number" ? next.width : null;
        const nextH = typeof next.height === "number" ? next.height : null;
        const nextOrientation: "portrait" | "landscape" | null =
          nextW && nextH ? (nextH >= nextW ? "portrait" : "landscape") : null;

        if (nextOrientation && nextOrientation !== desiredOrientation) {
          for (const t of stream.getTracks()) t.stop();
          const retry = await navigator.mediaDevices.getUserMedia({ video: buildConstraints(desiredOrientation, true), audio: true });
          streamRef.current = retry;
          cameraOrientationRef.current = desiredOrientation;
          if (videoRef.current) {
            const video = videoRef.current;
            video.muted = true;
            video.playsInline = true;
            video.srcObject = retry;
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
        }
      }

      streamRef.current = stream;
      cameraOrientationRef.current = desiredOrientation;
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
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Could not access the front camera.");
      return false;
    }
  }, [stopMediaTracks]);

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
      const sourceVideo = videoRef.current;
      if (!sourceVideo) {
        setCameraError("Preview video unavailable.");
        return false;
      }

      const isPortrait =
        window.innerHeight > window.innerWidth ||
        (typeof window.matchMedia === "function" && window.matchMedia("(orientation: portrait)").matches);
      const outputWidth = isPortrait ? 1080 : 1920;
      const outputHeight = isPortrait ? 1920 : 1080;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCameraError("Canvas unavailable.");
        return false;
      }

      const draw = () => {
        const vw = sourceVideo.videoWidth || outputWidth;
        const vh = sourceVideo.videoHeight || outputHeight;
        const scale = Math.max(outputWidth / vw, outputHeight / vh);
        const sw = outputWidth / scale;
        const sh = outputHeight / scale;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;
        try {
          ctx.drawImage(sourceVideo, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
        } catch {
          // ignore
        }
        drawRafRef.current = requestAnimationFrame(draw);
      };

      if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
      draw();

      const canvasStream = canvas.captureStream(30);
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) canvasStream.addTrack(audioTrack);
      canvasStreamRef.current = canvasStream;

      const recorder = mimeType ? new MediaRecorder(canvasStream, { mimeType }) : new MediaRecorder(canvasStream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const nextMimeType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: nextMimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        if (drawRafRef.current) {
          cancelAnimationFrame(drawRafRef.current);
          drawRafRef.current = 0;
        }
        if (canvasStreamRef.current) {
          for (const track of canvasStreamRef.current.getTracks()) track.stop();
          canvasStreamRef.current = null;
        }
        setRecording(false);
        setPlaying(false);
        setPreviewing(false);
        stopMediaTracks();

        if (blob.size <= 0) return;
        pendingBlobRef.current = blob;
        setGateImage(await createSignupGateImage());
        setDownloadGateOpen(true);
      };
      recorder.start();
      setRecording(true);
      return true;
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Could not start recording.");
      return false;
    }
  }, [getSupportedMimeType, stopMediaTracks]);

  const beginPreview = useCallback(() => {
    if (recording || countdownValue !== null) return;
    clearCountdown();
    resetScrollPosition();
    setPreviewing(true);
    setPlaying(true);
  }, [clearCountdown, countdownValue, recording, resetScrollPosition]);

  const beginRecord = useCallback(async () => {
    if (recording || countdownValue !== null) return;
    clearCountdown();
    setPlaying(false);
    setPreviewing(false);
    resetScrollPosition();
    setCameraError(null);

    const desiredOrientation: "portrait" | "landscape" =
      typeof window.matchMedia === "function" && window.matchMedia("(orientation: portrait)").matches
        ? "portrait"
        : "landscape";
    const mustRestartCamera = !cameraReady || cameraOrientationRef.current !== desiredOrientation;
    const ready = mustRestartCamera ? await startCamera() : true;
    if (!ready) return;

    const runCountdown = (value: number) => {
      setCountdownValue(value);
      countdownTimerRef.current = setTimeout(() => {
        if (value > 1) {
          runCountdown(value - 1);
          return;
        }
        countdownTimerRef.current = null;
        setCountdownValue(null);
        resetScrollPosition();
        const didStart = startRecording();
        if (!didStart) return;
        setPlaying(true);
      }, 1000);
    };
    runCountdown(3);
  }, [cameraReady, clearCountdown, countdownValue, recording, resetScrollPosition, startCamera, startRecording]);

  const reset = useCallback(() => {
    clearCountdown();
    setPlaying(false);
    setPreviewing(false);
    resetScrollPosition();
  }, [clearCountdown, resetScrollPosition]);

  useEffect(() => {
    const tick = (now: number) => {
      if (!playing) return;
      const delta = now - (lastTimeRef.current || now);
      lastTimeRef.current = now;

      scrollOffsetRef.current = Math.min(maxScrollRef.current, scrollOffsetRef.current + (2 * delta) / 12);
      if (contentRef.current) contentRef.current.style.transform = `translate3d(0, -${scrollOffsetRef.current}px, 0)`;
      if (scrollOffsetRef.current >= maxScrollRef.current) {
        setPlaying(false);
        if (previewing) setPreviewing(false);
        return;
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
  }, [playing, previewing]);

  useEffect(() => {
    return () => {
      clearCountdown();
      stopRecording();
      stopMediaTracks();
      cancelAnimationFrame(rafRef.current);
    };
  }, [clearCountdown, stopMediaTracks, stopRecording]);

  const canDownloadNow = Boolean(asToken());

  useEffect(() => {
    if (!downloadGateOpen) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "daytabs_token") return;
      const token = asToken();
      const blob = pendingBlobRef.current;
      if (!token || !blob) return;
      pendingBlobRef.current = null;
      setGateImage("");
      setDownloadGateOpen(false);
      downloadBlob(blob);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [downloadGateOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Helmet>
        <title>Online Teleprompter with Recording | Free Browser Teleprompter Tool</title>
        <meta
          name="description"
          content="Use a free online teleprompter with recording. Write your script, scroll it while speaking, and record videos directly in your browser. No download required."
        />
      </Helmet>
      <Navbar />

      <div className="pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-4xl md:text-5xl font-black leading-tight">Online Teleprompter with Recording</h1>
            <p className="mt-3 text-xl md:text-2xl font-semibold text-white/85">Speak naturally and record videos in one take</p>
            <p className="mt-5 text-white/55 leading-7">
              Use a simple browser-based teleprompter that scrolls your script while you record. No downloads, no setup, and your video stays on your device.
            </p>
          </motion.div>

          <div className="mt-10 max-w-3xl text-white/55 leading-7 space-y-4">
            <p>
              If you’ve ever tried to record a video while reading a script, you know how difficult it feels. You either look away from the camera, forget your lines, or keep restarting over and over again.
            </p>
            <p>
              This online teleprompter solves that problem by combining script reading and video recording in one place.
            </p>
            <p>
              You can write your script, follow it while it scrolls, and record your video at the same time. Everything happens directly in your browser, so you can start instantly without installing anything.
            </p>
          </div>

          <div className="mt-10">
            <h2 className="text-2xl font-bold">Start recording your video</h2>
            <p className="mt-2 text-white/55 leading-7 max-w-3xl">
              Write your script, press record, and let the teleprompter guide you through your delivery. No complicated tools, no editing setup, and no wasted time.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-3xl border border-white/10 p-6">
              <h2 className="text-lg font-bold">Your script</h2>
              <p className="mt-2 text-sm text-white/55">Paste your script and start recording. After you finish, sign up free to download (no credit card required).</p>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="mt-4 w-full min-h-56 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={previewing ? () => { setPlaying(false); setPreviewing(false); } : beginPreview}
                  disabled={recording || countdownValue !== null}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    previewing ? "border-white/10 bg-white text-black" : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {previewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {previewing ? "Stop preview" : "Preview"}
                </button>
                {!recording ? (
                  <button
                    type="button"
                    onClick={beginRecord}
                    disabled={countdownValue !== null}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    Record
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-400"
                  >
                    <Circle className="w-4 h-4 fill-current" />
                    End recording
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </button>
              </div>

              {cameraError ? (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {cameraError}
                </div>
              ) : null}

              <div className="mt-4 text-xs text-white/45">
                {recording ? "Recording locally…" : countdownValue !== null ? "Countdown running…" : cameraReady ? "Camera ready" : "Camera permission requested only when you press Record"}
                {!canDownloadNow ? " • Download requires signup" : " • Downloads enabled"}
              </div>
            </div>

            <div className="glass rounded-3xl border border-white/10 p-6">
              <h2 className="text-lg font-bold">Teleprompter view</h2>
              <p className="mt-2 text-sm text-white/55">Your text scrolls from the top when you press Record.</p>

              <div className="mt-4 relative overflow-hidden rounded-3xl border border-white/10 bg-black min-h-[520px]">
                <video
                  ref={videoRef}
                  className={cameraReady ? "absolute inset-0 h-full w-full object-cover scale-x-[-1]" : "hidden"}
                  autoPlay
                  muted
                  playsInline
                />
                <div className="absolute inset-0 bg-black/55" />

                {countdownValue !== null ? (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                    <div className="rounded-full border border-white/15 bg-black/70 px-10 py-8 text-center shadow-2xl shadow-black/60 backdrop-blur-md">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">Recording starts in</p>
                      <p className="mt-2 text-7xl font-black leading-none text-white">{countdownValue}</p>
                    </div>
                  </div>
                ) : null}

                <div ref={containerRef} className="relative z-10 h-[520px] overflow-hidden px-8 py-10">
                  <div ref={contentRef} className="space-y-7">
                    {lines.map((line, idx) => (
                      <p key={`${idx}-${line.slice(0, 24)}`} className="text-3xl font-semibold leading-relaxed text-white/92">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-10 max-w-3xl">
            <section>
              <h2 className="text-2xl font-bold">How the teleprompter works</h2>
              <div className="mt-3 space-y-3 text-white/55 leading-7">
                <p>Start by writing or pasting your script into the editor.</p>
                <p>
                  When you press record, the app gives you a short countdown and then begins recording using your camera. At the same time, your script scrolls smoothly from top to bottom so you can follow along naturally.
                </p>
                <p>This allows you to maintain eye contact with the camera while speaking clearly and confidently.</p>
                <p>Once you finish, your video is ready to download immediately.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold">Record videos while reading your script</h2>
              <div className="mt-3 space-y-3 text-white/55 leading-7">
                <p>This feature is designed for anyone who wants to record videos more efficiently without memorizing content.</p>
                <p>
                  Instead of switching between notes and camera, you can keep everything in a single view. Your script stays visible, your recording runs smoothly, and your delivery feels more natural.
                </p>
                <p>This is especially useful for talking head videos, tutorials, product demos, and social media content.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold">No download, no setup, fully online</h2>
              <div className="mt-3 space-y-3 text-white/55 leading-7">
                <p>Unlike traditional teleprompter software, this tool runs entirely in your browser.</p>
                <p>You don’t need to install any apps or configure anything. Just open the page, paste your script, and start recording.</p>
                <p>Because it works online, you can use it on any device with a camera and a browser.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold">Private recording on your device</h2>
              <div className="mt-3 space-y-3 text-white/55 leading-7">
                <p>Your video is recorded locally on your device, not uploaded to a server.</p>
                <p>This means your content stays private and under your control. You can review it, download it, and use it however you want without worrying about storage or sharing.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold">Who should use an online teleprompter</h2>
              <div className="mt-3 text-white/55 leading-7">
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Content creators recording YouTube or short-form videos</li>
                  <li>Founders and teams creating product updates or demos</li>
                  <li>Educators and coaches recording lessons or courses</li>
                  <li>Anyone who wants to speak clearly on camera without memorizing a script</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold">Why use a teleprompter for video recording</h2>
              <div className="mt-3 text-white/55 leading-7">
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Speak more confidently</li>
                  <li>Reduce mistakes and retakes</li>
                  <li>Save time during recording</li>
                  <li>Deliver your message clearly and consistently</li>
                </ul>
                <p className="mt-4">
                  When combined with recording, it becomes a complete workflow that helps you go from script to finished video much faster.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {downloadGateOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={discardPendingRecording}
            aria-label="Close signup gate"
          />
          <div className="relative w-full max-w-2xl glass rounded-3xl border border-white/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Sign up free to download</p>
                <p className="mt-1 text-xs text-white/45">No credit card required. Your recording stays on your device.</p>
              </div>
              <button
                type="button"
                onClick={discardPendingRecording}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                {gateImage ? <img src={gateImage} alt="Signup gate" className="w-full object-cover" /> : null}
                <div className="p-4 text-xs text-white/45">
                  Recording captured locally. Create an account to enable download.
                </div>
              </div>

              <div>
                {signupError ? (
                  <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {signupError}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <a
                    href={authApi.googleLoginUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-white/15 hover:border-violet-500/40 hover:bg-white/5 transition-all text-sm font-semibold cursor-pointer"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </a>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs text-white/30">
                      <span className="glass px-3 py-0.5 rounded">
                        {authMode === "signup" ? "Or sign up with email" : "Or continue with email"}
                      </span>
                    </div>
                  </div>

                  {authMode === "signup" ? (
                    <input
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="Name"
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  ) : null}
                  <input
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <input
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder={authMode === "signup" ? "Password (min 6 chars)" : "Password"}
                    type="password"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (signupWorking) return;
                      setSignupError("");
                      setSignupWorking(true);
                      try {
                        const response = authMode === "signup"
                          ? await authApi.signup(signupEmail, signupPassword, signupName)
                          : await authApi.login(signupEmail, signupPassword);
                        const token = response.token;
                        localStorage.setItem("daytabs_token", token);
                        const blob = pendingBlobRef.current;
                        pendingBlobRef.current = null;
                        setGateImage("");
                        setDownloadGateOpen(false);
                        if (blob) downloadBlob(blob);
                      } catch (err) {
                        setSignupError(err instanceof Error ? err.message : (authMode === "signup" ? "Signup failed" : "Login failed"));
                      } finally {
                        setSignupWorking(false);
                      }
                    }}
                    disabled={!signupEmail.trim() || (authMode === "signup" ? signupPassword.length < 6 : signupPassword.length < 1) || signupWorking}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
                  >
                    {authMode === "signup" ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                    {signupWorking ? (authMode === "signup" ? "Creating account…" : "Logging in…") : (authMode === "signup" ? "Sign up & download" : "Log in & download")}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSignupError("");
                      setAuthMode((mode) => (mode === "signup" ? "login" : "signup"));
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.06] hover:text-white"
                  >
                    {authMode === "signup" ? "Already have an account? Log in" : "New here? Create a free account"}
                  </button>

                  <button
                    type="button"
                    onClick={discardPendingRecording}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-semibold text-white/55 hover:bg-white/[0.05] hover:text-white/75"
                  >
                    Not now (discard recording)
                  </button>

                  <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-200" />
                      Local-only video
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Download className="w-4 h-4 text-violet-200" />
                      Download after signup
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

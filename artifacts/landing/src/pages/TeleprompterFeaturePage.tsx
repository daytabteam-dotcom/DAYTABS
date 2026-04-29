import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Camera,
  Circle,
  Gauge,
  Clock,
  Download,
  EyeOff,
  FileText,
  GraduationCap,
  Lock,
  LogIn,
  MonitorSmartphone,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Type,
  UserPlus,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
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
  const [script, setScript] = useState(
    `Write or paste your script…\n\nTip: Keep sentences short and easy to read out loud.\n\nExample:\n“Hey — quick update. Today I’m going to show you…”`,
  );
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

        ctx.clearRect(0, 0, outputWidth, outputHeight);
        if (!vw || !vh) {
          drawRafRef.current = requestAnimationFrame(draw);
          return;
        }

        const scale = Math.min(outputWidth / vw, outputHeight / vh);
        const drawWidth = vw * scale;
        const drawHeight = vh * scale;
        const dx = (outputWidth - drawWidth) / 2;
        const dy = (outputHeight - drawHeight) / 2;
        try {
          ctx.drawImage(sourceVideo, dx, dy, drawWidth, drawHeight);
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
  const featureRef = useRef<HTMLDivElement>(null);

  const heroStartRecording = useCallback(() => {
    featureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => void beginRecord(), 250);
  }, [beginRecord]);

  const heroTryDemo = useCallback(() => {
    featureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => void beginPreview(), 250);
  }, [beginPreview]);

  const sectionMotion = useMemo(
    () => ({
      initial: { opacity: 0, y: 18 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, amount: 0.25 },
      transition: { duration: 0.5 },
    }),
    [],
  );

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

      <main className="pt-20">
        <section className="relative overflow-hidden px-6 pt-14 pb-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="absolute -bottom-56 right-[-10%] h-[520px] w-[620px] rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.20),transparent_55%)]" />
          </div>

          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <motion.div {...sectionMotion}>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/70">
                  <Sparkles className="h-4 w-4 text-violet-200" />
                  Teleprompter + recording in your browser
                </div>
                <h1 className="mt-5 max-w-xl text-5xl font-black leading-[1.05] tracking-tight">
                  Record videos without looking away from the camera.
                </h1>
                <p className="mt-5 max-w-xl text-lg text-white/60 leading-7">
                  Write a script, press record, and follow a smooth scroll. No downloads, no setup — your video stays on your device.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={heroStartRecording}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/10 hover:opacity-95"
                  >
                    <Camera className="h-4 w-4" />
                    Start Recording
                  </button>
                  <button
                    type="button"
                    onClick={heroTryDemo}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/[0.06]"
                  >
                    <Play className="h-4 w-4" />
                    Try Demo
                  </button>
                </div>

                <div className="mt-8 flex flex-wrap gap-2 text-xs text-white/55">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <Lock className="h-4 w-4" />
                    Local recording
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <MonitorSmartphone className="h-4 w-4" />
                    Works on any device
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <Clock className="h-4 w-4" />
                    Start in seconds
                  </span>
                </div>
              </motion.div>

              <motion.div {...sectionMotion} transition={{ duration: 0.55, delay: 0.05 }}>
                <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="pointer-events-none absolute -inset-6 rounded-[28px] bg-gradient-to-tr from-violet-500/15 via-fuchsia-500/10 to-transparent blur-2xl" />
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Teleprompter preview</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                        <span className="h-2 w-2 rounded-full bg-white/15" />
                      </div>
                    </div>
                    <div className="relative h-[360px] overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
                      <div className="absolute left-5 top-5 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/70 backdrop-blur">
                        <span className="dt-record-dot" />
                        REC
                      </div>
                      <div className="absolute right-5 top-5 z-10">
                        <div className="dt-record-pulse inline-flex items-center justify-center rounded-full bg-red-500/90 p-3 shadow-lg shadow-red-500/20">
                          <Camera className="h-4 w-4 text-white" />
                        </div>
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 px-5">
                        <div className="mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/55 p-2 text-xs text-white/80 backdrop-blur">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Minus className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Gauge className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Plus className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="ml-1 font-semibold text-white/70">Speed</span>
                          </div>
                          <div className="h-8 w-px bg-white/10" />
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Minus className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Type className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                              <Plus className="h-4 w-4 text-white/70" />
                            </span>
                            <span className="ml-1 font-semibold text-white/70">Text</span>
                          </div>
                        </div>
                      </div>

                      <div className="absolute inset-x-0 bottom-0 top-0 px-8 py-10">
                        <div className="dt-tele-scroll space-y-6">
                          {[
                            "Hey — quick update.",
                            "Today I’ll show you the exact setup I use…",
                            "No memorizing. No retakes.",
                            "Just press record and follow the scroll.",
                            "Download your video immediately.",
                            "Works right in your browser.",
                          ].map((line) => (
                            <p key={line} className="text-2xl font-semibold leading-relaxed text-white/90">
                              {line}
                            </p>
                          ))}
                          <div className="space-y-6">
                            {[
                              "Hey — quick update.",
                              "Today I’ll show you the exact setup I use…",
                              "No memorizing. No retakes.",
                              "Just press record and follow the scroll.",
                              "Download your video immediately.",
                              "Works right in your browser.",
                            ].map((line) => (
                              <p key={`dup-${line}`} className="text-2xl font-semibold leading-relaxed text-white/90">
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px] grid gap-6 lg:grid-cols-2">
            <motion.div {...sectionMotion} className="rounded-2xl border border-white/10 bg-gradient-to-b from-red-500/10 to-transparent p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <EyeOff className="h-5 w-5 text-red-200" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">The problem</h2>
                  <p className="mt-1 text-sm text-white/55">Reading a script breaks eye contact and flow.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  { title: "You look away from camera", icon: EyeOff },
                  { title: "You forget lines", icon: FileText },
                  { title: "You keep restarting", icon: RotateCcw },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-white/70" />
                      <div className="text-sm font-semibold text-white/85">{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...sectionMotion} className="rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/12 to-transparent p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <BadgeCheck className="h-5 w-5 text-violet-200" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">The solution</h2>
                  <p className="mt-1 text-sm text-white/55">A single view for script + record.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  { title: "Script scrolls while you speak", icon: Zap },
                  { title: "Record instantly", icon: Video },
                  { title: "Stay natural on camera", icon: Users },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-white/70" />
                      <div className="text-sm font-semibold text-white/85">{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section ref={featureRef} className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">Try it instantly</h2>
              <p className="mt-2 text-white/55 leading-7">
                Write your script on the left and follow the teleprompter on the right. Your script will start scrolling automatically when recording begins.
              </p>
            </motion.div>

            <motion.div {...sectionMotion} className="mt-8 glass rounded-2xl border border-white/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/55">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <FileText className="h-4 w-4" />
                    Script
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <Video className="h-4 w-4" />
                    Teleprompter
                  </span>
                </div>
                <div className="text-xs text-white/45">Preview first, then record when ready.</div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-sm font-bold">Your script</h3>
                  <p className="mt-2 text-xs text-white/55">Write or paste your script…</p>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    className="mt-4 w-full min-h-56 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
                  />
                  <p className="mt-3 text-xs text-white/45">
                    Your script will start scrolling automatically when recording begins.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={
                        previewing
                          ? () => {
                              setPlaying(false);
                              setPreviewing(false);
                            }
                          : beginPreview
                      }
                      disabled={recording || countdownValue !== null}
                      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                        previewing
                          ? "border-white/10 bg-white text-black"
                          : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {previewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {previewing ? "Stop demo" : "Try demo"}
                    </button>
                    {!recording ? (
                      <button
                        type="button"
                        onClick={beginRecord}
                        disabled={countdownValue !== null}
                        className="dt-record-pulse inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
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
                    {recording
                      ? "Recording locally…"
                      : countdownValue !== null
                        ? "Countdown running…"
                        : cameraReady
                          ? "Camera ready"
                          : "Camera permission requested only when you press Record"}
                    {!canDownloadNow ? " • Download requires signup" : " • Downloads enabled"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-sm font-bold">Teleprompter view</h3>
                  <p className="mt-2 text-xs text-white/55">Your text scrolls from the top when you press Record.</p>

                  <div className="mt-4 relative overflow-hidden rounded-2xl border border-white/10 bg-black min-h-[520px] shadow-xl shadow-black/40">
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
            </motion.div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">How it works</h2>
              <p className="mt-2 text-white/55 leading-7">Three simple steps from script to finished video.</p>
            </motion.div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                { step: "1", title: "Write your script", desc: "Type or paste your text — keep it short and readable.", icon: FileText },
                { step: "2", title: "Press record + follow scroll", desc: "A quick countdown, then smooth scrolling while you speak.", icon: Camera },
                { step: "3", title: "Download your video", desc: "Save locally and use it anywhere — no setup required.", icon: Download },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...sectionMotion}
                  transition={{ duration: 0.45, delay: idx * 0.05 }}
                  className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/30 hover:scale-[1.02] hover:border-white/15 transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                      <item.icon className="h-5 w-5 text-white/75" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/55">
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">Step {item.step}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm text-white/55 leading-6">{item.desc}</p>
                    </div>
                  </div>
                  {idx < 2 ? (
                    <div className="pointer-events-none absolute -right-3 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-white/10 lg:block" />
                  ) : null}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative px-6 py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.10),transparent_55%)]" />
          <div className="relative mx-auto max-w-[1200px]">
            <motion.div {...sectionMotion} className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight">Benefits</h2>
              <p className="mt-2 text-white/55 leading-7">Designed to help you record faster with better delivery.</p>
            </motion.div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: "Stay focused", desc: "No more memorizing lines.", icon: Zap },
                { title: "Record faster", desc: "Reduce retakes and restarts.", icon: Clock },
                { title: "Keep eye contact", desc: "Look natural on camera.", icon: EyeOff },
                { title: "No setup", desc: "Works instantly in your browser.", icon: MonitorSmartphone },
                { title: "Smooth delivery", desc: "Scroll at a comfortable pace.", icon: Sparkles },
                { title: "Download ready", desc: "Save your video locally.", icon: Download },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...sectionMotion}
                  transition={{ duration: 0.45, delay: idx * 0.03 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/25 backdrop-blur hover:scale-[1.02] hover:border-white/15 transition"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <item.icon className="h-5 w-5 text-white/75" />
                  </div>
                  <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/55 leading-6">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-[1200px] grid gap-6 lg:grid-cols-2">
            <motion.div {...sectionMotion} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                  <Lock className="h-5 w-5 text-violet-200" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Private by default</h2>
                  <p className="mt-1 text-sm text-white/55">Your video is recorded locally on your device.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Local recording", "No upload", "No credit card"].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/65"
                  >
                    <BadgeCheck className="h-4 w-4 text-white/70" />
                    {label}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div {...sectionMotion} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-bold">Who it’s for</h2>
              <p className="mt-1 text-sm text-white/55">Built for anyone recording speaking-to-camera videos.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { label: "YouTubers", icon: Video },
                  { label: "Founders", icon: Users },
                  { label: "Coaches", icon: BadgeCheck },
                  { label: "Educators", icon: GraduationCap },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/70 hover:bg-white/[0.04] transition"
                  >
                    <item.icon className="h-4 w-4 text-white/65" />
                    {item.label}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative overflow-hidden px-6 py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/18 blur-3xl" />
            <div className="absolute -bottom-44 left-[-10%] h-[420px] w-[520px] rounded-full bg-fuchsia-500/10 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-[900px] text-center">
            <motion.div {...sectionMotion}>
              <h2 className="text-4xl font-black tracking-tight">Ready to record your video?</h2>
              <p className="mt-3 text-lg text-white/60 leading-7">Start in seconds. No setup.</p>
              <div className="mt-8 flex items-center justify-center">
                <button
                  type="button"
                  onClick={heroStartRecording}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/10 hover:opacity-95"
                >
                  <Camera className="h-4 w-4" />
                  Start Recording
                </button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

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
                      <Lock className="w-4 h-4 text-emerald-200" />
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

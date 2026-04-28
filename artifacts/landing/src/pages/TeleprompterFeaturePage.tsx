import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Camera, Circle, Download, Play, Pause, RotateCcw, ShieldCheck, UserPlus, X } from "lucide-react";
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
  const [, navigate] = useLocation();

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

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
      const isPortrait = window.innerHeight > window.innerWidth;
      const idealWidth = isPortrait ? 720 : 1280;
      const idealHeight = isPortrait ? 1280 : 720;
      const videoConstraints: MediaTrackConstraints = { facingMode: "user" };
      if (supported.width) videoConstraints.width = { ideal: idealWidth };
      if (supported.height) videoConstraints.height = { ideal: idealHeight };
      if (supported.aspectRatio) videoConstraints.aspectRatio = idealWidth / idealHeight;
      if ((supported as any).resizeMode) (videoConstraints as any).resizeMode = "crop-and-scale";

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
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
      const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const nextMimeType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: nextMimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        setPlaying(false);
        setPreviewing(false);
        stopMediaTracks();

        if (blob.size <= 0) return;
        const token = asToken();
        if (!token) {
          pendingBlobRef.current = blob;
          setGateImage(await createSignupGateImage());
          setDownloadGateOpen(true);
          return;
        }
        downloadBlob(blob);
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

    const ready = cameraReady || await startCamera();
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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      <div className="pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-white/40">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Features</span>
              <span>/</span>
              <span>Teleprompter</span>
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-black leading-tight">Teleprompter + record (local)</h1>
            <p className="mt-4 text-white/55 leading-7">
              Paste your script, press Record, approve camera permission, then you’ll get a 3–2–1 countdown and local recording starts.
              Your video stays on your device — we only ask you to create a free account to unlock the download.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/55">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <ShieldCheck className="w-4 h-4 text-emerald-200" />
                Local recording
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <UserPlus className="w-4 h-4 text-violet-200" />
                No credit card required
              </span>
            </div>
          </motion.div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-3xl border border-white/10 p-6">
              <h2 className="text-lg font-bold">Your script</h2>
              <p className="mt-2 text-sm text-white/55">Paste your script and start recording. Download unlocks after signup.</p>
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
        </div>
      </div>

      {downloadGateOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDownloadGateOpen(false)}
            aria-label="Close signup gate"
          />
          <div className="relative w-full max-w-2xl glass rounded-3xl border border-white/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Download unlocked after signup</p>
                <p className="mt-1 text-xs text-white/45">No credit card required. Your recording stays on your device.</p>
              </div>
              <button
                type="button"
                onClick={() => setDownloadGateOpen(false)}
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
                  <input
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Name"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
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
                    placeholder="Password (min 6 chars)"
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
                        const { token } = await authApi.signup(signupEmail, signupPassword, signupName);
                        localStorage.setItem("daytabs_token", token);
                        const blob = pendingBlobRef.current;
                        pendingBlobRef.current = null;
                        setDownloadGateOpen(false);
                        if (blob) downloadBlob(blob);
                      } catch (err) {
                        setSignupError(err instanceof Error ? err.message : "Signup failed");
                      } finally {
                        setSignupWorking(false);
                      }
                    }}
                    disabled={!signupEmail.trim() || signupPassword.length < 6 || signupWorking}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    {signupWorking ? "Creating account…" : "Sign up & download"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Keep the blob in memory but allow the user to use the full signup page if they prefer.
                      navigate("/signup");
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.06] hover:text-white"
                  >
                    Go to signup page
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


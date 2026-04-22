import { useState, useCallback, useRef } from "react";

export interface VideoUploadOptions {
  mode: string;
  platform?: string;
  platforms?: string[];
  modules?: string[];
  durationSeconds?: number;
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  audioLanguage?: string;
  audioVoice?: string;
}

export interface UploadProgressInfo {
  phase: "uploading" | "assembling";
  pct: number;
  mbUploaded: number;
  totalMb: number;
  etaSec: number | null;
  retrying: boolean;
}

function getAuthToken(): string | null {
  return localStorage.getItem("daytabs_token");
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const CHUNK_SIZE = 5 * 1024 * 1024;
const INIT_TIMEOUT_MS = 20_000;
const COMPLETE_TIMEOUT_MS = 90_000;
const UPLOAD_STALL_TIMEOUT_MS = 90_000;
const UPLOAD_HARD_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function getHttpErrorMessage(status: number, fallback: string) {
  if (status === 502) {
    return "Upload service is temporarily unavailable (HTTP 502). This often happens during a deploy or when the upload service restarts. Please wait a minute and try again.";
  }
  if (status === 503 || status === 504) {
    return "Upload service timed out or is temporarily unavailable. Please try again in a minute.";
  }
  return fallback;
}

async function readErrorBody(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await res.json().catch(() => ({}));
  }
  const text = await res.text().catch(() => "");
  return text ? { error: text.slice(0, 240) } : {};
}

function shouldTryLegacyFallback(err: unknown) {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("cloudflare upload failed") ||
    message.includes("upload stalled") ||
    message.includes("server did not confirm") ||
    message.includes("assembly failed")
  );
}

async function uploadViaLegacyEndpoint(
  file: File,
  options: VideoUploadOptions,
  onAbortReady: (abort: () => void) => void
) {
  const controller = new AbortController();
  onAbortReady(() => controller.abort());

  const formData = new FormData();
  formData.append("video", file);
  formData.append("mode", options.mode);
  formData.append("platform", options.platform ?? options.platforms?.[0] ?? "youtube_long");
  formData.append("platforms", JSON.stringify(options.platforms ?? (options.platform ? [options.platform] : ["youtube_long"])));
  formData.append("modules", JSON.stringify(options.modules ?? ["quality", "editing"]));

  if (options.translateSubtitles !== undefined) {
    formData.append("translateSubtitles", String(options.translateSubtitles));
  }
  if (options.subtitleLanguage) {
    formData.append("subtitleLanguage", options.subtitleLanguage);
  }
  if (options.audioLanguage) {
    formData.append("audioLanguage", options.audioLanguage);
  }
  if (options.audioVoice) {
    formData.append("audioVoice", options.audioVoice);
  }

  const res = await fetch("/api/analysis/upload", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
    signal: controller.signal,
  }).catch((err) => {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Upload cancelled");
    }
    throw err;
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    const err = new Error(
      body.message ??
      body.error ??
      getHttpErrorMessage(res.status, `Fallback upload failed (HTTP ${res.status})`)
    );
    if ((body as { code?: string }).code) (err as any).structured = body;
    throw err;
  }

  return res.json() as Promise<{ jobId: string }>;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  onAbortReady: (abort: () => void) => void
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  onAbortReady(() => controller.abort());

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(timedOut ? timeoutMessage : "Upload cancelled");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

function uploadToSignedUrl({
  uploadUrl,
  file,
  onProgress,
  onAbortReady,
}: {
  uploadUrl: string;
  file: File;
  onProgress: (loaded: number) => void;
  onAbortReady: (abort: () => void) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: number | undefined;

    const cleanup = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const resetStallTimer = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        xhr.abort();
        rejectOnce(new Error("Upload stalled for more than 90 seconds. Please check your connection and try again."));
      }, UPLOAD_STALL_TIMEOUT_MS);
    };

    onAbortReady(() => {
      xhr.abort();
      rejectOnce(new Error("Upload cancelled"));
    });

    xhr.upload.onprogress = (event) => {
      resetStallTimer();
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolveOnce();
      } else {
        rejectOnce(new Error(getHttpErrorMessage(xhr.status, `Cloudflare upload failed (HTTP ${xhr.status})`)));
      }
    };
    xhr.onerror = () => rejectOnce(new Error("Cloudflare upload failed. Check your connection and try again."));
    xhr.ontimeout = () => rejectOnce(new Error("Upload took too long and was cancelled. Please try again with a smaller file or a more stable connection."));
    xhr.onabort = () => rejectOnce(new Error("Upload cancelled"));
    xhr.open("PUT", uploadUrl);
    xhr.timeout = UPLOAD_HARD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    resetStallTimer();
    xhr.send(file);
  });
}

export function useVideoUpload() {
  const [isPending, setIsPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const cancelledRef = useRef(false);
  const uploadIdRef = useRef<string | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
    abortUploadRef.current?.();
    const id = uploadIdRef.current;
    if (id) {
      fetch(`/api/upload/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      }).catch(() => {});
    }
  }, []);

  const uploadAsync = useCallback(
    async ({
      file,
      options,
    }: {
      file: File;
      options: VideoUploadOptions;
    }): Promise<{ jobId: string }> => {
      cancelledRef.current = false;
      uploadIdRef.current = null;
      setIsPending(true);
      setError(null);
      setUploadProgress(1);
      setUploadInfo(null);
      let cleanupRemoteUploadOnError = true;

      try {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const totalMb = file.size / (1024 * 1024);

        const initBody = {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/mp4",
          totalChunks,
          mode: options.mode,
          durationSeconds: options.durationSeconds ?? null,
          platforms: JSON.stringify(
            options.platforms ?? (options.platform ? [options.platform] : ["youtube_long"])
          ),
          modules: JSON.stringify(options.modules ?? ["quality", "editing"]),
          translateSubtitles: options.translateSubtitles ?? false,
          subtitleLanguage: options.subtitleLanguage ?? null,
          audioLanguage: options.audioLanguage ?? null,
          audioVoice: options.audioVoice ?? "alloy",
        };

        const initRes = await fetchWithTimeout(
          "/api/upload/init",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(initBody),
          },
          INIT_TIMEOUT_MS,
          "Upload could not start because the server did not respond. Please try again in a minute.",
          (abort) => {
            abortUploadRef.current = abort;
          }
        );

        if (!initRes.ok) {
          const body = await readErrorBody(initRes);
          const err = new Error(
            body.message ??
              body.error ??
              getHttpErrorMessage(initRes.status, `Upload init failed (HTTP ${initRes.status})`)
          );
          if (body.code) (err as any).structured = body;
          throw err;
        }

        const { uploadId, uploadUrl } = await initRes.json();
        if (!uploadUrl) throw new Error("Upload URL was not returned by the server");
        uploadIdRef.current = uploadId;

        if (cancelledRef.current) throw new Error("Upload cancelled");

        const startTime = Date.now();
        setUploadInfo({
          phase: "uploading",
          pct: 1,
          mbUploaded: 0,
          totalMb,
          etaSec: null,
          retrying: false,
        });

        await uploadToSignedUrl({
          uploadUrl,
          file,
          onAbortReady: (abort) => {
            abortUploadRef.current = abort;
          },
          onProgress: (bytesUploaded) => {
            const pct = Math.max(1, Math.min(100, Math.round((bytesUploaded / file.size) * 100)));
            setUploadProgress(pct);

            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
            const remaining = file.size - bytesUploaded;
            const etaSec = speed > 0 ? Math.round(remaining / speed) : null;

            setUploadInfo({
              phase: "uploading",
              pct,
              mbUploaded: bytesUploaded / (1024 * 1024),
              totalMb,
              etaSec,
              retrying: false,
            });
          },
        });

        if (cancelledRef.current) throw new Error("Upload cancelled");

        setUploadProgress(100);
        cleanupRemoteUploadOnError = false;

        setUploadInfo({
          phase: "assembling",
          pct: 100,
          mbUploaded: totalMb,
          totalMb,
          etaSec: null,
          retrying: false,
        });

        const completeRes = await fetchWithTimeout(
          "/api/upload/complete",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ uploadId }),
          },
          COMPLETE_TIMEOUT_MS,
          "Upload finished, but the server did not confirm it in time. Please refresh the page to reconnect to the analysis.",
          (abort) => {
            abortUploadRef.current = abort;
          }
        );

        if (!completeRes.ok) {
          const body = await readErrorBody(completeRes);
          const err = new Error(
            body.message ??
              body.error ??
              getHttpErrorMessage(completeRes.status, `Assembly failed (HTTP ${completeRes.status})`)
          );
          if (body.code) (err as any).structured = body;
          throw err;
        }

        const { jobId } = await completeRes.json();
        uploadIdRef.current = null;
        return { jobId };
      } catch (err: any) {
        const id = uploadIdRef.current;
        if (id && (cancelledRef.current || cleanupRemoteUploadOnError)) {
          fetch(`/api/upload/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
          }).catch(() => {});
          uploadIdRef.current = null;
        }

        if (!cancelledRef.current && shouldTryLegacyFallback(err)) {
          try {
            setUploadInfo({
              phase: "assembling",
              pct: 100,
              mbUploaded: file.size / (1024 * 1024),
              totalMb: file.size / (1024 * 1024),
              etaSec: null,
              retrying: true,
            });
            const fallback = await uploadViaLegacyEndpoint(file, options, (abort) => {
              abortUploadRef.current = abort;
            });
            setError(null);
            return fallback;
          } catch (fallbackErr) {
            const finalErr = fallbackErr instanceof Error ? fallbackErr : new Error("Upload failed");
            setError(finalErr);
            throw finalErr;
          }
        }

        const finalErr = cancelledRef.current ? new Error("Upload cancelled") : err;
        setError(finalErr);
        throw finalErr;
      } finally {
        setIsPending(false);
        setUploadInfo(null);
        abortUploadRef.current = null;
      }
    },
    []
  );

  const resetUpload = useCallback(() => {
    setIsPending(false);
    setUploadProgress(0);
    setUploadInfo(null);
    setError(null);
    cancelledRef.current = false;
    uploadIdRef.current = null;
  }, []);

  return {
    uploadAsync,
    isPending,
    isError: !!error,
    error,
    uploadProgress,
    uploadInfo,
    cancelUpload,
    resetUpload,
  };
}

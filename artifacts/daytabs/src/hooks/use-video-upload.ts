import { useState, useCallback, useRef } from "react";

export interface VideoUploadOptions {
  mode: string;
  platform?: string;
  platforms?: string[];
  modules?: string[];
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

export function useVideoUpload() {
  const [isPending, setIsPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const cancelledRef = useRef(false);
  const uploadIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
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

      try {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const totalMb = file.size / (1024 * 1024);

        const initBody = {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/mp4",
          totalChunks,
          mode: options.mode,
          platforms: JSON.stringify(
            options.platforms ?? (options.platform ? [options.platform] : ["youtube_long"])
          ),
          modules: JSON.stringify(options.modules ?? ["quality", "editing"]),
          translateSubtitles: options.translateSubtitles ?? false,
          subtitleLanguage: options.subtitleLanguage ?? null,
          audioLanguage: options.audioLanguage ?? null,
          audioVoice: options.audioVoice ?? "alloy",
        };

        const initRes = await fetch("/api/upload/init", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(initBody),
        });

        if (!initRes.ok) {
          const body = await initRes.json().catch(() => ({}));
          const err = new Error(
            body.message ?? body.error ?? `Upload init failed (HTTP ${initRes.status})`
          );
          if (body.code) (err as any).structured = body;
          throw err;
        }

        const { uploadId } = await initRes.json();
        uploadIdRef.current = uploadId;

        if (cancelledRef.current) throw new Error("Upload cancelled");

        const startTime = Date.now();
        let bytesUploaded = 0;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (cancelledRef.current) throw new Error("Upload cancelled");

          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          let attempts = 0;
          let success = false;

          while (attempts < 3 && !success) {
            if (cancelledRef.current) throw new Error("Upload cancelled");

            if (attempts > 0) {
              setUploadInfo((prev) => prev ? { ...prev, retrying: true } : null);
              await new Promise((r) => setTimeout(r, 1000));
            }

            const ac = new AbortController();
            abortControllerRef.current = ac;

            try {
              const form = new FormData();
              form.append("uploadId", uploadId);
              form.append("chunkIndex", String(chunkIndex));
              form.append("totalChunks", String(totalChunks));
              form.append("chunk", chunk, `chunk_${chunkIndex}`);

              const chunkRes = await fetch("/api/upload/chunk", {
                method: "POST",
                headers: authHeaders(),
                body: form,
                signal: ac.signal,
              });

              if (!chunkRes.ok) {
                const body = await chunkRes.json().catch(() => ({}));
                throw new Error(body.error ?? `Chunk ${chunkIndex} failed (HTTP ${chunkRes.status})`);
              }

              success = true;
            } catch (fetchErr: any) {
              if (fetchErr.name === "AbortError" || cancelledRef.current) {
                throw new Error("Upload cancelled");
              }
              attempts++;
              if (attempts >= 3) {
                throw new Error(
                  `Upload failed after 3 attempts on chunk ${chunkIndex + 1}. Check your connection and try again.`
                );
              }
            }
          }

          bytesUploaded += chunk.size;
          const pct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
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
        }

        if (cancelledRef.current) throw new Error("Upload cancelled");

        setUploadInfo({
          phase: "assembling",
          pct: 100,
          mbUploaded: totalMb,
          totalMb,
          etaSec: null,
          retrying: false,
        });

        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ uploadId }),
        });

        if (!completeRes.ok) {
          const body = await completeRes.json().catch(() => ({}));
          const err = new Error(
            body.message ?? body.error ?? `Assembly failed (HTTP ${completeRes.status})`
          );
          if (body.code) (err as any).structured = body;
          throw err;
        }

        const { jobId } = await completeRes.json();
        uploadIdRef.current = null;
        return { jobId };
      } catch (err: any) {
        setError(err);
        throw err;
      } finally {
        setIsPending(false);
        setUploadInfo(null);
        abortControllerRef.current = null;
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

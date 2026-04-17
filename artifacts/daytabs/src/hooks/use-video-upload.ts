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
    onAbortReady(() => xhr.abort());

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error(`Cloudflare upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Cloudflare upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
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

        const { uploadId, uploadUrl } = await initRes.json();
        if (!uploadUrl) throw new Error("Upload URL was not returned by the server");
        uploadIdRef.current = uploadId;

        if (cancelledRef.current) throw new Error("Upload cancelled");

        const startTime = Date.now();
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
        const id = uploadIdRef.current;
        if (id) {
          fetch(`/api/upload/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
          }).catch(() => {});
          uploadIdRef.current = null;
        }
        setError(err);
        throw err;
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

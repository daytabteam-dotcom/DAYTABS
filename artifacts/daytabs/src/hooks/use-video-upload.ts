import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { getUploadVideoUrl } from "@workspace/api-client-react";

export interface VideoUploadOptions {
  mode: string;
  platform?: string;
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  audioLanguage?: string;
  audioVoice?: string;
}

/**
 * Upload a video for analysis.
 *
 * Preferred flow (Cloudflare R2 direct upload — requires CORS on the bucket):
 *   1. GET /api/analysis/presign-upload  → presigned PUT URL + fileKey
 *   2. PUT directly to R2 with XHR (real progress %)
 *   3. POST /api/analysis/start          → jobId
 *
 * Automatic fallback (legacy multipart, always works):
 *   - When R2 is not configured (/presign-upload returns 503)
 *   - When the XHR PUT fails (e.g. CORS not yet configured on the bucket)
 *   → POST /api/analysis/upload          → jobId
 */
export function useVideoUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);

  const reset = useCallback(() => setUploadProgress(0), []);

  const mutation = useMutation({
    mutationFn: async ({
      file,
      options,
    }: {
      file: File;
      options: VideoUploadOptions;
    }): Promise<{ jobId: string }> => {
      setUploadProgress(0);

      // ── Step 1: Try to get a presigned R2 URL ──────────────────────────────
      const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
      let useR2 = false;
      let uploadUrl = "";
      let fileKey = "";

      try {
        const presignRes = await fetch(`/api/analysis/presign-upload?ext=${ext}`);
        if (presignRes.ok) {
          const body = (await presignRes.json()) as { uploadUrl: string; fileKey: string };
          uploadUrl = body.uploadUrl;
          fileKey = body.fileKey;
          useR2 = true;
        }
      } catch {
        // network error fetching presign — fall through to multipart
      }

      // ── Step 2a: R2 direct PUT (if presign succeeded) ─────────────────────
      if (useR2) {
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                setUploadProgress(Math.round((e.loaded / e.total) * 93));
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`R2 upload returned HTTP ${xhr.status}`));
              }
            });

            xhr.addEventListener("error", () =>
              reject(new Error("R2 network error (CORS may not be configured)"))
            );
            xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
            xhr.send(file);
          });

          setUploadProgress(96);

          // Tell the backend to start processing the uploaded R2 object
          const startRes = await fetch("/api/analysis/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileKey,
              mode: options.mode,
              platform: options.platform ?? "youtube_long",
              translateSubtitles: options.translateSubtitles ?? false,
              subtitleLanguage: options.subtitleLanguage,
              audioLanguage: options.audioLanguage,
              audioVoice: options.audioVoice,
            }),
          });

          if (!startRes.ok) {
            const e = (await startRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(e.error ?? "Failed to start analysis");
          }

          setUploadProgress(100);
          return startRes.json() as Promise<{ jobId: string }>;
        } catch (r2Err) {
          // R2 PUT failed (most likely CORS) — fall through to multipart
          console.warn("[upload] R2 direct upload failed, falling back to multipart:", r2Err);
          setUploadProgress(0);
        }
      }

      // ── Step 2b: Legacy multipart fallback ────────────────────────────────
      const form = new FormData();
      form.append("video", file);
      form.append("mode", options.mode);
      form.append("platform", options.platform ?? "youtube_long");
      if (options.translateSubtitles) form.append("translateSubtitles", "true");
      if (options.subtitleLanguage) form.append("subtitleLanguage", options.subtitleLanguage);
      if (options.audioLanguage) form.append("audioLanguage", options.audioLanguage);
      if (options.audioVoice) form.append("audioVoice", options.audioVoice);

      const fakeInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 3, 85));
      }, 500);

      try {
        const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
        if (!res.ok) {
          const e = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(e.error ?? "Upload failed");
        }
        setUploadProgress(100);
        return res.json() as Promise<{ jobId: string }>;
      } finally {
        clearInterval(fakeInterval);
      }
    },

    onMutate: () => setUploadProgress(1),
  });

  return {
    upload: mutation.mutate,
    uploadAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    uploadProgress,
    resetUpload: () => {
      mutation.reset();
      reset();
    },
  };
}

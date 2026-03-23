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
 * Flow when Cloudflare R2 is configured (preferred):
 *   1. GET /api/analysis/presign-upload  → presigned PUT URL + fileKey
 *   2. PUT directly to R2 (with XHR progress)
 *   3. POST /api/analysis/start          → jobId (backend downloads from R2, deletes it, runs pipeline)
 *
 * Fallback (legacy multipart upload, used when R2 is not configured):
 *   1. POST /api/analysis/upload         → jobId
 */
export function useVideoUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);

  const reset = useCallback(() => setUploadProgress(0), []);

  const mutation = useMutation({
    mutationFn: async ({ file, options }: { file: File; options: VideoUploadOptions }): Promise<{ jobId: string }> => {
      setUploadProgress(0);

      // ── Try R2 presigned upload ────────────────────────────────────────────
      const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
      const presignRes = await fetch(`/api/analysis/presign-upload?ext=${ext}`);

      if (presignRes.ok) {
        const { uploadUrl, fileKey } = await presignRes.json() as { uploadUrl: string; fileKey: string };

        // Upload directly to R2 using XHR (supports progress events)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              // Reserve last 5 % for the /start call
              setUploadProgress(Math.round((e.loaded / e.total) * 93));
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Cloud upload failed (HTTP ${xhr.status})`));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
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
          const e = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(e.error ?? "Failed to start analysis");
        }

        setUploadProgress(100);
        return startRes.json() as Promise<{ jobId: string }>;
      }

      // ── Fallback: direct multipart upload ─────────────────────────────────
      // R2 returned 503 (not configured) — use legacy endpoint
      const form = new FormData();
      form.append("video", file);
      form.append("mode", options.mode);
      form.append("platform", options.platform ?? "youtube_long");
      if (options.translateSubtitles) form.append("translateSubtitles", "true");
      if (options.subtitleLanguage) form.append("subtitleLanguage", options.subtitleLanguage);
      if (options.audioLanguage) form.append("audioLanguage", options.audioLanguage);
      if (options.audioVoice) form.append("audioVoice", options.audioVoice);

      // Simulate upload progress for the fallback (no XHR → no real progress)
      const fakeInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 3, 85));
      }, 500);

      try {
        const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
        if (!res.ok) {
          const e = await res.json().catch(() => ({})) as { error?: string };
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
    resetUpload: () => { mutation.reset(); reset(); },
  };
}

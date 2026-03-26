import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

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

function getAuthToken(): string | null {
  return localStorage.getItem("daytabs_token");
}

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

      const form = new FormData();
      form.append("video", file);
      form.append("mode", options.mode);
      form.append("platform", options.platforms?.[0] ?? options.platform ?? "youtube_long");
      form.append("platforms", JSON.stringify(options.platforms ?? (options.platform ? [options.platform] : ["youtube_long"])));
      form.append("modules", JSON.stringify(options.modules ?? ["quality", "editing"]));
      if (options.translateSubtitles) form.append("translateSubtitles", "true");
      if (options.subtitleLanguage) form.append("subtitleLanguage", options.subtitleLanguage);
      if (options.audioLanguage) form.append("audioLanguage", options.audioLanguage);
      if (options.audioVoice) form.append("audioVoice", options.audioVoice);

      return new Promise<{ jobId: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Real upload progress, maps the upload phase to 0–92%
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 92));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            try {
              resolve(JSON.parse(xhr.responseText) as { jobId: string });
            } catch {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const body = JSON.parse(xhr.responseText) as {
                error?: string;
                code?: string;
                title?: string;
                message?: string;
                action?: unknown;
                meta?: unknown;
              };
              if (body.code) {
                const err = new Error(body.message ?? body.error ?? `Upload failed (HTTP ${xhr.status})`);
                (err as any).structured = body;
                reject(err);
              } else {
                reject(new Error(body.error ?? `Upload failed (HTTP ${xhr.status})`));
              }
            } catch {
              reject(new Error(`Upload failed (HTTP ${xhr.status})`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload. Check your connection and try again."));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload was cancelled."));
        });

        xhr.addEventListener("timeout", () => {
          reject(new Error("Upload timed out. The file may be too large or your connection is too slow."));
        });

        // 60 minute timeout, supports up to 2GB on slow connections
        xhr.timeout = 60 * 60 * 1000;

        xhr.open("POST", "/api/analysis/upload");

        const token = getAuthToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.send(form);
      });
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

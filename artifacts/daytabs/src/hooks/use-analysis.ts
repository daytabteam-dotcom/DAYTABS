import { useMutation } from "@tanstack/react-query";
import { 
  getUploadVideoUrl, 
  UploadVideoBody, 
  useGetAnalysisStatus, 
  useGetAnalysisResult,
  useExportVideo
} from "@workspace/api-client-react";

/**
 * Custom hook to handle file uploads properly since the generated Orval 
 * hook doesn't explicitly accept the File object in its generated typescript signature.
 */
export function useUploadVideoWithFile() {
  return useMutation({
    mutationFn: async ({ file, options }: { file: File; options: UploadVideoBody }) => {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("platform", options.platform);
      
      if (options.translateSubtitles !== undefined) {
        formData.append("translateSubtitles", String(options.translateSubtitles));
      }
      if (options.subtitleLanguage) {
        formData.append("subtitleLanguage", options.subtitleLanguage);
      }
      if (options.replaceAudio !== undefined) {
        formData.append("replaceAudio", String(options.replaceAudio));
      }
      if (options.audioLanguage) {
        formData.append("audioLanguage", options.audioLanguage);
      }

      const res = await fetch(getUploadVideoUrl(), {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type header; the browser sets it automatically with the multipart boundary
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || "Failed to upload video");
      }

      return res.json() as Promise<{ jobId: string; message: string }>;
    }
  });
}

/**
 * Hook to poll analysis status until it is complete or errored.
 */
export function useAnalysisPolling(jobId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useGetAnalysisStatus(jobId!, {
    query: {
      enabled: !!jobId,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        if (status === "complete" || status === "error" || status === "cancelled") {
          return false; // Stop polling
        }
        return 2000; // Poll every 2 seconds
      }
    } as any
  });
}

/**
 * Hook to fetch final results once analysis is complete.
 */
export function useAnalysisResults(jobId: string | null, isComplete: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useGetAnalysisResult(jobId!, {
    query: {
      enabled: !!jobId && isComplete,
      staleTime: Infinity, // Don't refetch results once we have them
    } as any
  });
}

// Re-export standard hooks
export { useExportVideo };

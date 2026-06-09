export type AudioTranscriptProject = {
  id: string;
  userId: number;
  title: string;
  audioFileUrl: string | null;
  audioFileName: string | null;
  audioFileSize: number | null;
  audioDurationSeconds: number | null;
  sourceLanguage: string | null;
  detectedLanguage: string | null;
  status: "uploaded" | "transcribing" | "completed" | "failed" | string;
  fullTranscript: string | null;
  transcriptSegments: unknown;
  audioDeleted: boolean;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptSegment = {
  id: number;
  start_time: string;
  end_time: string;
  text: string;
};

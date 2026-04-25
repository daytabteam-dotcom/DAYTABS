declare module "youtube-transcript/dist/youtube-transcript.esm.js" {
  export interface YoutubeTranscriptRow {
    text?: string | null;
    lang?: string | null;
    offset?: number | null;
    duration?: number | null;
  }

  export function fetchTranscript(
    videoId: string,
    options?: { lang?: string | null },
  ): Promise<YoutubeTranscriptRow[]>;
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  ImagePlus,
  Lightbulb,
  Loader2,
  Upload,
  Search,
  Sparkles,
  Tag,
  Target,
  X,
  Youtube,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { PanelCard, PanelCardSoft, PanelHeader, PanelPage, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type AuditReport = {
  summary: string;
  video: {
    title: string;
    channelName: string;
    publishedAt: string | null;
    duration: string | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    tags: string[];
    description: string;
    thumbnailUrl: string | null;
    niche: string;
    contentStyle: string;
    targetAudience: string;
    likelyFormat: string;
  };
  nicheInference: {
    label: string;
    confidence: "high" | "medium" | "low";
    basis: string;
  };
  transcript: {
    available: boolean;
    source: "manual" | "auto" | "uploaded" | null;
    language: string | null;
    text: string | null;
    segments: Array<{ start: number; end: number; text: string }>;
    translations: Array<{
      targetLanguage: string;
      sourceLanguage: string | null;
      fullText: string;
      segments: Array<{ start: number; end: number; text: string }>;
      createdAt: string;
    }>;
  };
  performanceContext: {
    ageDays: number | null;
    viewsPerDay: number | null;
    channelMedianViews: number | null;
    competitorMedianViews: number | null;
  };
  topCreators: Array<{
    channelName: string;
    subscriberCount: number;
    averageViews: number;
    whyTheyMatter: string;
  }>;
  competitorExamples: Array<{
    title: string;
    channelName: string;
    url: string;
    viewCount: number;
    whyItWins: string;
  }>;
  visualAudit: {
    basis: "thumbnail_only";
    topFix: string;
    lighting: string;
    framing: string;
    sharpness: string;
  } | null;
  diagnosis: Array<{
    area: string;
    issue: string;
    whyItHurts: string;
    evidence: string;
    recommendedChange: string;
    confidence: "high" | "medium" | "low";
    sourceLabel: string;
    priority: 1 | 2 | 3;
  }>;
  fixes: {
    titles: string[];
    description: string;
    tags: string[];
    thumbnailIdea: string;
    recommendedThumbnailStyle: string;
    hookRewrite: string;
    scriptDirection: string;
    qualityFixes: string[];
    packagingStrategy: string;
  };
  limitations: string[];
};

type AuditPreview = {
  video: {
    id: string;
    title: string;
    channelName: string;
    channelId: string | null;
    publishedAt: string | null;
    duration: string | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    tags: string[];
    description: string;
    thumbnailUrl: string | null;
    likelyFormat: string;
  };
  nicheInference: {
    label: string;
    confidence: "high" | "medium" | "low";
    basis: string;
  };
  recommendedThumbnailStyle: string;
  transcript: {
    available: boolean;
    source: "manual" | "auto" | "uploaded" | null;
    language: string | null;
  };
};

type ThumbnailSourceImage = {
  name: string;
  dataUrl: string;
};

type GeneratedAuditThumbnail = {
  imageDataUrl: string;
  prompt: string;
  requestedText: string | null;
  selectedStyle: string | null;
  preserveUploadedImage: boolean;
  createdAt: string;
};

type SavedAuditCard = {
  id: string;
  videoUrl: string;
  savedAt: string;
  preview: AuditPreview;
  report: AuditReport;
  generatedThumbnail: GeneratedAuditThumbnail | null;
};

type TranslationAudioResult = {
  downloadUrl: string;
  filename: string;
  voice: string;
};

const AUDIT_HISTORY_KEY = "daytabs_youtube_audit_history_v1";
const THUMBNAIL_STYLES = ["Professional", "Realistic", "Minimal", "Cartoon", "Cinematic", "Bold"] as const;
const TRANSLATION_LANGUAGES = [
  "Turkish",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
  "Hindi",
  "Japanese",
  "Korean",
  "Dutch",
  "Russian",
];
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const YOUTUBE_THUMBNAIL_WIDTH = 1280;
const YOUTUBE_THUMBNAIL_HEIGHT = 720;
const YOUTUBE_THUMBNAIL_MIN_WIDTH = 640;
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("daytabs_token");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

async function downloadAuthenticatedFile(url: string, filename: string) {
  const token = localStorage.getItem("daytabs_token");
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error || "Download failed");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function formatNumber(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function confidenceClass(value: "high" | "medium" | "low") {
  if (value === "high") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (value === "medium") return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  return "border-red-400/20 bg-red-500/10 text-red-200";
}

function priorityLabel(value: 1 | 2 | 3) {
  if (value === 1) return "Start here";
  if (value === 2) return "Next";
  return "Lower priority";
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function thumbnailDownloadExtension(dataUrl: string) {
  return dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
}

function buildAuditStorageId(videoId: string, savedAt: string) {
  return `${videoId}:${savedAt}`;
}

function formatTranscriptTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseTranscriptTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  return null;
}

function loadSavedAudits(): SavedAuditCard[] {
  try {
    const raw = localStorage.getItem(AUDIT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeSavedAuditCard) : [];
  } catch {
    return [];
  }
}

function persistSavedAudits(cards: SavedAuditCard[]) {
  localStorage.setItem(AUDIT_HISTORY_KEY, JSON.stringify(cards.slice(0, 10)));
}

function normalizeSavedAuditCard(card: SavedAuditCard): SavedAuditCard {
  return {
    ...card,
    report: {
      ...card.report,
      transcript: {
        ...card.report.transcript,
        segments: Array.isArray(card.report.transcript?.segments) ? card.report.transcript.segments : [],
        translations: Array.isArray(card.report.transcript?.translations) ? card.report.transcript.translations : [],
      },
    },
  };
}

async function resizeImageFileToDataUrl(file: File) {
  if (!/^image\/(jpeg|jpg)$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) {
    throw new Error("Source images must be JPG files.");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      const image = new Image();
      image.onerror = () => reject(new Error(`Could not load ${file.name}`));
      image.onload = () => {
        if (image.width < YOUTUBE_THUMBNAIL_MIN_WIDTH) {
          reject(new Error(`${file.name} must be at least ${YOUTUBE_THUMBNAIL_MIN_WIDTH}px wide.`));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = YOUTUBE_THUMBNAIL_WIDTH;
        canvas.height = YOUTUBE_THUMBNAIL_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error(`Could not process ${file.name}`));
          return;
        }

        const coverScale = Math.max(canvas.width / image.width, canvas.height / image.height);
        const coverWidth = image.width * coverScale;
        const coverHeight = image.height * coverScale;
        context.save();
        context.filter = "blur(18px) brightness(0.72)";
        context.drawImage(image, (canvas.width - coverWidth) / 2, (canvas.height - coverHeight) / 2, coverWidth, coverHeight);
        context.restore();
        context.fillStyle = "rgba(0, 0, 0, 0.18)";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const containScale = Math.min(canvas.width / image.width, canvas.height / image.height);
        const containWidth = image.width * containScale;
        const containHeight = image.height * containScale;
        context.drawImage(image, (canvas.width - containWidth) / 2, (canvas.height - containHeight) / 2, containWidth, containHeight);

        let quality = 0.9;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrlBytes(dataUrl) > YOUTUBE_THUMBNAIL_MAX_BYTES && quality > 0.6) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrlBytes(dataUrl) > YOUTUBE_THUMBNAIL_MAX_BYTES) {
          reject(new Error(`${file.name} could not be compressed under 2 MB as a JPG thumbnail.`));
          return;
        }
        resolve(dataUrl);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export default function YouTubeAuditTab() {
  const { plan, loading: planLoading } = usePlan();
  const [videoUrl, setVideoUrl] = useState("");
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [savedAudits, setSavedAudits] = useState<SavedAuditCard[]>([]);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailTextPreference, setThumbnailTextPreference] = useState("");
  const [thumbnailSourceImages, setThumbnailSourceImages] = useState<ThumbnailSourceImage[]>([]);
  const [preserveThumbnailSourceImage, setPreserveThumbnailSourceImage] = useState(true);
  const [thumbnailStyle, setThumbnailStyle] = useState<string>("Professional");
  const [generatedThumbnail, setGeneratedThumbnail] = useState<GeneratedAuditThumbnail | null>(null);
  const [thumbnailWorking, setThumbnailWorking] = useState(false);
  const [transcriptWorking, setTranscriptWorking] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("Turkish");
  const [translationVoice, setTranslationVoice] = useState<(typeof OPENAI_VOICES)[number]>("alloy");
  const [translationWorking, setTranslationWorking] = useState(false);
  const [translationAudioWorking, setTranslationAudioWorking] = useState(false);
  const [translationAudio, setTranslationAudio] = useState<TranslationAudioResult | null>(null);

  const isStudio = plan.isStudio;
  const exportBaseName = (preview?.video.title || report?.video.title || "youtube-audit")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "youtube-audit";
  const { ref: pdfExportRef, exportPdf, isExporting: isPdfExporting } = usePdfExport(`${exportBaseName}-daytabs-audit.pdf`);

  useEffect(() => {
    setSavedAudits(loadSavedAudits());
  }, []);

  const topMetrics = useMemo(() => {
    const source = report?.video ?? preview?.video;
    const performance = report?.performanceContext ?? null;
    if (!source) return [];
    return [
      { label: "Views", value: formatNumber(source.viewCount) },
      { label: "Likes", value: formatNumber(source.likeCount) },
      { label: "Comments", value: formatNumber(source.commentCount) },
      { label: "Views / day", value: formatNumber(performance?.viewsPerDay) },
    ];
  }, [preview, report]);

  useEffect(() => {
    const recommendedStyle = report?.fixes.recommendedThumbnailStyle || preview?.recommendedThumbnailStyle || "Professional";
    setThumbnailStyle(recommendedStyle);
  }, [preview, report]);

  const selectedTranslation = useMemo(() => {
    if (!report?.transcript.translations?.length) return null;
    return report.transcript.translations.find((item) => item.targetLanguage === translationLanguage)
      || report.transcript.translations[report.transcript.translations.length - 1]
      || null;
  }, [report, translationLanguage]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl.trim()) return;
    setLoadingPreview(true);
    setLoadingReport(false);
    setError(null);
    setPreview(null);
    setReport(null);
    setGeneratedThumbnail(null);
    setTranscriptWorking(false);
    setTranslationAudio(null);
    try {
      const previewData = await jsonFetch<{ preview: AuditPreview }>("/api/youtube/audit-preview", {
        method: "POST",
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });
      setPreview(previewData.preview);
      setLoadingPreview(false);
      setLoadingReport(true);

      const reportData = await jsonFetch<{ report: AuditReport }>("/api/youtube/audit", {
        method: "POST",
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });
      const normalizedReport = normalizeSavedAuditCard({
        id: "",
        videoUrl: videoUrl.trim(),
        savedAt: new Date().toISOString(),
        preview: previewData.preview,
        report: reportData.report,
        generatedThumbnail: null,
      }).report;
      setReport(normalizedReport);
      const savedAt = new Date().toISOString();
      const card: SavedAuditCard = {
        id: buildAuditStorageId(previewData.preview.video.id, savedAt),
        videoUrl: videoUrl.trim(),
        savedAt,
        preview: previewData.preview,
        report: normalizedReport,
        generatedThumbnail: null,
      };
      setActiveAuditId(card.id);
      setSavedAudits((current) => {
        const next = [card, ...current].slice(0, 10);
        persistSavedAudits(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to audit video");
    } finally {
      setLoadingPreview(false);
      setLoadingReport(false);
    }
  }

  function loadSavedAudit(card: SavedAuditCard) {
    const normalizedCard = normalizeSavedAuditCard(card);
    setVideoUrl(card.videoUrl);
    setPreview(normalizedCard.preview);
    setReport(normalizedCard.report);
    setGeneratedThumbnail(normalizedCard.generatedThumbnail);
    setActiveAuditId(normalizedCard.id);
    setTranscriptWorking(false);
    setTranslationAudio(null);
    setError(null);
  }

  function updateSavedAuditThumbnail(thumbnail: GeneratedAuditThumbnail | null) {
    if (!activeAuditId) return;
    setSavedAudits((current) => {
      const next = current.map((card) => card.id === activeAuditId ? { ...card, generatedThumbnail: thumbnail } : card);
      persistSavedAudits(next);
      return next;
    });
  }

  function updateSavedAuditReport(nextReport: AuditReport) {
    if (!activeAuditId) return;
    setSavedAudits((current) => {
      const next = current.map((card) => card.id === activeAuditId ? { ...card, report: nextReport } : card);
      persistSavedAudits(next);
      return next;
    });
  }

  function updateTranscriptSegment(
    index: number,
    field: "start" | "end" | "text",
    value: string,
  ) {
    if (!report) return;
    const currentSegments = report.transcript.segments;
    if (!currentSegments[index]) return;
    const nextSegments = currentSegments.map((segment, segmentIndex) => {
      if (segmentIndex !== index) return segment;
      if (field === "text") {
        return { ...segment, text: value };
      }
      const parsed = parseTranscriptTimeInput(value);
      if (parsed == null) return segment;
      return { ...segment, [field]: parsed };
    }).map((segment, segmentIndex, array) => {
      const previousEnd = segmentIndex > 0 ? array[segmentIndex - 1]!.end : 0;
      const nextStart = segmentIndex < array.length - 1 ? array[segmentIndex + 1]!.start : null;
      const start = Math.max(0, Math.min(segment.start, segment.end - 0.1));
      const boundedStart = Math.max(segmentIndex > 0 ? previousEnd : 0, start);
      const maxEnd = nextStart != null ? Math.max(boundedStart + 0.1, nextStart) : null;
      const end = Math.max(boundedStart + 0.1, segment.end);
      return {
        ...segment,
        start: boundedStart,
        end: maxEnd != null ? Math.min(end, maxEnd) : end,
        text: segment.text.trim(),
      };
    });

    const nextReport: AuditReport = {
      ...report,
      transcript: {
        ...report.transcript,
        text: nextSegments.map((segment) => segment.text).filter(Boolean).join("\n"),
        segments: nextSegments,
        translations: [],
      },
    };
    setReport(nextReport);
    setTranslationAudio(null);
    updateSavedAuditReport(nextReport);
  }

  async function handleAuditTranscriptMedia(files: FileList | null) {
    const file = files?.[0];
    if (!file || !videoUrl.trim()) return;
    setTranscriptWorking(true);
    setError(null);
    try {
      const token = localStorage.getItem("daytabs_token");
      const formData = new FormData();
      formData.append("videoUrl", videoUrl.trim());
      formData.append("media", file);
      const response = await fetch("/api/youtube/audit-transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not generate transcript from upload");
      const nextReport = normalizeSavedAuditCard({
        id: activeAuditId || "",
        videoUrl: videoUrl.trim(),
        savedAt: new Date().toISOString(),
        preview: preview!,
        report: data.report as AuditReport,
        generatedThumbnail,
      }).report;
      setReport(nextReport);
      updateSavedAuditReport(nextReport);
      setTranslationAudio(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate transcript from upload");
    } finally {
      setTranscriptWorking(false);
    }
  }

  async function translateAuditTranscript() {
    if (!report?.transcript.segments.length) return;
    setTranslationWorking(true);
    setError(null);
    setTranslationAudio(null);
    try {
      const data = await jsonFetch<{
        translation: AuditReport["transcript"]["translations"][number];
      }>("/api/youtube/audit-translate", {
        method: "POST",
        body: JSON.stringify({
          targetLanguage: translationLanguage,
          sourceLanguage: report.transcript.language,
          segments: report.transcript.segments,
        }),
      });
      const nextReport: AuditReport = {
        ...report,
        transcript: {
          ...report.transcript,
          translations: [
            ...report.transcript.translations.filter((item) => item.targetLanguage !== data.translation.targetLanguage),
            data.translation,
          ].sort((a, b) => a.targetLanguage.localeCompare(b.targetLanguage)),
        },
      };
      setReport(nextReport);
      updateSavedAuditReport(nextReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not translate transcript");
    } finally {
      setTranslationWorking(false);
    }
  }

  async function generateTranslationAudio() {
    if (!preview || !selectedTranslation?.segments.length) return;
    setTranslationAudioWorking(true);
    setError(null);
    try {
      const data = await jsonFetch<TranslationAudioResult>("/api/youtube/audit-translation-audio", {
        method: "POST",
        body: JSON.stringify({
          title: preview.video.title,
          targetLanguage: selectedTranslation.targetLanguage,
          voice: translationVoice,
          segments: selectedTranslation.segments,
        }),
      });
      setTranslationAudio(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate translated audio");
    } finally {
      setTranslationAudioWorking(false);
    }
  }

  async function handleThumbnailSourceFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []).slice(0, 4);
    if (!nextFiles.length) return;
    setError(null);
    try {
      const processed = await Promise.all(nextFiles.map(async (file) => ({
        name: file.name,
        dataUrl: await resizeImageFileToDataUrl(file),
      })));
      setThumbnailSourceImages((current) => [...current, ...processed].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read source images");
    }
  }

  function openThumbnailModal() {
    setThumbnailTextPreference("");
    setThumbnailSourceImages([]);
    setPreserveThumbnailSourceImage(true);
    setGeneratedThumbnail((current) => current);
    setThumbnailModalOpen(true);
  }

  async function generateAuditThumbnail() {
    if (!preview || !report) return;
    setThumbnailWorking(true);
    setError(null);
    try {
      const analysisNotes = [
        report.summary,
        report.fixes.thumbnailIdea,
        report.visualAudit?.topFix || "",
        report.diagnosis.map((item) => `${item.area}: ${item.issue}`).join(" | "),
      ].filter(Boolean).join("\n");

      const data = await jsonFetch<{ thumbnail: GeneratedAuditThumbnail }>("/api/youtube/audit-thumbnail", {
        method: "POST",
        body: JSON.stringify({
          title: preview.video.title,
          description: report.fixes.description || preview.video.description,
          tags: report.fixes.tags.length ? report.fixes.tags : preview.video.tags,
          textPreference: thumbnailTextPreference.trim() || null,
          sourceImages: thumbnailSourceImages.map((image) => image.dataUrl),
          fallbackSourceImageUrl: thumbnailSourceImages.length ? null : preview.video.thumbnailUrl,
          preserveUploadedImage: preserveThumbnailSourceImage,
          stylePreference: thumbnailStyle,
          analysisNotes,
        }),
      });
      setGeneratedThumbnail(data.thumbnail);
      updateSavedAuditThumbnail(data.thumbnail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate thumbnail");
    } finally {
      setThumbnailWorking(false);
    }
  }

  if (planLoading) {
    return (
      <PanelPage className="max-w-6xl">
        <PanelCard className="p-8 text-white/60">Loading plan…</PanelCard>
      </PanelPage>
    );
  }

  if (!isStudio) {
    return (
      <PanelPage className="max-w-4xl">
        <PanelHeader>
          <div>
            <PanelTitle>YouTube Audit</PanelTitle>
            <PanelSubtitle>Paste a YouTube URL and get a competitor-aware audit.</PanelSubtitle>
          </div>
        </PanelHeader>
        <PanelCard className="border-pink-500/20 bg-pink-500/8 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-400/20 bg-pink-500/10">
            <Youtube className="h-5 w-5 text-pink-300" />
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">Studio-only feature</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/65">
            This first version is only enabled on the Studio plan while we test pasted-video audits, competitor comparison, and metadata fixes.
          </p>
          <a
            href="/pricing?highlight=studio"
            className="mt-6 inline-flex rounded-xl border border-pink-400/25 bg-pink-500/12 px-4 py-2 text-sm font-semibold text-pink-200 transition-colors hover:bg-pink-500/18"
          >
            Upgrade to Studio
          </a>
        </PanelCard>
      </PanelPage>
    );
  }

  return (
    <PanelPage className="max-w-6xl space-y-6">
      <PanelHeader>
        <div>
          <PanelTitle>YouTube Audit</PanelTitle>
          <PanelSubtitle>Paste a YouTube URL to audit packaging, niche fit, thumbnail quality, and competitor gaps.</PanelSubtitle>
        </div>
      </PanelHeader>

      <PanelCard className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste a YouTube video URL"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary/35"
            />
          </div>
          <button
            type="submit"
            disabled={loadingPreview || loadingReport || !videoUrl.trim()}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingPreview || loadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run Audit"}
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">
          Current v1 uses public metadata, real comparable videos, public transcripts when available, and thumbnail-only packaging analysis.
        </p>
        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </PanelCard>

      {savedAudits.length ? (
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Saved audits</p>
              <p className="mt-2 text-sm text-white/55">Reload a previous YouTube audit card without running the whole report again.</p>
            </div>
            {report ? (
              <Button type="button" variant="secondary" className="rounded-lg" onClick={() => void exportPdf()} disabled={isPdfExporting}>
                {isPdfExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export report
              </Button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedAudits.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => loadSavedAudit(card)}
                className={`rounded-2xl border p-4 text-left transition-colors ${activeAuditId === card.id ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
              >
                <p className="text-sm font-semibold text-white">{card.preview.video.title}</p>
                <p className="mt-1 text-xs text-white/40">{card.preview.video.channelName}</p>
                <p className="mt-2 text-xs text-white/35">{new Date(card.savedAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </PanelCard>
      ) : null}

      {preview ? (
        <div ref={pdfExportRef} data-pdf-export-root="true" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <PanelCard className="p-5">
              <div className="flex gap-4">
                {preview.video.thumbnailUrl ? (
                  <img src={preview.video.thumbnailUrl} alt={preview.video.title} className="h-28 w-44 rounded-2xl border border-white/10 object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Video loaded</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{preview.video.title}</h3>
                  <p className="mt-1 text-sm text-white/45">{preview.video.channelName}</p>
                  {report ? (
                    <p className="mt-3 text-sm leading-6 text-white/72">{report.summary}</p>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-white/60">
                      Metadata loaded. Building the full audit report with comparable videos, transcript checks, and packaging fixes now.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                      Inferred niche: {(report?.nicheInference ?? preview.nicheInference).label}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">{preview.video.likelyFormat}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                      {(report?.transcript ?? preview.transcript).available
                        ? `Transcript: ${(report?.transcript ?? preview.transcript).source === "manual" ? "Manual" : (report?.transcript ?? preview.transcript).source === "uploaded" ? "Uploaded" : "Auto"}${(report?.transcript ?? preview.transcript).language ? ` · ${(report?.transcript ?? preview.transcript).language}` : ""}`
                        : "Transcript unavailable"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/45">
                    Niche confidence: {(report?.nicheInference ?? preview.nicheInference).confidence} · {(report?.nicheInference ?? preview.nicheInference).basis}
                  </p>
                </div>
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Public performance context</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {topMetrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              {report ? (
                <div className="mt-4 text-xs leading-6 text-white/50">
                  Age: {report.performanceContext.ageDays != null ? `${report.performanceContext.ageDays} day${report.performanceContext.ageDays === 1 ? "" : "s"}` : "n/a"} · Channel median: {formatNumber(report.performanceContext.channelMedianViews)} · Competitor median: {formatNumber(report.performanceContext.competitorMedianViews)}
                </div>
              ) : (
                <div className="mt-4 text-xs leading-6 text-white/45">
                  Performance comparison and competitor context are still loading.
                </div>
              )}
            </PanelCard>
          </div>

          {!report && loadingReport ? (
            <PanelCard className="p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-semibold text-white">Building full audit report</p>
                  <p className="text-xs leading-6 text-white/45">
                    Checking public subtitles, finding real competitor videos, and generating the source-aware report.
                  </p>
                </div>
              </div>
            </PanelCard>
          ) : null}

          {report ? (
            <>
          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-white">What likely hurt performance</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.diagnosis.map((item, index) => (
                  <div key={`${item.area}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold capitalize text-white">{item.area}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                          {priorityLabel(item.priority)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${confidenceClass(item.confidence)}`}>{item.confidence}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-white/78">{item.issue}</p>
                    <p className="mt-2 text-xs leading-6 text-white/50">{item.whyItHurts}</p>
                    {item.evidence ? (
                      <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">What in the script caused this</p>
                        <p className="mt-2 text-sm leading-6 text-white/78">{item.evidence}</p>
                      </div>
                    ) : null}
                    {item.recommendedChange ? (
                      <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-500/5 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/55">How to improve it</p>
                        <p className="mt-2 text-sm leading-6 text-white/82">{item.recommendedChange}</p>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/30">{item.sourceLabel}</p>
                  </div>
                ))}
              </div>
            </PanelCardSoft>

            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-sky-300" />
                <p className="text-sm font-semibold text-white">Fixes to test next</p>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Better titles</p>
                  <ul className="mt-3 space-y-2">
                    {report.fixes.titles.map((title, index) => (
                      <li key={`${title}-${index}`} className="text-sm text-white/82">{index + 1}. {title}</li>
                    ))}
                  </ul>
                </div>
                {report.transcript.available ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Better hook</p>
                    <p className="mt-3 text-sm text-white/82">{report.fixes.hookRewrite || "No hook rewrite returned yet."}</p>
                    {report.fixes.scriptDirection ? (
                      <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Script changes to make</p>
                        <p className="mt-2 text-sm leading-6 text-white/78">{report.fixes.scriptDirection}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-amber-100/55">Transcript fallback</p>
                    <p className="mt-3 text-sm leading-6 text-amber-50/75">Upload the matching video or audio file to generate a transcript and rebuild this audit with script-level findings.</p>
                    <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg border border-amber-300/20 px-3 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-300/10">
                      {transcriptWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {transcriptWorking ? "Transcribing" : "Upload media"}
                      <input
                        type="file"
                        accept="audio/*,video/*,.mp3,.m4a,.wav,.webm,.mp4,.mov,.avi,.mkv"
                        className="hidden"
                        disabled={transcriptWorking}
                        onChange={(event) => {
                          void handleAuditTranscriptMedia(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Thumbnail idea</p>
                  <p className="mt-3 text-sm leading-6 text-white/82">{report.fixes.thumbnailIdea || "No thumbnail direction returned yet."}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" className="rounded-lg" onClick={openThumbnailModal}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate thumbnail
                    </Button>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/65">
                      Suggested style: {report.fixes.recommendedThumbnailStyle}
                    </span>
                  </div>
                </div>
              </div>
            </PanelCardSoft>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCard className="p-5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-white">Description and tags</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/78">{report.fixes.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {report.fixes.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Packaging strategy</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{report.fixes.packagingStrategy}</p>
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-violet-300" />
                <p className="text-sm font-semibold text-white">Thumbnail packaging notes</p>
              </div>
              {report.visualAudit ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Assessment basis</p>
                    <p className="mt-2 text-sm text-white/78">Public thumbnail only. This is packaging feedback, not a full video quality audit.</p>
                    <p className="mt-3 text-sm text-white/78">{report.visualAudit.topFix}</p>
                  </div>
                  {[
                    ["Lighting", report.visualAudit.lighting],
                    ["Framing", report.visualAudit.framing],
                    ["Sharpness", report.visualAudit.sharpness],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{label}</p>
                      <p className="mt-2 text-sm leading-6 text-white/75">{value || "No note returned."}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/55">Visual audit was not available for this video.</p>
              )}
              {report.fixes.qualityFixes.length ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Packaging notes from thumbnail</p>
                  <ul className="mt-3 space-y-2">
                    {report.fixes.qualityFixes.map((item, index) => (
                      <li key={`${item}-${index}`} className="text-sm text-white/78">{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {generatedThumbnail ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Generated thumbnail</p>
                      <p className="mt-2 text-sm text-white/55">Created from your selected style, notes, and optional source images.</p>
                    </div>
                    <a
                      href={generatedThumbnail.imageDataUrl}
                      download={`${exportBaseName || "youtube-audit-thumbnail"}.${thumbnailDownloadExtension(generatedThumbnail.imageDataUrl)}`}
                      className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <img src={generatedThumbnail.imageDataUrl} alt="Generated audit thumbnail" className="w-full object-cover" />
                  </div>
                </div>
              ) : null}
            </PanelCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-semibold text-white">Top creators in this lane</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.topCreators.length ? report.topCreators.map((creator, index) => (
                  <div key={`${creator.channelName}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">{creator.channelName}</p>
                    <p className="mt-1 text-xs text-white/40">
                      Avg views: {formatNumber(creator.averageViews)}
                      {creator.subscriberCount > 0 ? ` · Subs: ${formatNumber(creator.subscriberCount)}` : ""}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{creator.whyTheyMatter}</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55">
                    We could not find enough strong comparable creators for this topic yet. Try another video or a more search-specific title.
                  </div>
                )}
              </div>
            </PanelCardSoft>

            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-white">Competitor videos worth studying</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.competitorExamples.length ? report.competitorExamples.map((video, index) => (
                  <a key={`${video.url}-${index}`} href={video.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{video.title}</p>
                        <p className="mt-1 text-xs text-white/40">{video.channelName} · {formatNumber(video.viewCount)} views</p>
                      </div>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/72">{video.whyItWins}</p>
                  </a>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55">
                    No strong comparable videos were found for this audit yet.
                  </div>
                )}
              </div>
            </PanelCardSoft>
          </div>

          {report.transcript.available && report.transcript.segments.length ? (
            <PanelCard className="p-5">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Full script and translation</p>
                    <p className="mt-2 text-sm text-white/55">
                      Expand to review the full timestamped script, translate it naturally, and generate aligned AI voice audio.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                    {report.transcript.segments.length} timestamped segments
                  </span>
                </summary>
                <div className="mt-5 space-y-4">
                  <PanelCardSoft className="p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Translate to</p>
                        <select
                          value={translationLanguage}
                          onChange={(event) => {
                            setTranslationLanguage(event.target.value);
                            setTranslationAudio(null);
                          }}
                          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-primary/35"
                        >
                          {TRANSLATION_LANGUAGES.map((language) => (
                            <option key={language} value={language} className="bg-slate-950">
                              {language}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button type="button" className="rounded-lg" onClick={() => void translateAuditTranscript()} disabled={translationWorking}>
                        {translationWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {translationWorking ? "Translating" : selectedTranslation?.targetLanguage === translationLanguage ? "Refresh translation" : "Translate script"}
                      </Button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-white/45">
                      Translation is meaning-first rather than word-for-word, while being compressed when needed to fit the original segment timestamps.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-white/35">
                      If you edit the transcript or timestamps below, existing translations are cleared and the next translation/audio generation will use your updated script.
                    </p>
                  </PanelCardSoft>

                  {selectedTranslation ? (
                    <PanelCardSoft className="p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[180px] flex-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">AI voice</p>
                          <select
                            value={translationVoice}
                            onChange={(event) => {
                              setTranslationVoice(event.target.value as (typeof OPENAI_VOICES)[number]);
                              setTranslationAudio(null);
                            }}
                            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-primary/35"
                          >
                            {OPENAI_VOICES.map((voice) => (
                              <option key={voice} value={voice} className="bg-slate-950">
                                {voice}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button type="button" className="rounded-lg" onClick={() => void generateTranslationAudio()} disabled={translationAudioWorking}>
                          {translationAudioWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {translationAudioWorking ? "Generating audio" : "Generate translation audio"}
                        </Button>
                        {translationAudio ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="rounded-lg"
                            onClick={() => {
                              void downloadAuthenticatedFile(translationAudio.downloadUrl, translationAudio.filename).catch((err) => {
                                setError(err instanceof Error ? err.message : "Could not download translated audio");
                              });
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download audio
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="text-xs text-white/45">Preview selected voice:</p>
                        <audio controls preload="none" src={`/api/analysis/voice-preview/${translationVoice}`} className="h-10 max-w-full" />
                      </div>
                      <p className="mt-3 text-xs leading-5 text-white/45">
                        The generated audio is forced to the original timeline. If a translated line runs long, the wording is shortened at translation time and the speech is tightened to stay inside the original segment length.
                      </p>
                    </PanelCardSoft>
                  ) : null}

                  <div className={`grid gap-4 ${selectedTranslation ? "xl:grid-cols-[1fr,1fr]" : ""}`}>
                    <PanelCardSoft className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Original script</p>
                        <span className="text-xs text-white/40">Grouped into sentence-style or roughly 10-second sections</span>
                      </div>
                      <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                        {report.transcript.segments.map((segment, index) => (
                          <div key={`script-${index}-${segment.start}`} className="rounded-xl border border-white/8 bg-black/15 p-3">
                            <div className="grid gap-3 sm:grid-cols-[88px,88px,1fr]">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Start</p>
                                <input
                                  value={formatTranscriptTime(segment.start)}
                                  onChange={(event) => updateTranscriptSegment(index, "start", event.target.value)}
                                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 text-xs font-mono text-white outline-none focus:border-primary/35"
                                />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">End</p>
                                <input
                                  value={formatTranscriptTime(segment.end)}
                                  onChange={(event) => updateTranscriptSegment(index, "end", event.target.value)}
                                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 text-xs font-mono text-white outline-none focus:border-primary/35"
                                />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Transcript</p>
                                <Textarea
                                  value={segment.text}
                                  onChange={(event) => updateTranscriptSegment(index, "text", event.target.value)}
                                  className="mt-2 min-h-[88px] text-sm leading-6"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCardSoft>

                    {selectedTranslation ? (
                      <PanelCardSoft className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">
                            {selectedTranslation.targetLanguage} translation
                          </p>
                          <span className="text-xs text-white/40">
                            {new Date(selectedTranslation.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                          {selectedTranslation.segments.map((segment, index) => (
                            <div key={`translation-${index}-${segment.start}`} className="flex gap-3 rounded-xl border border-white/8 bg-black/15 p-3">
                              <div className="w-20 shrink-0 font-mono text-xs font-semibold text-white/45">
                                {formatTranscriptTime(segment.start)}
                              </div>
                              <p className="text-sm leading-6 text-white/82">{segment.text}</p>
                            </div>
                          ))}
                        </div>
                      </PanelCardSoft>
                    ) : null}
                  </div>
                </div>
              </details>
            </PanelCard>
          ) : null}

          <PanelCard className="p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-semibold text-white">Current limitations</p>
            </div>
            <ul className="mt-4 space-y-2">
              {report.limitations.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-white/65">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </PanelCard>
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog open={thumbnailModalOpen} onOpenChange={setThumbnailModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto pt-10">
          <DialogHeader>
            <DialogTitle>Create Thumbnail</DialogTitle>
            <DialogDescription>Upload optional source images, choose a style, add optional text, and generate a saved thumbnail for this audit.</DialogDescription>
          </DialogHeader>
          {report && preview ? (
            <div className="space-y-4">
              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Video</p>
                <p className="mt-2 text-base font-semibold text-white">{preview.video.title}</p>
                <p className="mt-2 text-sm text-white/55">{report.fixes.thumbnailIdea}</p>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Source images</p>
                <p className="mt-2 text-sm text-white/55">Add up to 4 JPG images. Preserve mode keeps your upload as the base image and edits around it.</p>
                <p className="mt-2 text-xs text-white/40">Requirements: JPG, 16:9 output, 1280 x 720px, minimum source width 640px, max 2 MB.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {thumbnailSourceImages.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                      <img src={image.dataUrl} alt={image.name} className="h-28 w-40 object-cover" />
                      <button
                        type="button"
                        onClick={() => setThumbnailSourceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/50 p-1 text-white/70 hover:text-white"
                        aria-label={`Remove ${image.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {thumbnailSourceImages.length < 4 ? (
                    <label className="flex h-28 w-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center text-sm text-white/45 hover:border-white/20 hover:text-white/70">
                      <ImagePlus className="mb-2 h-5 w-5" />
                      Add image
                      <input
                        type="file"
                        accept="image/jpeg,.jpg,.jpeg"
                        multiple
                        className="hidden"
                        onChange={(event) => void handleThumbnailSourceFiles(event.target.files)}
                      />
                    </label>
                  ) : null}
                </div>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Thumbnail style</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {THUMBNAIL_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setThumbnailStyle(style)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${thumbnailStyle === style ? "border-primary/30 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-white/40">Auto-selected from audit: {report.fixes.recommendedThumbnailStyle}</p>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Text on thumbnail</p>
                <Textarea
                  value={thumbnailTextPreference}
                  onChange={(event) => setThumbnailTextPreference(event.target.value)}
                  placeholder="Optional. Leave empty and AI will generate the strongest thumbnail text."
                  className="mt-3 min-h-24"
                />
              </PanelCardSoft>

              {thumbnailSourceImages.length ? (
                <PanelCardSoft className="p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPreserveThumbnailSourceImage(true)}
                      className={`rounded-xl border p-3 text-left transition-all ${preserveThumbnailSourceImage ? "border-emerald-300/35 bg-emerald-400/10 text-white" : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      <span className="text-sm font-semibold">Preserve my image</span>
                      <span className="mt-1 block text-xs leading-5 text-white/45">Recommended. Keeps the exact subject, pose, scene, and composition.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreserveThumbnailSourceImage(false)}
                      className={`rounded-xl border p-3 text-left transition-all ${!preserveThumbnailSourceImage ? "border-red-300/35 bg-red-400/10 text-white" : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      <span className="text-sm font-semibold">Allow AI to redesign</span>
                      <span className="mt-1 block text-xs leading-5 text-white/45">Uses uploads as references, but can create a new thumbnail scene.</span>
                    </button>
                  </div>
                </PanelCardSoft>
              ) : null}

              {thumbnailWorking ? (
                <PanelCardSoft className="overflow-hidden p-0">
                  <div className="relative aspect-video w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
                    <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.08),transparent)] animate-pulse" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.07]">
                        <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-white">Creating thumbnail</p>
                      <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                        Building the image from your audit notes, style choice, and any uploaded source images.
                      </p>
                    </div>
                    <div className="absolute bottom-5 left-5 right-5 space-y-2">
                      <div className="h-3 w-32 rounded-full bg-white/10" />
                      <div className="h-3 w-full rounded-full bg-white/10" />
                      <div className="h-3 w-5/6 rounded-full bg-white/10" />
                    </div>
                  </div>
                </PanelCardSoft>
              ) : generatedThumbnail ? (
                <PanelCardSoft className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Preview</p>
                      <p className="mt-2 text-sm text-white/55">This thumbnail is saved to the current audit and can be downloaded from the report too.</p>
                    </div>
                    <a
                      href={generatedThumbnail.imageDataUrl}
                      download={`${exportBaseName || "youtube-audit-thumbnail"}.${thumbnailDownloadExtension(generatedThumbnail.imageDataUrl)}`}
                      className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <img src={generatedThumbnail.imageDataUrl} alt="Generated audit thumbnail preview" className="w-full object-cover" />
                  </div>
                </PanelCardSoft>
              ) : null}

              {generatedThumbnail?.prompt ? (
                <PanelCardSoft className="p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/40">Generated prompt</p>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-white/72">
                    {generatedThumbnail.prompt}
                  </pre>
                </PanelCardSoft>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" className="rounded-lg" onClick={() => setThumbnailModalOpen(false)}>
                  Close
                </Button>
                <Button type="button" className="rounded-lg" onClick={() => void generateAuditThumbnail()} disabled={thumbnailWorking}>
                  {thumbnailWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {thumbnailWorking ? "Creating image..." : generatedThumbnail ? "Generate again" : "Generate thumbnail"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PanelPage>
  );
}

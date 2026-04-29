import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Heart,
  MessageCircle,
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
import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";

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
  captions: {
    available: boolean;
    source: "manual" | "auto" | "uploaded" | "transcribed_audio" | null;
    language: string | null;
    languages: string[];
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

type QuickAuditReport = {
  auditMode: "quick";
  score: number;
  scoreLabel: string;
  oneSentenceDiagnosis: string;
  doThisFirst: {
    area: "title" | "thumbnail" | "hook" | "description" | "tags";
    action: string;
    why: string;
    expectedImpact: string;
  };
  topFixes: Array<{
    area: "title" | "thumbnail" | "hook" | "description" | "tags";
    priority: 1 | 2 | 3;
    problem: string;
    evidence: string;
    whyItHurts: string;
    fix: string;
    example: string;
    confidence: "high" | "medium" | "low";
  }>;
  beforeAfter: {
    currentTitle: string;
    betterTitles: string[];
    currentHook: string | null;
    hookRewrite: string | null;
    descriptionRewrite: string;
  };
  thumbnailFix: {
    problem: string;
    concept: string;
    focalSubject: string;
    textOverlay: string;
    layout: string;
    emotion: string;
    designStyle: string;
  };
  competitorPattern: {
    summary: string;
    patternsToBorrow: string[];
    patternsToAvoid: string[];
  };
  tags: {
    priority: "low" | "medium" | "high";
    recommended: string[];
    why: string;
  };
  limitations: string[];
};

type DeepAuditReport = AuditReport & { auditMode?: "deep" };

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
  captions: {
    available: boolean;
    source: "manual" | "auto" | null;
    language: string | null;
    languages: string[];
    downloadable?: boolean;
  };
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

type ThumbnailAssetSlot = {
  key: string;
  label: string;
  helper?: string;
  isFace?: boolean;
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
  report: QuickAuditReport | DeepAuditReport;
  generatedThumbnail: GeneratedAuditThumbnail | null;
};

type TranscriptSegment = { start: number; end: number; text: string };

const AUDIT_HISTORY_KEY = "daytabs_youtube_audit_history_v1";
const THUMBNAIL_STYLES = ["Professional", "Realistic", "Minimal", "Cartoon", "Cinematic", "Bold"] as const;
const YOUTUBE_THUMBNAIL_WIDTH = 1280;
const YOUTUBE_THUMBNAIL_HEIGHT = 720;
const YOUTUBE_THUMBNAIL_MIN_WIDTH = 640;
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

function scoreRingGradient(score: number) {
  const value = Math.min(100, Math.max(0, score));
  if (value >= 80) return { from: "from-emerald-400", to: "to-emerald-200" };
  if (value >= 60) return { from: "from-sky-400", to: "to-sky-200" };
  if (value >= 40) return { from: "from-amber-400", to: "to-amber-200" };
  return { from: "from-rose-400", to: "to-rose-200" };
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const normalized = Math.min(100, Math.max(0, score));
  const gradient = scoreRingGradient(normalized);
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative grid h-16 w-16 place-items-center rounded-full"
        style={{
          background: `conic-gradient(rgba(255,255,255,0.88) ${normalized * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-black/70">
          <span className={`bg-gradient-to-r ${gradient.from} ${gradient.to} bg-clip-text text-lg font-semibold text-transparent`}>
            {Math.round(normalized)}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Score</p>
        <p className="mt-1 truncate text-sm font-semibold text-white">{label}</p>
      </div>
    </div>
  );
}

function CopyInlineButton({ value, label }: { value: string; label?: string }) {
  if (!value.trim()) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-8 rounded-lg px-3 text-xs"
      onClick={() => void navigator.clipboard?.writeText(value)}
    >
      {label || "Copy"}
    </Button>
  );
}


async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(locale ? { "Accept-Language": locale } : {}),
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
  if ((card.report as QuickAuditReport)?.auditMode === "quick") {
    return card;
  }
  const deepReport = card.report as DeepAuditReport;
  return {
    ...card,
    report: {
      ...deepReport,
      transcript: {
        ...(deepReport.transcript as any),
        segments: Array.isArray(deepReport.transcript?.segments) ? deepReport.transcript.segments : [],
        translations: Array.isArray(deepReport.transcript?.translations) ? deepReport.transcript.translations : [],
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
  const [report, setReport] = useState<QuickAuditReport | DeepAuditReport | null>(null);
  const [savedAudits, setSavedAudits] = useState<SavedAuditCard[]>([]);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailTextPreference, setThumbnailTextPreference] = useState("");
  const [thumbnailSourceImages, setThumbnailSourceImages] = useState<ThumbnailSourceImage[]>([]);
  const [thumbnailAssetAlternatives, setThumbnailAssetAlternatives] = useState<Record<string, string>>({});
  const [preserveThumbnailSourceImage, setPreserveThumbnailSourceImage] = useState(true);
  const [thumbnailStyle, setThumbnailStyle] = useState<string>("Professional");
  const [generatedThumbnail, setGeneratedThumbnail] = useState<GeneratedAuditThumbnail | null>(null);
  const [thumbnailWorking, setThumbnailWorking] = useState(false);
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");

  const [savedAuditsOpen, setSavedAuditsOpen] = useState(false);

  const isStudio = plan.isStudio;
  const isRunningAudit = loadingPreview || loadingReport;
  const exportBaseName = (preview?.video.title || "youtube-audit")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "youtube-audit";
  const { ref: pdfExportRef, exportPdf, isExporting: isPdfExporting } = usePdfExport(`${exportBaseName}-daytabs-audit.pdf`);

  useEffect(() => {
    setSavedAudits(loadSavedAudits());
  }, []);

  useEffect(() => {
    const recommendedStyle =
      ("fixes" in (report ?? {}) ? (report as DeepAuditReport).fixes.recommendedThumbnailStyle : null)
      || preview?.recommendedThumbnailStyle
      || "Professional";
    setThumbnailStyle(recommendedStyle);
  }, [preview, report]);

  const deepReport = report && (report as QuickAuditReport).auditMode !== "quick" ? (report as DeepAuditReport) : null;
  const reportDeepUnsafe = deepReport as unknown as AuditReport;
  const isQuickReport = report ? (report as QuickAuditReport).auditMode === "quick" : false;
  const quickReport = isQuickReport ? (report as QuickAuditReport) : null;

  function scrollToSection(sectionId: string) {
    const node = document.getElementById(sectionId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const quickFix = (area: QuickAuditReport["topFixes"][number]["area"]) => quickReport?.topFixes.find((item) => item.area === area) ?? null;
  const deepDiagnosis = (area: DeepAuditReport["diagnosis"][number]["area"]) => deepReport?.diagnosis.find((item) => item.area === area) ?? null;
  const transcriptSeemsAvailable = Boolean(
    quickReport?.beforeAfter.currentHook
    || deepReport?.transcript.available
    || preview?.transcript.available,
  );

  function currentHookFromTranscriptSegments(segmentsToUse: TranscriptSegment[]) {
    if (!segmentsToUse.length) return null;
    const snippet = segmentsToUse
      .filter((segment) => segment.start < 15)
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ");
    return snippet.trim() || null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl.trim()) return;
    setSavedAuditsOpen(false);
    setLoadingPreview(true);
    setLoadingReport(false);
    setError(null);
    setPreview(null);
    setReport(null);
    setGeneratedThumbnail(null);
    try {
      const previewData = await jsonFetch<{ preview: AuditPreview }>("/api/youtube/audit-preview", {
        method: "POST",
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });
      setPreview(previewData.preview);
      setLoadingPreview(false);
      setLoadingReport(true);

      const reportData = await jsonFetch<{ report: QuickAuditReport | DeepAuditReport }>("/api/youtube/audit", {
        method: "POST",
        body: JSON.stringify({ videoUrl: videoUrl.trim(), auditMode: "quick" }),
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

  function openThumbnailModal() {
    setThumbnailTextPreference("");
    setThumbnailSourceImages([]);
    setThumbnailAssetAlternatives({});
    setPreserveThumbnailSourceImage(true);
    setGeneratedThumbnail((current) => current);
    setThumbnailPrompt(buildDefaultThumbnailPrompt());
    setThumbnailModalOpen(true);
  }

  function inferThumbnailAssetSlots(): ThumbnailAssetSlot[] {
    const text = [
      quickReport?.thumbnailFix?.concept,
      quickReport?.thumbnailFix?.focalSubject,
      quickReport?.thumbnailFix?.designStyle,
      deepReport?.fixes.thumbnailIdea,
      deepReport?.fixes.recommendedThumbnailStyle,
      deepReport?.visualAudit?.topFix,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const slots: ThumbnailAssetSlot[] = [];
    const wantsFace = /\b(face|reaction|expression|eyes|shocked|surprised|portrait|selfie)\b/.test(text);
    const wantsProduct = /\b(product|tool|device|gadget|camera|microphone|laptop|phone)\b/.test(text);
    const wantsScreenshot = /\b(screenshot|screen|ui|app|dashboard|analytics|graph|chart)\b/.test(text);

    if (wantsFace) {
      slots.push({
        key: "face",
        label: "Face / subject photo",
        isFace: true,
        helper:
          "Upload the exact face/photo you want to use. DayTabs will only improve lighting, sharpness, color, background, and composition. It will NOT change your face.",
      });
    }
    if (wantsProduct) slots.push({ key: "product", label: "Product / object image" });
    if (wantsScreenshot) slots.push({ key: "screenshot", label: "Screenshot / UI image" });

    if (!slots.length) {
      slots.push({ key: "optional", label: "Optional image (face/product/screenshot)" });
    }

    return slots;
  }

  function buildDefaultThumbnailPrompt() {
    const quick = quickReport;
    const deep = deepReport;
    const base = [
      quick ? `Quick audit: ${quick.oneSentenceDiagnosis}` : "",
      quick?.thumbnailFix?.concept ? `Concept: ${quick.thumbnailFix.concept}` : deep?.fixes.thumbnailIdea ? `Concept: ${deep.fixes.thumbnailIdea}` : "",
      quick?.thumbnailFix?.focalSubject ? `Focal subject: ${quick.thumbnailFix.focalSubject}` : "",
      quick?.thumbnailFix?.textOverlay ? `Text overlay idea: ${quick.thumbnailFix.textOverlay}` : "",
      quick?.thumbnailFix?.layout ? `Layout: ${quick.thumbnailFix.layout}` : "",
      quick?.thumbnailFix?.emotion ? `Emotion: ${quick.thumbnailFix.emotion}` : "",
      quick?.thumbnailFix?.designStyle ? `Style: ${quick.thumbnailFix.designStyle}` : deep?.fixes.recommendedThumbnailStyle ? `Style: ${deep.fixes.recommendedThumbnailStyle}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return base;
  }

  async function generateAuditThumbnail() {
    if (!preview || !report) return;
    setThumbnailWorking(true);
    setError(null);
    try {
      const quick = (report as QuickAuditReport).auditMode === "quick" ? (report as QuickAuditReport) : null;
      const deep = quick ? null : (report as DeepAuditReport);

      const diagnosisNotes = deep?.diagnosis?.length
        ? deep.diagnosis
          .filter((item) => item.area === "thumbnail" || item.area === "title" || item.area === "hook")
          .map((item) => [
            `${item.area.toUpperCase()} ISSUE: ${item.issue}`,
            item.evidence ? `Evidence: ${item.evidence}` : "",
            item.recommendedChange ? `How to improve it: ${item.recommendedChange}` : "",
          ].filter(Boolean).join("\n"))
          .filter(Boolean)
          .join("\n\n")
        : "";

      const assetNotes = Object.entries(thumbnailAssetAlternatives)
        .map(([key, value]) => (value.trim() ? `${key.toUpperCase()} ALTERNATIVE: ${value.trim()}` : ""))
        .filter(Boolean)
        .join("\n");

      const strictFace = "STRICT FACE PRESERVATION: Use uploaded face exactly as-is. Do not modify identity or features. Only improve lighting, sharpness, color, and composition.";
      const mergedPrompt = [thumbnailPrompt.trim(), strictFace].filter(Boolean).join("\n\n");

      const analysisNotes = [
        quick ? `Quick audit summary: ${quick.oneSentenceDiagnosis}` : deep?.summary || "",
        deep?.fixes.packagingStrategy || "",
        deep?.fixes.thumbnailIdea || "",
        deep?.visualAudit?.topFix || "",
        deep?.visualAudit?.lighting ? `Lighting note: ${deep.visualAudit.lighting}` : "",
        deep?.visualAudit?.framing ? `Framing note: ${deep.visualAudit.framing}` : "",
        deep?.visualAudit?.sharpness ? `Sharpness note: ${deep.visualAudit.sharpness}` : "",
        diagnosisNotes,
        quick?.thumbnailFix?.concept ? `Concept: ${quick.thumbnailFix.concept}` : "",
        quick?.thumbnailFix?.problem ? `Problem: ${quick.thumbnailFix.problem}` : "",
        quick?.thumbnailFix?.focalSubject ? `Focal subject: ${quick.thumbnailFix.focalSubject}` : "",
        quick?.thumbnailFix?.textOverlay ? `Text overlay: ${quick.thumbnailFix.textOverlay}` : "",
        quick?.thumbnailFix?.layout ? `Layout: ${quick.thumbnailFix.layout}` : "",
        quick?.thumbnailFix?.emotion ? `Emotion: ${quick.thumbnailFix.emotion}` : "",
        quick?.thumbnailFix?.designStyle ? `Style: ${quick.thumbnailFix.designStyle}` : "",
        assetNotes,
        `PROMPT:\n${mergedPrompt}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const data = await jsonFetch<{ thumbnail: GeneratedAuditThumbnail }>("/api/youtube/audit-thumbnail", {
        method: "POST",
        body: JSON.stringify({
          title: preview.video.title,
          description: (quick ? quick.beforeAfter.descriptionRewrite : deep?.fixes.description) || preview.video.description,
          tags: (quick ? quick.tags.recommended : deep?.fixes.tags)?.length ? (quick ? quick.tags.recommended : deep?.fixes.tags) : preview.video.tags,
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
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loadingPreview || loadingReport || !videoUrl.trim()}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {loadingPreview || loadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run Audit"}
            </button>
            {savedAudits.length ? (
              <Button type="button" variant="secondary" className="h-12 rounded-xl px-4" onClick={() => setSavedAuditsOpen(true)} disabled={isRunningAudit}>
                <Eye className="mr-2 h-4 w-4" />
                Saved audits ({savedAudits.length})
              </Button>
            ) : null}
          </div>
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

      <Dialog open={savedAuditsOpen} onOpenChange={setSavedAuditsOpen}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto pt-10">
          <DialogHeader>
            <DialogTitle>Saved audits</DialogTitle>
            <DialogDescription>Reload a previous YouTube audit card without running the whole report again.</DialogDescription>
          </DialogHeader>
          {savedAudits.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {savedAudits.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    loadSavedAudit(card);
                    setSavedAuditsOpen(false);
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors ${activeAuditId === card.id ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
                >
                  <p className="text-sm font-semibold text-white">{card.preview.video.title}</p>
                  <p className="mt-1 text-xs text-white/40">{card.preview.video.channelName}</p>
                  <p className="mt-2 text-xs text-white/35">{new Date(card.savedAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          ) : (
            <PanelCardSoft className="p-4 text-sm text-white/60">No saved audits yet.</PanelCardSoft>
          )}
        </DialogContent>
      </Dialog>

      {loadingPreview && !preview ? (
        <PanelCard className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold text-white">Loading video metadata</p>
              <p className="text-xs leading-6 text-white/45">Fetching public title, channel info, thumbnail, tags, and transcript availability.</p>
            </div>
          </div>
        </PanelCard>
      ) : null}

      {preview ? (
        <div ref={pdfExportRef} data-pdf-export-root="true" className="space-y-6">
          {report ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Audit report</p>
                <p className="mt-2 text-sm text-white/55">Export prints the full report.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {savedAudits.length ? (
                  <Button type="button" variant="secondary" className="rounded-lg" onClick={() => setSavedAuditsOpen(true)} disabled={isRunningAudit}>
                    <Eye className="mr-2 h-4 w-4" />
                    Saved audits
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" className="rounded-lg" onClick={() => void exportPdf()} disabled={isPdfExporting}>
                  {isPdfExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export report
                </Button>
              </div>
            </div>
          ) : null}

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
                  <p className="mt-3 text-sm leading-6 text-white/72">
                    {isQuickReport ? (quickReport as QuickAuditReport).oneSentenceDiagnosis : (deepReport as DeepAuditReport).summary}
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    Metadata loaded. Building the full audit report with comparable videos, transcript checks, and packaging fixes now.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                    Inferred niche: {preview.nicheInference.label}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">{preview.video.likelyFormat}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                    {preview.transcript.available
                      ? `Transcript: ${preview.transcript.source === "manual" ? "Manual" : preview.transcript.source === "uploaded" ? "Uploaded" : "Auto"}${preview.transcript.language ? ` · ${preview.transcript.language}` : ""}`
                      : "Transcript unavailable"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                    {preview.captions.available
                      ? `Captions: ${preview.captions.source === "manual" ? "Manual" : "Auto"}${preview.captions.language ? ` · ${preview.captions.language}` : ""}`
                      : "Captions not detected"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <Eye className="h-4 w-4 text-white/40" />
                    <span className="font-semibold text-white/85">{formatNumber(preview.video.viewCount)}</span>
                    <span className="text-white/45">Views</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <Heart className="h-4 w-4 text-white/40" />
                    <span className="font-semibold text-white/85">{formatNumber(preview.video.likeCount)}</span>
                    <span className="text-white/45">Likes</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <MessageCircle className="h-4 w-4 text-white/40" />
                    <span className="font-semibold text-white/85">{formatNumber(preview.video.commentCount)}</span>
                    <span className="text-white/45">Comments</span>
                  </div>
                </div>

                {report ? (
                  isQuickReport ? (
                    <p className="mt-3 text-xs leading-5 text-white/45">
                      Quick audit: focused on packaging decisions, not long-form niche inference.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-white/45">
                      Niche confidence: {(deepReport as DeepAuditReport).nicheInference.confidence} · {(deepReport as DeepAuditReport).nicheInference.basis}
                    </p>
                  )
                ) : (
                  <p className="mt-3 text-xs leading-5 text-white/45">Audit report is loading…</p>
                )}
              </div>
            </div>
          </PanelCard>

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
            <div className="space-y-4">
              <PanelCard className="p-5" id="audit-quick">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Quick audit</p>
                    <p className="mt-3 text-sm leading-6 text-white/78">
                      {isQuickReport ? (quickReport as QuickAuditReport).oneSentenceDiagnosis : (deepReport as DeepAuditReport).summary}
                    </p>
                  </div>
                  {isQuickReport ? (
                    <ScoreRing score={(quickReport as QuickAuditReport).score} label={(quickReport as QuickAuditReport).scoreLabel} />
                  ) : null}
                </div>

                {isQuickReport ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/55">Do this first</p>
                      <p className="mt-2 text-sm font-semibold text-white">{(quickReport as QuickAuditReport).doThisFirst.action}</p>
                      <p className="mt-2 text-xs leading-6 text-white/60">{(quickReport as QuickAuditReport).doThisFirst.why}</p>
                      <p className="mt-2 text-xs leading-6 text-white/60">{(quickReport as QuickAuditReport).doThisFirst.expectedImpact}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(() => {
                          const area = (quickReport as QuickAuditReport).doThisFirst.area;
                          const mapping: Record<typeof area, { id: string; label: string }> = {
                            title: { id: "audit-title", label: "See title suggestions" },
                            thumbnail: { id: "audit-thumbnail", label: "Improve thumbnail" },
                            hook: { id: "audit-hook", label: "See better hook" },
                            description: { id: "audit-description", label: "See description rewrite" },
                            tags: { id: "audit-tags", label: "See tag list" },
                          };
                          const next = mapping[area];
                          return (
                            <Button type="button" className="rounded-lg" onClick={() => scrollToSection(next.id)}>
                              {next.label}
                            </Button>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Next fixes</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(quickReport as QuickAuditReport).topFixes
                          .slice()
                          .sort((a, b) => a.priority - b.priority)
                          .slice(0, 4)
                          .map((fix, index) => {
                            const mapping: Record<QuickAuditReport["topFixes"][number]["area"], { id: string; label: string }> = {
                              title: { id: "audit-title", label: "See title" },
                              thumbnail: { id: "audit-thumbnail", label: "See thumbnail" },
                              hook: { id: "audit-hook", label: "See hook" },
                              description: { id: "audit-description", label: "See description" },
                              tags: { id: "audit-tags", label: "See tags" },
                            };
                            const next = mapping[fix.area];
                            return (
                              <div key={`${fix.area}-${fix.problem}-${index}`} className="rounded-xl border border-white/10 bg-black/15 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-white/80">{fix.area.toUpperCase()}</p>
                                    <p className="mt-2 text-xs leading-5 text-white/60">{fix.fix}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-8 rounded-lg px-3 text-xs"
                                    onClick={() => scrollToSection(next.id)}
                                  >
                                    {next.label}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </PanelCard>

              <PanelCard className="p-5" id="audit-thumbnail">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Thumbnail Direction</p>
                    <p className="mt-2 text-sm text-white/55">Fix the packaging first. You’re selling the click before the watch.</p>
                  </div>
                  <Button type="button" className="rounded-lg" onClick={() => openThumbnailModal()} disabled={!isStudio}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate thumbnail
                  </Button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-white/80">Current thumbnail</p>
                    <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      {preview?.video.thumbnailUrl ? (
                        <img src={preview.video.thumbnailUrl} alt="Current thumbnail" className="h-full w-full object-contain" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-sm text-white/45">No thumbnail detected</div>
                      )}
                    </div>
                    {!isStudio ? (
                      <p className="text-xs leading-5 text-white/45">Thumbnail generation is available on the Studio plan.</p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-white/80">Analysis</p>
                      <p className="mt-2 text-sm leading-6 text-white/70">
                        {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.problem : deepDiagnosis("thumbnail")?.whyItHurts || deepDiagnosis("thumbnail")?.issue || "The current thumbnail doesn’t clearly communicate a single clickable promise at a glance."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs font-semibold text-white/80">Design structure</p>
                      <div className="mt-3 space-y-3 text-sm text-white/70">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/45">Focal subject</span>
                          <span className="text-right">
                            {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.focalSubject : deepReport?.fixes.thumbnailIdea || "One clear subject"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/45">Text overlay</span>
                          <span className="text-right">
                            {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.textOverlay : "1–3 words max"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/45">Layout</span>
                          <span className="text-right">
                            {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.layout : "High contrast, clean hierarchy"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/45">Emotion</span>
                          <span className="text-right">
                            {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.emotion : "Clear tension / curiosity"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/45">Style</span>
                          <span className="text-right">
                            {isQuickReport ? (quickReport as QuickAuditReport)?.thumbnailFix.designStyle : deepReport?.fixes.recommendedThumbnailStyle || preview?.recommendedThumbnailStyle || "Professional"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </PanelCard>

              <PanelCard className="p-5" id="audit-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Current Title</p>
                    <p className="mt-2 text-sm text-white/55">Tighten the promise so the viewer knows exactly what they’ll get.</p>
                  </div>
                  <Button type="button" variant="secondary" className="rounded-lg" onClick={() => scrollToSection("audit-title")}>
                    <Target className="mr-2 h-4 w-4" />
                    Jump
                  </Button>
                </div>

                {(() => {
                  const fix = quickFix("title");
                  const diagnosis = deepDiagnosis("title");
                  const evidence = fix?.evidence || diagnosis?.evidence || "";
                  const recommended = fix?.fix || diagnosis?.recommendedChange || "";
                  const issue = fix?.problem || diagnosis?.issue || "";
                  return (
                    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold text-white/80">Problem</p>
                        <p className="mt-2 text-sm leading-6 text-white/70">{issue || "The title isn’t specific enough to earn the click."}</p>
                        {evidence ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Evidence</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{evidence}</p>
                          </>
                        ) : null}
                        {recommended ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Recommended fix</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{recommended}</p>
                          </>
                        ) : null}
                        {fix?.example ? (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-white/70">{fix.example}</p>
                            <CopyInlineButton value={fix.example} label="Copy example" />
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold text-white/80">Title suggestions</p>
                        <p className="mt-2 text-sm text-white/55">Pick one, then tweak 1–2 words to match your real video promise.</p>
                        <div className="mt-4 space-y-3">
                          {(isQuickReport ? (quickReport as QuickAuditReport)?.beforeAfter.betterTitles : deepReport?.fixes.titles || [])
                            .filter(Boolean)
                            .slice(0, 8)
                            .map((title, index) => (
                              <div key={`${title}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                                <p className="text-sm text-white/80">{title}</p>
                                <CopyInlineButton value={title} />
                              </div>
                            ))}
                          {!((isQuickReport ? (quickReport as QuickAuditReport)?.beforeAfter.betterTitles : deepReport?.fixes.titles) ?? []).length ? (
                            <p className="text-sm text-white/55">No title suggestions returned for this video.</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </PanelCard>

              {(() => {
                const transcriptSegmentsForHook: TranscriptSegment[] =
                  (deepReport?.transcript?.segments as TranscriptSegment[] | undefined) ?? [];
                const currentHook =
                  (isQuickReport ? (quickReport as QuickAuditReport)?.beforeAfter.currentHook : null)
                  || currentHookFromTranscriptSegments(transcriptSegmentsForHook);
                const improvedHook =
                  (isQuickReport ? (quickReport as QuickAuditReport)?.beforeAfter.hookRewrite : null)
                  || deepReport?.fixes.hookRewrite
                  || "";

                if (!transcriptSeemsAvailable || !currentHook) return null;

                const hookFix = quickFix("hook");
                const hookDiagnosis = deepDiagnosis("hook");
                return (
                  <PanelCard className="p-5" id="audit-hook">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Better First 15 Seconds</p>
                    <p className="mt-2 text-sm text-white/55">You have ~15 seconds to earn the next minute.</p>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white/80">Current hook</p>
                          <CopyInlineButton value={currentHook} label="Copy" />
                        </div>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/75">{currentHook}</p>
                        {hookFix?.evidence || hookDiagnosis?.evidence ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Evidence</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{hookFix?.evidence || hookDiagnosis?.evidence}</p>
                          </>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white/80">Improved hook</p>
                          <CopyInlineButton value={improvedHook} label="Copy" />
                        </div>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/75">
                          {improvedHook || "No rewritten hook returned for this video."}
                        </p>
                        {hookFix?.fix || hookDiagnosis?.recommendedChange ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Recommended fix</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{hookFix?.fix || hookDiagnosis?.recommendedChange}</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </PanelCard>
                );
              })()}

              <PanelCard className="p-5" id="audit-description">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Description Rewrite</p>
                <p className="mt-2 text-sm text-white/55">Make the first lines scan like a top creator: hook → value → bullets → CTA.</p>

                {(() => {
                  const fix = quickFix("description");
                  const diagnosis = deepDiagnosis("description");
                  const rewrite =
                    (isQuickReport ? (quickReport as QuickAuditReport)?.beforeAfter.descriptionRewrite : null)
                    || deepReport?.fixes.description
                    || "";
                  return (
                    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-xs font-semibold text-white/80">Problem</p>
                        <p className="mt-2 text-sm leading-6 text-white/70">{fix?.problem || diagnosis?.issue || "The description doesn’t convert scanners into watchers."}</p>
                        {fix?.evidence || diagnosis?.evidence ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Evidence</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{fix?.evidence || diagnosis?.evidence}</p>
                          </>
                        ) : null}
                        {fix?.fix || diagnosis?.recommendedChange ? (
                          <>
                            <p className="mt-4 text-xs font-semibold text-white/80">Recommended fix</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{fix?.fix || diagnosis?.recommendedChange}</p>
                          </>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white/80">Suggested description</p>
                          <CopyInlineButton value={rewrite} />
                        </div>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/75">
                          {rewrite || "No description rewrite returned for this video."}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </PanelCard>

              <PanelCard className="p-5" id="audit-tags">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Tags</p>
                    <p className="mt-2 text-sm text-white/55">Mix long-tail, mid-volume, and high-volume tags for search + suggested.</p>
                  </div>
                  <CopyInlineButton
                    value={(
                      (isQuickReport ? (quickReport as QuickAuditReport)?.tags.recommended : deepReport?.fixes.tags || []) ?? []
                    )
                      .filter(Boolean)
                      .join(", ")}
                    label="Copy all"
                  />
                </div>

                {(() => {
                  const fix = quickFix("tags");
                  const diagnosis = deepDiagnosis("tags");
                  const tagList = (isQuickReport ? (quickReport as QuickAuditReport)?.tags.recommended : deepReport?.fixes.tags || []) ?? [];
                  return (
                    <div className="mt-5 space-y-4">
                      {fix?.evidence || diagnosis?.evidence || fix?.fix || diagnosis?.recommendedChange ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs font-semibold text-white/80">Notes</p>
                          {fix?.evidence || diagnosis?.evidence ? (
                            <p className="mt-2 text-sm leading-6 text-white/70">{fix?.evidence || diagnosis?.evidence}</p>
                          ) : null}
                          {fix?.fix || diagnosis?.recommendedChange ? (
                            <p className="mt-2 text-sm leading-6 text-white/70">{fix?.fix || diagnosis?.recommendedChange}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {tagList.filter(Boolean).slice(0, 60).map((tagValue, index) => (
                          <span
                            key={`${tagValue}-${index}`}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-semibold text-white/70"
                          >
                            <Tag className="h-3.5 w-3.5 text-white/35" />
                            {tagValue}
                          </span>
                        ))}
                        {!tagList.length ? <p className="text-sm text-white/55">No tags returned for this video.</p> : null}
                      </div>
                      <p className="text-xs leading-5 text-white/45">YouTube accepts up to ~500 characters of tags across your whole list.</p>
                    </div>
                  );
                })()}
              </PanelCard>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={thumbnailModalOpen} onOpenChange={setThumbnailModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto pt-10">
          <DialogHeader>
            <DialogTitle>Create Thumbnail</DialogTitle>
            <DialogDescription>Upload what the audit needs, set overlay text, and generate a 16:9 thumbnail for this video.</DialogDescription>
          </DialogHeader>
          {report && preview ? (
            <div className="space-y-4">
              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Video</p>
                <p className="mt-2 text-base font-semibold text-white">{preview.video.title}</p>
                <p className="mt-2 text-sm text-white/55">
                  {isQuickReport ? quickReport?.thumbnailFix.concept : deepReport?.fixes.thumbnailIdea}
                </p>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Assets</p>
                <p className="mt-2 text-sm text-white/55">Upload only what you have. If you skip an upload, describe the alternative.</p>
                <p className="mt-2 text-xs text-white/40">JPG only · 16:9 output · 1280×720px · min width 640px · max 2 MB</p>

                {inferThumbnailAssetSlots().some((slot) => slot.isFace) ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">Face handling</p>
                    <p className="mt-2 text-sm leading-6 text-white/65">
                      Upload the exact face/photo you want to use. DayTabs will only improve lighting, sharpness, color, background, and composition. It will NOT change your face.
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4">
                  {inferThumbnailAssetSlots().map((slot) => {
                    const existing = thumbnailSourceImages.find((img) => img.name.startsWith(`${slot.key}:`)) ?? null;
                    const alternative = thumbnailAssetAlternatives[slot.key] ?? "";
                    return (
                      <div key={slot.key} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{slot.label}</p>
                            {slot.helper ? <p className="mt-2 text-xs leading-5 text-white/55">{slot.helper}</p> : null}
                          </div>
                          {existing ? (
                            <button
                              type="button"
                              onClick={() => {
                                setThumbnailSourceImages((current) => current.filter((img) => !img.name.startsWith(`${slot.key}:`)));
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                            >
                              <X className="h-4 w-4" />
                              Remove
                            </button>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white">
                              <ImagePlus className="h-4 w-4" />
                              Upload JPG
                              <input
                                type="file"
                                accept="image/jpeg,image/jpg,.jpg,.jpeg"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  void (async () => {
                                    try {
                                      const dataUrl = await resizeImageFileToDataUrl(file);
                                      setThumbnailSourceImages((current) => {
                                        const withoutSlot = current.filter((img) => !img.name.startsWith(`${slot.key}:`));
                                        return [...withoutSlot, { name: `${slot.key}:${file.name}`, dataUrl }].slice(0, 4);
                                      });
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : "Could not read source image");
                                    }
                                  })();
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>

                        {existing ? (
                          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                            <img src={existing.dataUrl} alt={existing.name} className="h-44 w-full object-cover" />
                          </div>
                        ) : (
                          <div className="mt-4">
                            <p className="text-xs text-white/55">Describe alternative (e.g. no face, use product/visual instead)</p>
                            <Textarea
                              value={alternative}
                              onChange={(event) => {
                                const value = event.target.value;
                                setThumbnailAssetAlternatives((current) => ({ ...current, [slot.key]: value }));
                              }}
                              placeholder="Optional"
                              className="mt-3 min-h-20"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                <p className="mt-3 text-xs text-white/40">
                  Auto-selected from audit: {deepReport?.fixes.recommendedThumbnailStyle || preview.recommendedThumbnailStyle}
                </p>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Overlay text</p>
                <Textarea
                  value={thumbnailTextPreference}
                  onChange={(event) => setThumbnailTextPreference(event.target.value)}
                  placeholder="Optional. Leave empty and AI will generate the strongest thumbnail text."
                  className="mt-3 min-h-24"
                />
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Prompt</p>
                <p className="mt-2 text-sm text-white/55">Editable. We always append strict face-preservation rules when generating.</p>
                <Textarea
                  value={thumbnailPrompt}
                  onChange={(event) => setThumbnailPrompt(event.target.value)}
                  placeholder="Describe the thumbnail composition, lighting, text, and vibe."
                  className="mt-3 min-h-28"
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

import { jsPDF } from "jspdf";

// ─── Colour palette (dark purple theme → inverted for white PDF) ────────────
const COL = {
  primary:   [109, 40, 217] as [number, number, number],   // violet-700
  purple:    [139, 92, 246] as [number, number, number],   // violet-500
  text:      [15, 10, 30]   as [number, number, number],   // near-black
  muted:     [100, 90, 120] as [number, number, number],   // slate
  green:     [22, 163, 74]  as [number, number, number],
  yellow:    [202, 138, 4]  as [number, number, number],
  red:       [220, 38, 38]  as [number, number, number],
  bgLight:   [245, 242, 255] as [number, number, number],  // violet-50
  bgSection: [250, 249, 255] as [number, number, number],
};

const PAGE_W = 210;   // A4
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface DocState {
  doc: jsPDF;
  y: number;
  page: number;
}

function scoreColor(score: number): [number, number, number] {
  if (score >= 70) return COL.green;
  if (score >= 45) return COL.yellow;
  return COL.red;
}

function ensureSpace(state: DocState, needed: number) {
  if (state.y + needed > PAGE_H - MARGIN) {
    state.doc.addPage();
    state.page += 1;
    state.y = MARGIN + 6;
  }
}

function drawHRule(state: DocState, color: [number, number, number] = [220, 215, 235]) {
  state.doc.setDrawColor(...color);
  state.doc.setLineWidth(0.3);
  state.doc.line(MARGIN, state.y, PAGE_W - MARGIN, state.y);
  state.y += 4;
}

function sectionHeader(state: DocState, title: string) {
  ensureSpace(state, 14);
  state.y += 2;
  state.doc.setFillColor(...COL.bgLight);
  state.doc.roundedRect(MARGIN, state.y, CONTENT_W, 8, 1.5, 1.5, "F");
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(9);
  state.doc.setTextColor(...COL.primary);
  state.doc.text(title.toUpperCase(), MARGIN + 4, state.y + 5.5);
  state.y += 11;
}

function bullet(state: DocState, text: string, indent = 0) {
  ensureSpace(state, 8);
  const maxW = CONTENT_W - indent - 8;
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(8.5);
  state.doc.setTextColor(...COL.muted);
  state.doc.text("•", MARGIN + indent, state.y);
  const lines = state.doc.splitTextToSize(text, maxW);
  state.doc.setTextColor(...COL.text);
  state.doc.text(lines, MARGIN + indent + 4, state.y);
  state.y += lines.length * 4.5 + 1.5;
}

function bodyText(state: DocState, text: string, indent = 0, color: [number, number, number] = COL.text) {
  ensureSpace(state, 7);
  const maxW = CONTENT_W - indent;
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(8.5);
  state.doc.setTextColor(...color);
  const lines = state.doc.splitTextToSize(text, maxW);
  state.doc.text(lines, MARGIN + indent, state.y);
  state.y += lines.length * 4.5 + 1;
}

function labelValue(state: DocState, label: string, value: string | number) {
  ensureSpace(state, 6);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(8);
  state.doc.setTextColor(...COL.muted);
  state.doc.text(`${label}:`, MARGIN, state.y);
  const lw = state.doc.getTextWidth(`${label}: `);
  state.doc.setFont("helvetica", "normal");
  state.doc.setTextColor(...COL.text);
  const lines = state.doc.splitTextToSize(String(value), CONTENT_W - lw - 2);
  state.doc.text(lines, MARGIN + lw, state.y);
  state.y += lines.length * 4.5 + 1.5;
}

function scoreRow(state: DocState, label: string, numeric: number, assessment = "") {
  ensureSpace(state, 7);
  const col = scoreColor(numeric);
  // Label
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(8.5);
  state.doc.setTextColor(...COL.text);
  state.doc.text(label, MARGIN, state.y);
  // Score badge
  const scoreStr = `${numeric}/100`;
  state.doc.setFont("helvetica", "bold");
  state.doc.setTextColor(...col);
  state.doc.text(scoreStr, MARGIN + 55, state.y);
  // Mini bar
  const barX = MARGIN + 78;
  const barW = 50;
  const barH = 2.5;
  const barY = state.y - 2;
  state.doc.setFillColor(230, 225, 245);
  state.doc.roundedRect(barX, barY, barW, barH, 1, 1, "F");
  state.doc.setFillColor(...col);
  state.doc.roundedRect(barX, barY, (barW * numeric) / 100, barH, 1, 1, "F");
  // Assessment (truncated)
  if (assessment) {
    const short = assessment.length > 55 ? assessment.substring(0, 52) + "…" : assessment;
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(7.5);
    state.doc.setTextColor(...COL.muted);
    state.doc.text(short, barX + barW + 3, state.y);
  }
  state.y += 6;
}

export async function generateAnalysisPDF(
  results: Record<string, any>,
  videoFileName = "analysis"
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const state: DocState = { doc, y: MARGIN, page: 1 };
  const baseName = videoFileName.replace(/\.[^.]+$/, "");
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ─── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(...COL.primary);
  doc.rect(0, 0, PAGE_W, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("DayTabs", MARGIN, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 180, 255);
  doc.text("AI Video Analysis Report", MARGIN, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 160, 240);
  doc.text(baseName, MARGIN, 27);
  doc.text(dateStr, PAGE_W - MARGIN, 27, { align: "right" });

  state.y = 42;

  // ─── Overall score bar ────────────────────────────────────────────────────
  const quality = results.quality ?? {};
  const overallScore = quality.score ?? quality.overallScore ?? quality.overallVisualScore ?? 0;

  const scoreCol = scoreColor(overallScore);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...scoreCol);
  doc.text(String(overallScore), MARGIN, state.y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COL.muted);
  doc.text("/ 100  Overall Quality Score", MARGIN + 16, state.y + 4);

  const verdict = overallScore >= 70 ? "Strong video — ready to publish."
    : overallScore >= 45 ? "Good foundation — a few improvements needed."
    : "Needs attention before publishing.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COL.text);
  doc.text(verdict, MARGIN + 16, state.y + 9);

  // Big score progress bar
  const bx = MARGIN + 16; const bw = CONTENT_W - 16; const by = state.y + 12; const bh = 3.5;
  doc.setFillColor(220, 215, 240);
  doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, "F");
  doc.setFillColor(...scoreCol);
  doc.roundedRect(bx, by, (bw * overallScore) / 100, bh, 1.5, 1.5, "F");

  state.y += 22;

  // Top fix callout
  if (quality.topFix) {
    ensureSpace(state, 12);
    doc.setFillColor(255, 248, 230);
    doc.roundedRect(MARGIN, state.y, CONTENT_W, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COL.yellow);
    doc.text("MOST IMPORTANT FIX", MARGIN + 3, state.y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 60, 10);
    const fixLines = doc.splitTextToSize(quality.topFix, CONTENT_W - 6);
    doc.text(fixLines[0] ?? "", MARGIN + 3, state.y + 8);
    state.y += 13;
  }

  drawHRule(state);

  // ─── Quality Dimensions ───────────────────────────────────────────────────
  sectionHeader(state, "Quality Dimensions");

  const dims = [
    ["Lighting",          quality.lighting],
    ["Brightness",        quality.brightness],
    ["Contrast",          quality.contrast],
    ["Background",        quality.background],
    ["Framing",           quality.framing],
    ["Sharpness",         quality.sharpness],
    ["Stability",         quality.stability],
    ["Audio Clarity",     quality.audioClarity],
    ["Audio Volume",      quality.audioVolume],
    ["Background Noise",  quality.backgroundNoise],
  ] as const;

  for (const [label, dim] of dims) {
    if (!dim) continue;
    scoreRow(state, label, dim.numeric ?? 0, dim.assessment ?? "");
  }

  if (quality.fillerWords?.numeric > 0) {
    ensureSpace(state, 6);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8.5);
    state.doc.setTextColor(...COL.text);
    doc.text("Filler Words", MARGIN, state.y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COL.yellow);
    doc.text(`${quality.fillerWords.numeric} detected`, MARGIN + 55, state.y);
    state.y += 6;
  }

  if (quality.colorGradingRecommendation) {
    state.y += 2;
    labelValue(state, "Color Grading", quality.colorGradingRecommendation);
  }

  drawHRule(state);

  // ─── Editing Suggestions ─────────────────────────────────────────────────
  const editing = results.editing ?? {};
  if (editing.rewrittenHook || editing.hooks?.length || editing.editingSuggestions?.length) {
    sectionHeader(state, "Editing");

    if (editing.rewrittenHook) {
      ensureSpace(state, 12);
      doc.setFillColor(...COL.bgLight);
      doc.roundedRect(MARGIN, state.y, CONTENT_W, 10, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...COL.primary);
      doc.text("REWRITTEN HOOK", MARGIN + 3, state.y + 4);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.text);
      const hookLines = doc.splitTextToSize(`"${editing.rewrittenHook}"`, CONTENT_W - 6);
      doc.text(hookLines[0] ?? "", MARGIN + 3, state.y + 8.5);
      state.y += 13;
    }

    if (editing.hooks?.length) {
      state.y += 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.muted);
      doc.text("Hook Moments", MARGIN, state.y);
      state.y += 5;
      for (const h of (editing.hooks as any[]).slice(0, 5)) {
        const ts = h.start ? `[${h.start}]` : "";
        bullet(state, `${ts} ${h.text ?? ""}`.trim());
      }
    }

    if (editing.editingSuggestions?.length) {
      state.y += 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.muted);
      doc.text("Editing Tips", MARGIN, state.y);
      state.y += 5;
      for (const tip of (editing.editingSuggestions as string[]).slice(0, 6)) {
        bullet(state, tip);
      }
    }

    if (editing.removeSections?.length) {
      state.y += 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.muted);
      doc.text("Sections to Cut", MARGIN, state.y);
      state.y += 5;
      for (const s of (editing.removeSections as any[]).slice(0, 8)) {
        bullet(state, `[${s.start} → ${s.end}] ${s.reason ?? ""}`);
      }
    }

    drawHRule(state);
  }

  // ─── Publish Package ─────────────────────────────────────────────────────
  const publish = results.publish ?? {};
  const publishKeys = Object.keys(publish);
  if (publishKeys.length) {
    sectionHeader(state, "Publish Package");

    for (const platform of publishKeys) {
      const pd = publish[platform] as any;
      if (!pd) continue;

      ensureSpace(state, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COL.purple);
      const platformLabel = platform.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      doc.text(platformLabel, MARGIN, state.y);
      state.y += 5;

      if (pd.titles?.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COL.muted);
        doc.text("Titles", MARGIN, state.y);
        state.y += 4;
        for (const [i, t] of (pd.titles as string[]).entries()) {
          bullet(state, `${i + 1}. ${t}`, 2);
        }
      }

      if (pd.description) {
        state.y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COL.muted);
        doc.text("Description", MARGIN, state.y);
        state.y += 4;
        bodyText(state, pd.description.substring(0, 800) + (pd.description.length > 800 ? "…" : ""), 2);
      }

      if (pd.hashtags?.length) {
        state.y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COL.muted);
        doc.text("Tags", MARGIN, state.y);
        state.y += 4;
        const tagStr = (pd.hashtags as any[])
          .map(t => String(t.tag ?? t).replace(/^#+/, ""))
          .join(", ");
        bodyText(state, tagStr, 2, COL.muted);
      }

      if (pd.timestamps?.length) {
        state.y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COL.muted);
        doc.text("Chapter Timestamps", MARGIN, state.y);
        state.y += 4;
        for (const ts of (pd.timestamps as any[]).slice(0, 12)) {
          ensureSpace(state, 5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...COL.purple);
          doc.text(ts.time ?? "", MARGIN + 2, state.y);
          doc.setTextColor(...COL.text);
          doc.text(ts.label ?? "", MARGIN + 14, state.y);
          state.y += 4.5;
        }
      }

      state.y += 3;
      drawHRule(state);
    }
  }

  // ─── Short Clip Ideas ─────────────────────────────────────────────────────
  const shortClips = results.shortClips ?? {};
  const clips: any[] = shortClips.clips ?? (Array.isArray(shortClips) ? shortClips : []);
  if (clips.length) {
    sectionHeader(state, "Short Clip Ideas");
    for (const [i, clip] of clips.entries()) {
      ensureSpace(state, 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COL.purple);
      doc.text(`${i + 1}. ${clip.title ?? `Clip ${i + 1}`}`, MARGIN, state.y);

      const ts = (clip.start && clip.end) ? ` — ${clip.start} → ${clip.end}` : "";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...COL.muted);
      doc.text(ts, MARGIN + doc.getTextWidth(`${i + 1}. ${clip.title ?? ""}`), state.y);
      state.y += 5;

      if (clip.hook) bodyText(state, `"${clip.hook}"`, 3, [100, 80, 180]);
      if (clip.whyItWorks) bodyText(state, clip.whyItWorks, 3);
      if (clip.tacticalNote) bodyText(state, `Tip: ${clip.tacticalNote}`, 3, COL.muted);
      if (clip.platforms?.length) {
        bodyText(state, `Platforms: ${(clip.platforms as string[]).join(", ")}`, 3, COL.muted);
      }
      state.y += 2;
    }
    drawHRule(state);
  }

  // ─── Transcript ───────────────────────────────────────────────────────────
  const transcript = results.transcript ?? {};
  const fullText: string = transcript.fullText ?? "";
  if (fullText) {
    sectionHeader(state, "Transcript (excerpt)");
    const excerpt = fullText.length > 1200 ? fullText.substring(0, 1200) + "\n\n[…truncated — full transcript in app]" : fullText;
    bodyText(state, excerpt, 0, COL.muted);
    drawHRule(state);
  }

  // ─── SRT subtitle file ────────────────────────────────────────────────────
  const subtitleFile = results.subtitleFile;
  if (subtitleFile?.content) {
    sectionHeader(state, "Subtitle File (.srt)");
    const srtExcerpt = subtitleFile.content.length > 600
      ? subtitleFile.content.substring(0, 600) + "\n\n[…truncated]"
      : subtitleFile.content;
    bodyText(state, srtExcerpt, 0, COL.muted);
    drawHRule(state);
  }

  // ─── Footer on each page ─────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COL.muted);
    doc.text(`DayTabs Analysis Report — ${dateStr}`, MARGIN, PAGE_H - 8);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  doc.save(`${baseName}-daytabs-report.pdf`);
}

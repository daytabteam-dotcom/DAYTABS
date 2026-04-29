import sharp from "sharp";
import { openai } from "./openai";
import { logTokenUsage, usageTokens } from "./logTokens";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function extractJSON(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON found in response");
  return raw.slice(start, end + 1);
}

function parseAiJson(raw: string) {
  return JSON.parse(extractJSON(raw));
}

export interface ThumbnailComposerBlueprint {
  canvas: {
    width: 1280;
    height: 720;
    background: {
      type: "image_blur" | "solid" | "gradient";
      sourceImageIndex: number;
      blur: number;
      brightness: number;
      overlayGradient: {
        direction: "left-right" | "right-left" | "top-bottom" | "bottom-top";
        colors: string[];
      } | null;
    };
  };
  cropPlan: {
    sourceImageIndex: number;
    mode: "cover" | "contain" | "manual";
    focusArea: { x: number; y: number; width: number; height: number };
    reason: string;
  };
  subjects: Array<{
    id: string;
    type: "person" | "product" | "artwork" | "screenshot" | "object";
    sourceImageIndex: number;
    preserveExactly: boolean;
    position: { x: number; y: number; width: number; height: number };
    edits: {
      brightness: number;
      contrast: number;
      saturation: number;
      sharpen: boolean;
      backgroundBlur: boolean;
    };
    reason: string;
  }>;
  textLayers: Array<{
    id: string;
    text: string;
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    color: string;
    strokeColor: string | null;
    strokeWidth: number;
    shadow: boolean;
    position: { x: number; y: number; width: number; height: number };
    alignment: "left" | "center" | "right";
    reason: string;
  }>;
  shapeLayers: Array<{
    id: string;
    type: "arrow" | "circle" | "rectangle" | "highlight" | "line";
    color: string;
    opacity: number;
    position: { x: number; y: number; width: number; height: number };
    rotation: number;
    reason: string;
  }>;
  layerOrder: string[];
  safeZoneNotes: string[];
  thumbnailReasoning: string;
  requiredAssets: Array<{
    type: "face" | "product" | "artwork" | "screenshot" | "object";
    label: string;
    required: boolean;
    helperText: string;
    alternativeIfMissing: string;
  }>;
  overlayTextOptions: string[];
  selectedOverlayText: string;
  fontRecommendations: string[];
}

type OverlayGradient = NonNullable<ThumbnailComposerBlueprint["canvas"]["background"]["overlayGradient"]>;

function safeHexOrRgba(input: string, fallback: string) {
  const value = input.trim();
  if (!value) return fallback;
  if (/^#[0-9a-f]{3}$/i.test(value)) return value;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(value)) return value;
  return fallback;
}

function normalizeBlueprint(raw: unknown): ThumbnailComposerBlueprint {
  const record = asRecord(raw);
  const canvasRecord = asRecord(record.canvas);
  const backgroundRecord = asRecord(canvasRecord.background);
  const overlayGradientRecord = asRecord(backgroundRecord.overlayGradient);
  const overlayGradient =
    overlayGradientRecord.direction
      ? {
          direction: (asString(overlayGradientRecord.direction) as OverlayGradient["direction"]) || "left-right",
          colors: asArray(overlayGradientRecord.colors).map((item) => String(item)).filter(Boolean).slice(0, 6),
        }
      : null;

  const cropPlanRecord = asRecord(record.cropPlan);
  const focusAreaRecord = asRecord(cropPlanRecord.focusArea);

  const subjects = asArray(record.subjects).map((item, index) => {
    const subject = asRecord(item);
    const position = asRecord(subject.position);
    const edits = asRecord(subject.edits);
    return {
      id: asString(subject.id) || `subject_${index + 1}`,
      type: ((asString(subject.type) as any) || "object") as ThumbnailComposerBlueprint["subjects"][number]["type"],
      sourceImageIndex: Math.max(0, Math.floor(parseNumber(subject.sourceImageIndex, 0))),
      preserveExactly: Boolean(subject.preserveExactly),
      position: {
        x: clamp(parseNumber(position.x, 0), 0, 1280),
        y: clamp(parseNumber(position.y, 0), 0, 720),
        width: clamp(parseNumber(position.width, 600), 1, 1280),
        height: clamp(parseNumber(position.height, 600), 1, 720),
      },
      edits: {
        brightness: clamp(parseNumber(edits.brightness, 1), 0.3, 2.2),
        contrast: clamp(parseNumber(edits.contrast, 1), 0.3, 2.2),
        saturation: clamp(parseNumber(edits.saturation, 1), 0.0, 2.5),
        sharpen: Boolean(edits.sharpen),
        backgroundBlur: Boolean(edits.backgroundBlur),
      },
      reason: asString(subject.reason) || "",
    };
  });

  const textLayers = asArray(record.textLayers).map((item, index) => {
    const layer = asRecord(item);
    const position = asRecord(layer.position);
    return {
      id: asString(layer.id) || `text_${index + 1}`,
      text: (asString(layer.text) || "").slice(0, 80),
      fontFamily: asString(layer.fontFamily) || "Inter",
      fontWeight: clamp(Math.round(parseNumber(layer.fontWeight, 800)), 100, 950),
      fontSize: clamp(Math.round(parseNumber(layer.fontSize, 88)), 10, 240),
      color: safeHexOrRgba(asString(layer.color) || "", "#ffffff"),
      strokeColor: layer.strokeColor == null ? null : safeHexOrRgba(asString(layer.strokeColor) || "", "#000000"),
      strokeWidth: clamp(Math.round(parseNumber(layer.strokeWidth, 0)), 0, 18),
      shadow: Boolean(layer.shadow),
      position: {
        x: clamp(parseNumber(position.x, 90), 0, 1280),
        y: clamp(parseNumber(position.y, 90), 0, 720),
        width: clamp(parseNumber(position.width, 560), 1, 1280),
        height: clamp(parseNumber(position.height, 280), 1, 720),
      },
      alignment: ((asString(layer.alignment) as any) || "left") as "left" | "center" | "right",
      reason: asString(layer.reason) || "",
    };
  });

  const shapeLayers = asArray(record.shapeLayers).map((item, index) => {
    const layer = asRecord(item);
    const position = asRecord(layer.position);
    return {
      id: asString(layer.id) || `shape_${index + 1}`,
      type: ((asString(layer.type) as any) || "rectangle") as ThumbnailComposerBlueprint["shapeLayers"][number]["type"],
      color: safeHexOrRgba(asString(layer.color) || "", "#ffffff"),
      opacity: clamp(parseNumber(layer.opacity, 0.7), 0, 1),
      position: {
        x: clamp(parseNumber(position.x, 0), 0, 1280),
        y: clamp(parseNumber(position.y, 0), 0, 720),
        width: clamp(parseNumber(position.width, 260), 1, 1280),
        height: clamp(parseNumber(position.height, 140), 1, 720),
      },
      rotation: clamp(parseNumber(layer.rotation, 0), -360, 360),
      reason: asString(layer.reason) || "",
    };
  });

  const layerOrder = asArray(record.layerOrder).map((item) => String(item)).filter(Boolean).slice(0, 80);

  return {
    canvas: {
      width: 1280,
      height: 720,
      background: {
        type: (asString(backgroundRecord.type) as any) || "image_blur",
        sourceImageIndex: Math.max(0, Math.floor(parseNumber(backgroundRecord.sourceImageIndex, 0))),
        blur: clamp(parseNumber(backgroundRecord.blur, 18), 0, 64),
        brightness: clamp(parseNumber(backgroundRecord.brightness, 0.72), 0.2, 1.5),
        overlayGradient: overlayGradient?.colors?.length ? overlayGradient : null,
      },
    },
    cropPlan: {
      sourceImageIndex: Math.max(0, Math.floor(parseNumber(cropPlanRecord.sourceImageIndex, 0))),
      mode: ((asString(cropPlanRecord.mode) as any) || "cover") as "cover" | "contain" | "manual",
      focusArea: {
        x: clamp(parseNumber(focusAreaRecord.x, 0.25), 0, 1),
        y: clamp(parseNumber(focusAreaRecord.y, 0.15), 0, 1),
        width: clamp(parseNumber(focusAreaRecord.width, 0.5), 0.05, 1),
        height: clamp(parseNumber(focusAreaRecord.height, 0.7), 0.05, 1),
      },
      reason: asString(cropPlanRecord.reason) || "",
    },
    subjects,
    textLayers,
    shapeLayers,
    layerOrder,
    safeZoneNotes: asArray(record.safeZoneNotes).map((item) => String(item)).filter(Boolean).slice(0, 10),
    thumbnailReasoning: asString(record.thumbnailReasoning) || "",
    requiredAssets: asArray(record.requiredAssets).map((item) => {
      const asset = asRecord(item);
      return {
        type: ((asString(asset.type) as any) || "object") as ThumbnailComposerBlueprint["requiredAssets"][number]["type"],
        label: asString(asset.label) || "",
        required: Boolean(asset.required),
        helperText: asString(asset.helperText) || "",
        alternativeIfMissing: asString(asset.alternativeIfMissing) || "",
      };
    }).filter((item) => item.label).slice(0, 12),
    overlayTextOptions: asArray(record.overlayTextOptions).map((item) => String(item)).filter(Boolean).slice(0, 10),
    selectedOverlayText: asString(record.selectedOverlayText) || "",
    fontRecommendations: asArray(record.fontRecommendations).map((item) => String(item)).filter(Boolean).slice(0, 10),
  };
}

function parseDataUrlImage(input: string) {
  const match = input.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Source images must be base64 data URLs (jpeg/png/webp).");
  const mimeType = match[1]!.toLowerCase() === "image/jpg" ? "image/jpeg" : match[1]!.toLowerCase();
  const buffer = Buffer.from(match[2]!, "base64");
  return { mimeType, buffer };
}

function buildGradientSvg(width: number, height: number, direction: string, colors: string[]) {
  const stops = colors.length ? colors : ["rgba(0,0,0,0.0)", "rgba(0,0,0,0.55)"];
  const [x1, y1, x2, y2] = (() => {
    if (direction === "right-left") return ["100%", "0%", "0%", "0%"];
    if (direction === "top-bottom") return ["0%", "0%", "0%", "100%"];
    if (direction === "bottom-top") return ["0%", "100%", "0%", "0%"];
    return ["0%", "0%", "100%", "0%"];
  })();
  const stopsSvg = stops
    .map((color, index) => {
      const offset = stops.length === 1 ? 0 : Math.round((index / (stops.length - 1)) * 100);
      return `<stop offset="${offset}%" stop-color="${color}"/>`;
    })
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
          ${stopsSvg}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#g)"/>
    </svg>`,
  );
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTextSvg(layer: ThumbnailComposerBlueprint["textLayers"][number]) {
  const x = Math.round(layer.position.x);
  const y = Math.round(layer.position.y);
  const width = Math.round(layer.position.width);
  const height = Math.round(layer.position.height);
  const fontSize = Math.round(layer.fontSize);
  const anchor = layer.alignment === "center" ? "middle" : layer.alignment === "right" ? "end" : "start";
  const textX = layer.alignment === "center" ? x + width / 2 : layer.alignment === "right" ? x + width : x;
  const baseline = Math.max(0, Math.round(fontSize * 0.95));
  const textY = y + baseline;
  const shadowFilter = layer.shadow
    ? `<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
         <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(0,0,0,0.55)"/>
       </filter>`
    : "";

  const strokeColor = layer.strokeColor ? `stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" paint-order="stroke fill"` : "";
  const filterAttr = layer.shadow ? `filter="url(#shadow)"` : "";
  const safeText = escapeXml(layer.text || "");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>${shadowFilter}</defs>
      <text x="${textX - x}" y="${textY - y}" ${filterAttr}
        font-family="${escapeXml(layer.fontFamily)}"
        font-weight="${layer.fontWeight}"
        font-size="${fontSize}"
        fill="${layer.color}"
        ${strokeColor}
        text-anchor="${anchor}"
        dominant-baseline="alphabetic"
      >${safeText}</text>
    </svg>`,
  );
}

function buildShapeSvg(layer: ThumbnailComposerBlueprint["shapeLayers"][number]) {
  const width = Math.round(layer.position.width);
  const height = Math.round(layer.position.height);
  const opacity = clamp(layer.opacity, 0, 1);
  const color = layer.color;

  if (layer.type === "circle") {
    const r = Math.floor(Math.min(width, height) / 2);
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <circle cx="${Math.floor(width / 2)}" cy="${Math.floor(height / 2)}" r="${r}" fill="${color}" fill-opacity="${opacity}"/>
      </svg>`,
    );
  }

  if (layer.type === "line") {
    const strokeWidth = Math.max(2, Math.floor(Math.min(width, height) / 10));
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <line x1="0" y1="${Math.floor(height / 2)}" x2="${width}" y2="${Math.floor(height / 2)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
      </svg>`,
    );
  }

  if (layer.type === "arrow") {
    const strokeWidth = Math.max(10, Math.floor(Math.min(width, height) / 8));
    const bodyY = Math.floor(height / 2);
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <path d="M ${Math.floor(strokeWidth / 2)} ${bodyY} L ${Math.floor(width - strokeWidth)} ${bodyY}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
        <path d="M ${Math.floor(width - strokeWidth)} ${Math.floor(height * 0.2)} L ${width} ${bodyY} L ${Math.floor(width - strokeWidth)} ${Math.floor(height * 0.8)} Z" fill="${color}" fill-opacity="${opacity}"/>
      </svg>`,
    );
  }

  const isHighlight = layer.type === "highlight";
  const rx = Math.max(0, Math.floor(Math.min(width, height) / 6));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${color}" fill-opacity="${opacity * (isHighlight ? 0.55 : 1)}"/>
    </svg>`,
  );
}

function sortLayerIds(blueprint: ThumbnailComposerBlueprint) {
  const known = new Set<string>([
    ...blueprint.subjects.map((s) => s.id),
    ...blueprint.textLayers.map((t) => t.id),
    ...blueprint.shapeLayers.map((s) => s.id),
  ]);
  const ordered = blueprint.layerOrder.filter((id) => known.has(id));
  const missing = [...known].filter((id) => !ordered.includes(id));
  return ordered.concat(missing);
}

export async function generateThumbnailComposerBlueprint(
  userId: number,
  payload: {
    sourceImages: string[];
    thumbnailIdea: string | null;
    preferredOverlayText: string | null;
    stylePreference: string | null;
    thingsToAvoid: string | null;
    videoTitle: string | null;
    videoDescription: string | null;
    transcriptOpening: string | null;
    currentThumbnailDataUrl: string | null;
    auditInsights: string | null;
  },
) {
  if (!payload.sourceImages?.length) throw new Error("At least one source image is required.");
  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    {
      type: "text",
      text: JSON.stringify({
        thumbnailIdea: payload.thumbnailIdea,
        preferredOverlayText: payload.preferredOverlayText,
        stylePreference: payload.stylePreference,
        thingsToAvoid: payload.thingsToAvoid,
        videoTitle: payload.videoTitle,
        videoDescription: payload.videoDescription,
        transcriptOpening: payload.transcriptOpening,
        hasCurrentThumbnail: Boolean(payload.currentThumbnailDataUrl),
        auditInsights: payload.auditInsights,
        canvas: { width: 1280, height: 720 },
      }),
    },
  ];

  for (const imageUrl of payload.sourceImages.slice(0, 4)) {
    userContent.push({ type: "image_url", image_url: { url: imageUrl } });
  }
  if (payload.currentThumbnailDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: payload.currentThumbnailDataUrl } });
  }

  const systemPrompt = `You are DayTabs Thumbnail Composer: a creative director for YouTube thumbnails.

CORE PRINCIPLE:
You do NOT generate images. You create an editable blueprint for a human-designed thumbnail.

Your output will be rendered in a canvas editor, then exported server-side.

STRICT RULES:
- Return ONLY JSON. No markdown. No commentary.
- Canvas must be 1280x720.
- Thumbnail must communicate ONE idea with ONE focal subject. Avoid clutter.
- If any uploaded image contains a real face, the subject that includes the face MUST set preserveExactly=true.
- preserveExactly=true means: never change identity, facial features, skin tone, age, or expression. Only allow crop/zoom, color correction, contrast, sharpening, and background blur.
- Overlay text must be 1–5 words, mobile-readable, and must NOT repeat the video title.
- If preferred overlay text exists: refine it, do not ignore it.
- "thingsToAvoid" are hard constraints.

OUTPUT SHAPE (must match exactly):
{
  "canvas": {
    "width": 1280,
    "height": 720,
    "background": {
      "type": "image_blur" | "solid" | "gradient",
      "sourceImageIndex": number,
      "blur": number,
      "brightness": number,
      "overlayGradient": { "direction": "left-right" | "right-left" | "top-bottom" | "bottom-top", "colors": string[] } | null
    }
  },
  "cropPlan": {
    "sourceImageIndex": number,
    "mode": "cover" | "contain" | "manual",
    "focusArea": { "x": number, "y": number, "width": number, "height": number },
    "reason": string
  },
  "subjects": [
    {
      "id": string,
      "type": "person" | "product" | "artwork" | "screenshot" | "object",
      "sourceImageIndex": number,
      "preserveExactly": boolean,
      "position": { "x": number, "y": number, "width": number, "height": number },
      "edits": { "brightness": number, "contrast": number, "saturation": number, "sharpen": boolean, "backgroundBlur": boolean },
      "reason": string
    }
  ],
  "textLayers": [
    {
      "id": string,
      "text": string,
      "fontFamily": string,
      "fontWeight": number,
      "fontSize": number,
      "color": string,
      "strokeColor": string | null,
      "strokeWidth": number,
      "shadow": boolean,
      "position": { "x": number, "y": number, "width": number, "height": number },
      "alignment": "left" | "center" | "right",
      "reason": string
    }
  ],
  "shapeLayers": [
    {
      "id": string,
      "type": "arrow" | "circle" | "rectangle" | "highlight" | "line",
      "color": string,
      "opacity": number,
      "position": { "x": number, "y": number, "width": number, "height": number },
      "rotation": number,
      "reason": string
    }
  ],
  "layerOrder": string[],
  "safeZoneNotes": string[],
  "thumbnailReasoning": string,
  "requiredAssets": [
    {
      "type": "face" | "product" | "artwork" | "screenshot" | "object",
      "label": string,
      "required": boolean,
      "helperText": string,
      "alternativeIfMissing": string
    }
  ],
  "overlayTextOptions": string[],
  "selectedOverlayText": string,
  "fontRecommendations": string[]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2200,
  });

  await logTokenUsage({
    userId,
    feature: "youtubeThumbnailComposerBlueprint",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return normalizeBlueprint(parseAiJson(raw));
}

export async function exportThumbnailComposerImage(
  blueprintInput: unknown,
  sourceImages: string[],
) {
  if (!Array.isArray(sourceImages) || sourceImages.length === 0) throw new Error("At least one source image is required.");
  const blueprint = normalizeBlueprint(blueprintInput);
  const width = 1280;
  const height = 720;

  const images = sourceImages.slice(0, 6).map((src) => parseDataUrlImage(String(src)));

  const background = blueprint.canvas.background;
  let base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  });

  if (background.type === "solid") {
    // Keep base, but add a subtle overlay gradient if requested.
  } else if (background.type === "gradient") {
    const gradientSvg = buildGradientSvg(width, height, background.overlayGradient?.direction || "left-right", background.overlayGradient?.colors || []);
    base = base.composite([{ input: gradientSvg }]);
  } else {
    const bgSource = images[background.sourceImageIndex] ?? images[0]!;
    let bgLayer = sharp(bgSource.buffer).resize(width, height, { fit: "cover" }).blur(background.blur || 18);
    const brightness = clamp(background.brightness ?? 0.72, 0.2, 1.5);
    bgLayer = bgLayer.modulate({ brightness });
    const bgPng = await bgLayer.png().toBuffer();
    base = base.composite([{ input: bgPng }]);
    if (background.overlayGradient?.colors?.length) {
      const gradientSvg = buildGradientSvg(width, height, background.overlayGradient.direction, background.overlayGradient.colors);
      base = base.composite([{ input: gradientSvg, blend: "over" }]);
    }
  }

  const layerIds = sortLayerIds(blueprint);
  const idToSubject = new Map(blueprint.subjects.map((s) => [s.id, s] as const));
  const idToText = new Map(blueprint.textLayers.map((t) => [t.id, t] as const));
  const idToShape = new Map(blueprint.shapeLayers.map((s) => [s.id, s] as const));

  const composites: sharp.OverlayOptions[] = [];
  for (const id of layerIds) {
    const subject = idToSubject.get(id);
    if (subject) {
      const src = images[subject.sourceImageIndex] ?? images[0]!;
      let layer = sharp(src.buffer).resize(Math.round(subject.position.width), Math.round(subject.position.height), { fit: "cover" });
      layer = layer.modulate({
        brightness: clamp(subject.edits.brightness, 0.3, 2.2),
        saturation: clamp(subject.edits.saturation, 0, 2.5),
      });
      if (subject.edits.contrast !== 1) {
        layer = layer.linear(subject.edits.contrast, 0);
      }
      if (subject.edits.sharpen) layer = layer.sharpen();
      const png = await layer.png().toBuffer();
      composites.push({
        input: png,
        left: Math.round(subject.position.x),
        top: Math.round(subject.position.y),
      });
      continue;
    }

    const text = idToText.get(id);
    if (text && text.text.trim()) {
      const svg = buildTextSvg(text);
      composites.push({
        input: svg,
        left: Math.round(text.position.x),
        top: Math.round(text.position.y),
      });
      continue;
    }

    const shape = idToShape.get(id);
    if (shape) {
      const svg = buildShapeSvg(shape);
      composites.push({
        input: svg,
        left: Math.round(shape.position.x),
        top: Math.round(shape.position.y),
      });
    }
  }

  const rendered = await base
    .composite(composites)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return rendered.toString("base64");
}

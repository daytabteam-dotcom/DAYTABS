import { openai } from "../lib/openai";

export type CineStylePreset =
  | "Hollywood Realism"
  | "Documentary Realism"
  | "Dark Cinematic"
  | "Anime Cinematic"
  | "Historical Realism"
  | "Educational YouTube"
  | "Fantasy Realism";

export type CineShot = {
  title: string;
  description: string;
  camera_angle: string;
  composition: string;
  lighting: string;
  emotion: string;
  image_prompt: string;
  video_motion_prompt: string;
};

export type CineStylePlan = {
  style_prompt: string;
  negative_prompt: string;
  color_palette: string[] | null;
  mood_keywords: string[] | null;
  texture_keywords: string[] | null;
  lighting_keywords: string[] | null;
};

function stripJsonFence(raw: string) {
  const trimmed = raw.trim();
  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function extractJsonObject(raw: string) {
  const text = raw.trim();
  const start = text.indexOf("{");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

function extractJsonArray(raw: string) {
  const text = raw.trim();
  const start = text.indexOf("[");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") {
      inString = true;
      continue;
    }
    if (c === "[") depth += 1;
    if (c === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

async function chatJson<T>(input: { system: string; user: string; model?: string }): Promise<T> {
  const model = input.model ?? process.env.CINE_OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const res = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "";
  const json = extractJsonArray(stripJsonFence(content));
  return JSON.parse(json) as T;
}

async function chatJsonObject<T>(input: {
  system: string;
  user: string;
  model?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraMessages?: any[];
}): Promise<T> {
  const model = input.model ?? process.env.CINE_OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const res = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: input.system },
      ...(input.extraMessages ?? []),
      { role: "user", content: input.user },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "";
  const json = extractJsonObject(stripJsonFence(content));
  return JSON.parse(json) as T;
}

async function chatText(input: { system: string; user: string; model?: string }): Promise<string> {
  const model = input.model ?? process.env.CINE_OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const res = await openai.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

export async function buildCharacterIdentityPrompt(input: {
  name: string;
  age?: string;
  genderPresentation?: string;
  personality?: string;
  clothing?: string;
  bodyType?: string;
  visualStyle?: string;
  realismLevel?: string;
  extraNotes?: string;
  negativeNotes?: string;
}) {
  const system = `You are CineStudio, a cinematic character identity planner.
Output a single stable, reusable identity prompt for an AI image model.
Rules:
- Make identity consistent across many images (same face, hair, age, outfit).
- Be specific about facial structure (not just "beautiful face").
- Include consistency rules and negative constraints.
- Keep it compact but unambiguous (roughly 120-220 words).`;

  const user = `Build a stable identity prompt for:
Name: ${input.name}
Age: ${input.age ?? ""}
Gender/presentation: ${input.genderPresentation ?? ""}
Personality: ${input.personality ?? ""}
Clothing/outfit: ${input.clothing ?? ""}
Body type: ${input.bodyType ?? ""}
Visual style: ${input.visualStyle ?? ""}
Realism level: ${input.realismLevel ?? ""}
Extra notes: ${input.extraNotes ?? ""}
Negative notes: ${input.negativeNotes ?? ""}`;

  return await chatText({ system, user });
}

export async function buildShotList(sceneDescription: string, characterIdentity: string): Promise<CineShot[]> {
  const system = `You are CineStudio, a cinematic shot list generator for YouTube storytelling.
Return JSON only: an array of exactly 5 shots.
Each shot must have: title, description, camera_angle, composition, lighting, emotion, image_prompt, video_motion_prompt.
Keep prompts cinematic, realistic, and consistent with the same character identity.
Do NOT include markdown, commentary, or extra keys.`;

  const user = `Scene description:
${sceneDescription}

Character identity (must remain consistent):
${characterIdentity}

Return 5 shots as JSON.`;

  return await chatJson<CineShot[]>({ system, user });
}

export async function buildCinematicImagePrompt(characterIdentity: string, sceneDescription: string, stylePreset: CineStylePreset) {
  const system = `You are CineStudio, a prompt polisher for an image model called "Nano Banana".
Output a single image prompt (plain text).
Requirements:
- Preserve the same character identity (face, age, hair, outfit, body proportions).
- Cinematic realism, natural skin texture, realistic lighting.
- Avoid: AI-looking skin, distorted hands, face changes, over-smoothing.
- Include brief negative constraints at the end.`;

  const user = `Character identity:
${characterIdentity}

Scene description:
${sceneDescription}

Style preset: ${stylePreset}

Return a polished Nano Banana prompt.`;

  return await chatText({ system, user });
}

export async function buildVideoMotionPrompt(imagePrompt: string, cameraMotion: string) {
  const system = `You are CineStudio, a motion prompt writer for image-to-video.
Output a single short motion prompt (plain text).
Constraints: subtle realistic motion, preserve composition, no face morphing, no outfit/body change, no sudden camera moves, cinematic lighting, natural micro-movements only.`;
  const user = `Base image prompt:
${imagePrompt}

Camera motion: ${cameraMotion}

Write the motion prompt.`;
  return await chatText({ system, user });
}

export async function createStyleFromDescription(input: {
  name: string;
  description?: string;
  colors?: string[];
  mood?: string[];
  texture?: string[];
  lighting?: string[];
  negativeNotes?: string;
}) {
  const system = `You are CineStudio Style Planner.
Return JSON only with keys: style_prompt, negative_prompt, color_palette, mood_keywords, texture_keywords, lighting_keywords.
Rules:
- style_prompt must be reusable across many images/videos (not tied to a specific scene).
- Prefer stable visual descriptors (medium, palette, lighting, texture, line quality, realism).
- negative_prompt should be a comma-separated list.
- Arrays should be lowercase strings; max 12 items each.
- Keep identity higher priority than style (do not mention specific characters).`;

  const user = `Create a reusable visual style preset.
Name: ${input.name}
User description: ${input.description ?? ""}
Colors: ${(input.colors ?? []).join(", ")}
Mood: ${(input.mood ?? []).join(", ")}
Texture: ${(input.texture ?? []).join(", ")}
Lighting: ${(input.lighting ?? []).join(", ")}
Negative notes: ${input.negativeNotes ?? ""}`;

  return await chatJsonObject<CineStylePlan>({ system, user });
}

export async function createStyleFromReferenceImage(referenceImageUrl: string) {
  const system = `You are CineStudio Style Planner.
Analyze the reference image and convert it into a reusable visual style preset.
Return JSON only with keys: style_prompt, negative_prompt, color_palette, mood_keywords, texture_keywords, lighting_keywords.
Rules:
- Do not describe specific people; describe visual style.
- Include medium/texture/palette/lighting/mood/line quality/realism level/camera or painting look.
- Negative prompt should prevent unintended realism/style drift and common AI artifacts.
- Arrays should be lowercase strings; max 12 items each.`;

  const user = `Create a reusable style from this reference image URL:
${referenceImageUrl}`;

  const extraMessages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Analyze this style reference image." },
        { type: "image_url", image_url: { url: referenceImageUrl } },
      ],
    },
  ];

  return await chatJsonObject<CineStylePlan>({
    system,
    user,
    extraMessages,
    model: process.env.CINE_OPENAI_STYLE_MODEL ?? process.env.CINE_OPENAI_PLANNER_MODEL ?? "gpt-4o-mini",
  });
}

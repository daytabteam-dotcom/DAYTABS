import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { normalizePlan } from "../../lib/planLimits";
import { assertMailConfigured, CONTACT_EMAIL, EMAIL_FROM, escapeHtml, sendEmail } from "../../lib/email";
import { buildCharacterIdentityPrompt, buildCinematicImagePrompt, buildShotList, buildVideoMotionPrompt, createStyleFromDescription, createStyleFromReferenceImage, type CineStylePreset } from "../../aiProviders/openaiPlanner";
import { generateCharacterAngle, generateCharacterSheet, generateSceneImage, generateShotImage } from "../../aiProviders/geminiNanoBanana";
import { generateVideoFromImage as seedanceGenerateVideoFromImage, getVideoJobStatus } from "../../aiProviders/seedanceVideo";
import { getOrCreateCredits, requireCredits, deductCredits, refundCredits } from "../../services/cineCreditsService";
import { downloadToBuffer, storeCineBytes } from "../../services/cineStorageService";
import {
  createCineAsset,
  createCineJob,
  createCineProject,
  createCineStyle,
  createCharacter,
  deleteCineStyle,
  getCineAsset,
  getCineStyle,
  getCharacter,
  getCineJob,
  getCineProject,
  getCineProjectDetail,
  listCineStyles,
  listCineProjects,
  listCineCharacters,
  listCineAssets,
  lockCharacterIdentity,
  updateCineProjectStyle,
  updateCharacterStyle,
  updateCineStyle,
  updateCharacterIdentity,
  updateCineJob,
} from "../../services/cineStudioService";

const router = Router();

const CREDIT_COSTS = {
  character_sheet: 5,
  character_angle: 2,
  scene_image: 3,
  shot_image: 3,
  video_5_fast: 15,
  video_10_standard: 30,
  video_15_hd: 60,
} as const;

function isAspectRatio(value: unknown): value is "16:9" | "9:16" | "1:1" {
  return value === "16:9" || value === "9:16" || value === "1:1";
}

function isStylePreset(value: unknown): value is CineStylePreset {
  return value === "Hollywood Realism"
    || value === "Documentary Realism"
    || value === "Dark Cinematic"
    || value === "Anime Cinematic"
    || value === "Historical Realism"
    || value === "Educational YouTube"
    || value === "Fantasy Realism";
}

function assertStudio(reqPlan: string) {
  return normalizePlan(reqPlan) === "studio";
}

function builtinStylePrompt(preset: CineStylePreset) {
  // Keep compact; user-defined styles remain the primary way to customize.
  if (preset === "Hollywood Realism") return "Hollywood cinematic realism, natural skin texture, realistic film lighting, high-end lens rendering, subtle grain, true-to-life color grade.";
  if (preset === "Documentary Realism") return "Documentary realism, natural lighting, handheld authenticity, true colors, minimal stylization, realistic texture.";
  if (preset === "Dark Cinematic") return "Dark cinematic look, moody contrast, practical lighting, deep shadows, subtle film grain, dramatic but realistic color grade.";
  if (preset === "Anime Cinematic") return "Cinematic anime style, clean line quality, filmic lighting, detailed but not plastic, consistent character design, tasteful color grade.";
  if (preset === "Historical Realism") return "Historical realism, period-accurate texture and color, filmic lighting, authentic materials, subtle grain.";
  if (preset === "Educational YouTube") return "Clean educational YouTube look, bright but natural lighting, readable composition, friendly tone, realistic textures.";
  return "Fantasy realism, grounded cinematic lighting, realistic textures with subtle stylization, cohesive color palette, filmic depth.";
}

async function resolveStylePrompt(userId: number, styleId: string | null | undefined) {
  if (!styleId) return null;
  const style = await getCineStyle(userId, styleId);
  if (!style) return null;
  return {
    id: style.id,
    stylePrompt: style.stylePrompt,
    negativePrompt: style.negativePrompt ?? null,
  };
}

function combineStyleIntoPrompt(
  basePrompt: string,
  style: { stylePrompt: string; negativePrompt?: string | null } | null,
  builtinPreset?: CineStylePreset | null,
) {
  const builtin = builtinPreset ? builtinStylePrompt(builtinPreset) : null;
  const styleBlock = style?.stylePrompt ?? builtin;
  const negBlock = style?.negativePrompt ?? null;
  if (!styleBlock && !negBlock) return basePrompt;
  const parts = [
    basePrompt,
    styleBlock ? `Apply this visual style:\n${styleBlock}` : "",
    negBlock ? `Avoid: ${negBlock}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

router.use(requireAuth);

// Hide CineStudio existence for non-Studio users.
router.use((req, res, next) => {
  if (!assertStudio(req.auth?.plan ?? "free")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

router.post("/notify", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const mailConfig = assertMailConfigured();
    if (!mailConfig.configured) {
      req.log.error({ missing: mailConfig.missing, email }, "CineStudio notification email is not configured");
      res.status(503).json({ error: "Email is not configured. Please contact support directly." });
      return;
    }

    const info = await sendEmail({
      from: `"DayTabs" <${EMAIL_FROM}>`,
      to: CONTACT_EMAIL,
      subject: "CineStudio Request",
      text: `A user has requested CineStudio.\n\nEmail: ${email}\n\nThis was submitted from the DayTabs CineStudio page.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0d0814; border-radius: 12px; border: 1px solid #2a1f3d; color: #fff;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #f9a8d4;">CineStudio Request</h2>
          <p style="margin: 0 0 24px; color: #9ca3af; font-size: 14px;">A user requested CineStudio access / updates.</p>
          <div style="padding: 16px; background: #1a0f2e; border-radius: 8px; border: 1px solid #2a1f3d;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase;">Submitted Email</p>
            <p style="margin: 8px 0 0; font-size: 16px; font-weight: 600; color: #fbcfe8;">${escapeHtml(email)}</p>
          </div>
        </div>
      `,
    });
    req.log.info({ email, emailId: info.id }, "CineStudio notification email sent");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "CineStudio notification email error");
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

router.get("/credits", async (req, res) => {
  const credits = await getOrCreateCredits(req.auth!.user_id, normalizePlan(req.auth!.plan));
  res.json({ credits: { remaining: credits.remainingCredits ?? 0 } });
});

router.get("/projects", async (req, res) => {
  const projects = await listCineProjects(req.auth!.user_id);
  res.json({ projects });
});

router.get("/characters", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characters = await listCineCharacters(req.auth!.user_id);
  res.json({ characters });
});

router.get("/assets", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const limit = Number(req.query.limit ?? "60");
  const assets = await listCineAssets(req.auth!.user_id, Number.isFinite(limit) ? limit : 60);
  res.json({ assets });
});

router.post("/projects", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  const project = await createCineProject(req.auth!.user_id, title, description);
  res.json({ project });
});

router.patch("/projects/:projectId/style", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = String(req.params.projectId || "");
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  const updated = await updateCineProjectStyle(req.auth!.user_id, projectId, styleId);
  if (!updated) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({ project: updated });
});

router.get("/projects/:projectId", async (req, res) => {
  const projectId = String(req.params.projectId || "");
  const detail = await getCineProjectDetail(req.auth!.user_id, projectId);
  if (!detail) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const credits = await getOrCreateCredits(req.auth!.user_id, normalizePlan(req.auth!.plan));
  res.json({ ...detail, credits: { remaining: credits.remainingCredits ?? 0 } });
});

router.post("/characters", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const basePrompt = typeof req.body?.base_prompt === "string" ? req.body.base_prompt.trim() : "";
  const stylePreset = typeof req.body?.style_preset === "string" ? req.body.style_preset.trim() : "";
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  if (!projectId || !name || !basePrompt || !stylePreset) {
    res.status(400).json({ error: "project_id, name, base_prompt, and style_preset are required" });
    return;
  }
  const character = await createCharacter({
    userId: req.auth!.user_id,
    projectId,
    name,
    basePrompt,
    stylePreset,
    styleId,
  });
  res.json({ character });
});

router.patch("/characters/:characterId/style", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characterId = String(req.params.characterId || "");
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  const updated = await updateCharacterStyle(req.auth!.user_id, characterId, styleId);
  if (!updated) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json({ character: updated });
});

// ─── Styles ────────────────────────────────────────────────────────────────
router.get("/styles", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const styles = await listCineStyles(req.auth!.user_id);
  res.json({ styles });
});

router.post("/styles", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
  const stylePrompt = typeof req.body?.style_prompt === "string" ? req.body.style_prompt.trim() : "";
  const negativePrompt = typeof req.body?.negative_prompt === "string" ? req.body.negative_prompt.trim() : null;
  const colorPalette = Array.isArray(req.body?.color_palette) ? (req.body.color_palette as unknown[]).filter((v) => typeof v === "string") as string[] : null;
  const moodKeywords = Array.isArray(req.body?.mood_keywords) ? (req.body.mood_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : null;
  const textureKeywords = Array.isArray(req.body?.texture_keywords) ? (req.body.texture_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : null;
  const lightingKeywords = Array.isArray(req.body?.lighting_keywords) ? (req.body.lighting_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : null;
  const referenceImageUrl = typeof req.body?.reference_image_url === "string" ? req.body.reference_image_url : null;

  if (!name || !stylePrompt) {
    res.status(400).json({ error: "name and style_prompt are required" });
    return;
  }

  const style = await createCineStyle({
    userId: req.auth!.user_id,
    name,
    description,
    stylePrompt,
    negativePrompt,
    colorPalette,
    moodKeywords,
    textureKeywords,
    lightingKeywords,
    referenceImageUrl,
  });
  res.json({ style });
});

router.post("/styles/from-description", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const plan = await createStyleFromDescription({
    name,
    description: typeof req.body?.description === "string" ? req.body.description : undefined,
    colors: Array.isArray(req.body?.colors) ? (req.body.colors as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    mood: Array.isArray(req.body?.mood) ? (req.body.mood as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    texture: Array.isArray(req.body?.texture) ? (req.body.texture as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    lighting: Array.isArray(req.body?.lighting) ? (req.body.lighting as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    negativeNotes: typeof req.body?.negative_notes === "string" ? req.body.negative_notes : undefined,
  });
  const style = await createCineStyle({
    userId: req.auth!.user_id,
    name,
    description: typeof req.body?.description === "string" ? req.body.description : null,
    stylePrompt: plan.style_prompt,
    negativePrompt: plan.negative_prompt ?? null,
    colorPalette: plan.color_palette,
    moodKeywords: plan.mood_keywords,
    textureKeywords: plan.texture_keywords,
    lightingKeywords: plan.lighting_keywords,
  });
  res.json({ style, plan });
});

router.post("/styles/from-reference", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const referenceImageUrl = typeof req.body?.reference_image_url === "string" ? req.body.reference_image_url : "";
  if (!name || !referenceImageUrl) {
    res.status(400).json({ error: "name and reference_image_url are required" });
    return;
  }
  const plan = await createStyleFromReferenceImage(referenceImageUrl);
  const style = await createCineStyle({
    userId: req.auth!.user_id,
    name,
    description: typeof req.body?.description === "string" ? req.body.description : null,
    stylePrompt: plan.style_prompt,
    negativePrompt: plan.negative_prompt ?? null,
    colorPalette: plan.color_palette,
    moodKeywords: plan.mood_keywords,
    textureKeywords: plan.texture_keywords,
    lightingKeywords: plan.lighting_keywords,
    referenceImageUrl,
  });
  res.json({ style, plan });
});

router.patch("/styles/:styleId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const styleId = String(req.params.styleId || "");
  const patch = req.body?.patch as Record<string, unknown> | undefined;
  const updated = await updateCineStyle(req.auth!.user_id, styleId, {
    name: typeof patch?.name === "string" ? patch.name : undefined,
    description: typeof patch?.description === "string" ? patch.description : undefined,
    stylePrompt: typeof patch?.style_prompt === "string" ? patch.style_prompt : undefined,
    negativePrompt: typeof patch?.negative_prompt === "string" ? patch.negative_prompt : undefined,
    colorPalette: Array.isArray(patch?.color_palette) ? (patch!.color_palette as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    moodKeywords: Array.isArray(patch?.mood_keywords) ? (patch!.mood_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    textureKeywords: Array.isArray(patch?.texture_keywords) ? (patch!.texture_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    lightingKeywords: Array.isArray(patch?.lighting_keywords) ? (patch!.lighting_keywords as unknown[]).filter((v) => typeof v === "string") as string[] : undefined,
    referenceImageUrl: typeof patch?.reference_image_url === "string" ? patch.reference_image_url : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: "Style not found" });
    return;
  }
  res.json({ style: updated });
});

router.delete("/styles/:styleId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const styleId = String(req.params.styleId || "");
  const deleted = await deleteCineStyle(req.auth!.user_id, styleId);
  if (!deleted) {
    res.status(404).json({ error: "Style not found" });
    return;
  }
  res.json({ success: true });
});

router.post("/characters/:characterId/identity", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characterId = String(req.params.characterId || "");
  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const details = req.body?.details as Record<string, unknown> | undefined;
  const name = typeof details?.name === "string" ? details.name : character.name;
  const identity = await buildCharacterIdentityPrompt({
    name,
    age: typeof details?.age === "string" ? details.age : undefined,
    genderPresentation: typeof details?.gender_presentation === "string" ? details.gender_presentation : undefined,
    personality: typeof details?.personality === "string" ? details.personality : undefined,
    clothing: typeof details?.outfit === "string" ? details.outfit : undefined,
    bodyType: typeof details?.body_type === "string" ? details.body_type : undefined,
    visualStyle: typeof details?.visual_style === "string" ? details.visual_style : undefined,
    realismLevel: typeof details?.realism_level === "string" ? details.realism_level : undefined,
    extraNotes: typeof details?.extra_notes === "string" ? details.extra_notes : undefined,
    negativeNotes: typeof details?.negative_notes === "string" ? details.negative_notes : undefined,
  });

  const updated = await updateCharacterIdentity(req.auth!.user_id, characterId, identity);
  res.json({ identity_prompt: identity, character: updated });
});

router.post("/characters/:characterId/sheet", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characterId = String(req.params.characterId || "");
  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  if (!character.identityPrompt) {
    res.status(400).json({ error: "Character identity_prompt is required" });
    return;
  }
  const aspectRatio = req.body?.aspect_ratio;
  if (!isAspectRatio(aspectRatio)) {
    res.status(400).json({ error: "Invalid aspect_ratio" });
    return;
  }
  const stylePreset = isStylePreset(req.body?.style_preset) ? (req.body.style_preset as CineStylePreset) : (character.stylePreset as CineStylePreset);
  const project = await getCineProject(req.auth!.user_id, character.projectId);
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : (character.styleId ?? project?.styleId ?? null);
  const style = await resolveStylePrompt(req.auth!.user_id, styleId);

  const cost = CREDIT_COSTS.character_sheet;
  await requireCredits(req.auth!.user_id, normalizePlan(req.auth!.plan), cost);

  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId: character.projectId,
    characterId: character.id,
    provider: "gemini",
    jobType: "image_generation",
    status: "queued",
    costCredits: cost,
    inputPayload: { characterId, aspectRatio, kind: "character_sheet", styleId: style?.id ?? null, stylePreset },
  });

  try {
    const identityWithStyle = combineStyleIntoPrompt(character.identityPrompt, style, stylePreset);
    const sheet = await generateCharacterSheet(identityWithStyle, aspectRatio);
    await deductCredits(req.auth!.user_id, cost);
    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "processing" } });

    const assets = [];
    for (const view of sheet.views) {
      const promptWithStyle = combineStyleIntoPrompt(view.prompt, style, stylePreset);
      const stored = await storeCineBytes({ userId: req.auth!.user_id, kind: "images", bytes: view.bytes, mimeType: view.mimeType });
      const asset = await createCineAsset({
        userId: req.auth!.user_id,
        projectId: character.projectId,
        characterId: character.id,
        styleId: style?.id ?? null,
        type: "image",
        category: "character_sheet",
        url: stored.url,
        prompt: promptWithStyle,
        provider: "gemini",
        metadata: { view: view.view, aspectRatio, styleId: style?.id ?? null },
      });
      assets.push(asset);
    }

    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "completed", output: { assets } } });
    res.json({ job, assets });
  } catch (err) {
    await refundCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Generation failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

router.post("/characters/:characterId/angle", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characterId = String(req.params.characterId || "");
  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  const referenceImageUrl = typeof req.body?.reference_image_url === "string" ? req.body.reference_image_url : character.referenceImageUrl;
  const angle = typeof req.body?.angle === "string" ? req.body.angle : "";
  const aspectRatio = req.body?.aspect_ratio;
  const stylePreset = isStylePreset(req.body?.style_preset) ? (req.body.style_preset as CineStylePreset) : (character.stylePreset as CineStylePreset);
  const project = await getCineProject(req.auth!.user_id, character.projectId);
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : (character.styleId ?? project?.styleId ?? null);
  if (!referenceImageUrl || !angle || !isAspectRatio(aspectRatio)) {
    res.status(400).json({ error: "reference_image_url, angle, aspect_ratio are required" });
    return;
  }
  if (!character.identityPrompt) {
    res.status(400).json({ error: "Character identity_prompt is required" });
    return;
  }

  const cost = CREDIT_COSTS.character_angle;
  await requireCredits(req.auth!.user_id, normalizePlan(req.auth!.plan), cost);
  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId: character.projectId,
    characterId: character.id,
    provider: "gemini",
    jobType: "angle_generation",
    status: "queued",
    costCredits: cost,
    inputPayload: { characterId, referenceImageUrl, angle, aspectRatio, styleId: (styleId ?? null), stylePreset },
  });

  try {
    const style = await resolveStylePrompt(req.auth!.user_id, styleId);
    const identityWithStyle = combineStyleIntoPrompt(character.identityPrompt, style, stylePreset);
    const img = await generateCharacterAngle(referenceImageUrl, identityWithStyle, angle, aspectRatio);
    await deductCredits(req.auth!.user_id, cost);
    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "processing" } });

    const promptWithStyle = combineStyleIntoPrompt(img.prompt, style, stylePreset);
    const stored = await storeCineBytes({ userId: req.auth!.user_id, kind: "images", bytes: img.bytes, mimeType: img.mimeType });
    const asset = await createCineAsset({
      userId: req.auth!.user_id,
      projectId: character.projectId,
      characterId: character.id,
      styleId: style?.id ?? null,
      type: "image",
      category: "angle",
      url: stored.url,
      prompt: promptWithStyle,
      provider: "gemini",
      metadata: { angle, aspectRatio, referenceImageUrl, styleId: style?.id ?? null },
    });

    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "completed", output: { asset } } });
    res.json({ job, asset });
  } catch (err) {
    await refundCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Generation failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

router.post("/characters/:characterId/lock", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const characterId = String(req.params.characterId || "");
  const referenceImageUrl = typeof req.body?.reference_image_url === "string" ? req.body.reference_image_url : "";
  if (!referenceImageUrl) {
    res.status(400).json({ error: "reference_image_url is required" });
    return;
  }
  const updated = await lockCharacterIdentity(req.auth!.user_id, characterId, referenceImageUrl);
  if (!updated) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json({ character: updated });
});

router.post("/scenes", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : "";
  const characterId = typeof req.body?.character_id === "string" ? req.body.character_id : "";
  const sceneDescription = typeof req.body?.scene_description === "string" ? req.body.scene_description.trim() : "";
  const stylePreset = req.body?.style_preset;
  const aspectRatio = req.body?.aspect_ratio;
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  if (!projectId || !characterId || !sceneDescription || !isAspectRatio(aspectRatio) || !isStylePreset(stylePreset)) {
    res.status(400).json({ error: "project_id, character_id, scene_description, style_preset, aspect_ratio are required" });
    return;
  }

  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character || character.projectId !== projectId) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  const project = await getCineProject(req.auth!.user_id, projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!character.lockedIdentity || !character.referenceImageUrl || !character.identityPrompt) {
    res.status(400).json({ error: "Character identity must be locked with a reference_image_url before creating a scene." });
    return;
  }

  const cost = CREDIT_COSTS.scene_image;
  await requireCredits(req.auth!.user_id, normalizePlan(req.auth!.plan), cost);
  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId,
    characterId,
    provider: "openai+gemini",
    jobType: "image_generation",
    status: "queued",
    costCredits: cost,
    inputPayload: { projectId, characterId, sceneDescription, stylePreset, aspectRatio },
  });

  try {
    const polishedPrompt = await buildCinematicImagePrompt(character.identityPrompt, sceneDescription, stylePreset);
    const style = await resolveStylePrompt(req.auth!.user_id, styleId ?? character.styleId ?? project.styleId ?? null);
    const promptWithStyle = combineStyleIntoPrompt(polishedPrompt, style, stylePreset);
    const img = await generateSceneImage(character.referenceImageUrl, promptWithStyle, aspectRatio);
    await deductCredits(req.auth!.user_id, cost);
    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "processing" } });

    const stored = await storeCineBytes({ userId: req.auth!.user_id, kind: "images", bytes: img.bytes, mimeType: img.mimeType });
    const asset = await createCineAsset({
      userId: req.auth!.user_id,
      projectId,
      characterId,
      styleId: style?.id ?? null,
      type: "image",
      category: "scene",
      url: stored.url,
      prompt: img.prompt,
      provider: "gemini",
      metadata: { sceneDescription, polishedPrompt, stylePreset, aspectRatio, styleId: style?.id ?? null },
    });

    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "completed", output: { asset, polishedPrompt } } });
    res.json({ job, asset, polishedPrompt });
  } catch (err) {
    await refundCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Generation failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

router.post("/shots/list", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : "";
  const characterId = typeof req.body?.character_id === "string" ? req.body.character_id : "";
  const sceneDescription = typeof req.body?.scene_description === "string" ? req.body.scene_description.trim() : "";
  if (!projectId || !characterId || !sceneDescription) {
    res.status(400).json({ error: "project_id, character_id, scene_description are required" });
    return;
  }

  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character || character.projectId !== projectId) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  if (!character.identityPrompt) {
    res.status(400).json({ error: "Character identity_prompt is required" });
    return;
  }

  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId,
    characterId,
    provider: "openai",
    jobType: "prompt_planning",
    status: "queued",
    costCredits: 0,
    inputPayload: { projectId, characterId, sceneDescription },
  });

  try {
    const shots = await buildShotList(sceneDescription, character.identityPrompt);
    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "completed", output: { shots } } });
    res.json({ job, shots });
  } catch (err) {
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Shot list failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Shot list failed" });
  }
});

router.post("/shots/image", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : "";
  const characterId = typeof req.body?.character_id === "string" ? req.body.character_id : "";
  const shotPrompt = typeof req.body?.shot_prompt === "string" ? req.body.shot_prompt.trim() : "";
  const aspectRatio = req.body?.aspect_ratio;
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  if (!projectId || !characterId || !shotPrompt || !isAspectRatio(aspectRatio)) {
    res.status(400).json({ error: "project_id, character_id, shot_prompt, aspect_ratio are required" });
    return;
  }

  const character = await getCharacter(req.auth!.user_id, characterId);
  if (!character || character.projectId !== projectId) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  const stylePreset = isStylePreset(req.body?.style_preset) ? (req.body.style_preset as CineStylePreset) : (character.stylePreset as CineStylePreset);
  const project = await getCineProject(req.auth!.user_id, projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!character.lockedIdentity || !character.referenceImageUrl) {
    res.status(400).json({ error: "Character identity must be locked with a reference_image_url before generating shots." });
    return;
  }

  const cost = CREDIT_COSTS.shot_image;
  await requireCredits(req.auth!.user_id, normalizePlan(req.auth!.plan), cost);
  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId,
    characterId,
    provider: "gemini",
    jobType: "image_generation",
    status: "queued",
    costCredits: cost,
    inputPayload: { projectId, characterId, shotPrompt, aspectRatio, styleId, stylePreset },
  });

  try {
    const style = await resolveStylePrompt(req.auth!.user_id, styleId ?? character.styleId ?? project.styleId ?? null);
    const shotPromptWithStyle = combineStyleIntoPrompt(shotPrompt, style, stylePreset);
    const img = await generateShotImage(character.referenceImageUrl, shotPromptWithStyle, aspectRatio);
    await deductCredits(req.auth!.user_id, cost);
    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "processing" } });

    const stored = await storeCineBytes({ userId: req.auth!.user_id, kind: "images", bytes: img.bytes, mimeType: img.mimeType });
    const asset = await createCineAsset({
      userId: req.auth!.user_id,
      projectId,
      characterId,
      styleId: style?.id ?? null,
      type: "image",
      category: "shot",
      url: stored.url,
      prompt: img.prompt,
      provider: "gemini",
      metadata: { aspectRatio, shotPrompt, styleId: style?.id ?? null },
    });

    await updateCineJob({ userId: req.auth!.user_id, jobId: job.id, patch: { status: "completed", output: { asset } } });
    res.json({ job, asset });
  } catch (err) {
    await refundCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Generation failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

router.post("/video/from-image", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "CineStudio is available on the Studio plan." });
    return;
  }
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : "";
  const assetId = typeof req.body?.asset_id === "string" ? req.body.asset_id : "";
  const imageUrl = typeof req.body?.image_url === "string" ? req.body.image_url : "";
  const duration = req.body?.duration;
  const quality = req.body?.quality;
  const aspectRatio = req.body?.aspect_ratio;
  const cameraMotion = typeof req.body?.camera_motion === "string" ? req.body.camera_motion : "static";
  const customMotionPrompt = typeof req.body?.custom_motion_prompt === "string" ? req.body.custom_motion_prompt.trim() : "";
  const styleId = typeof req.body?.style_id === "string" ? req.body.style_id : null;
  const stylePreset = isStylePreset(req.body?.style_preset) ? (req.body.style_preset as CineStylePreset) : "Hollywood Realism";

  if (!projectId || !assetId || !imageUrl) {
    res.status(400).json({ error: "project_id, asset_id, image_url are required" });
    return;
  }
  if (!(duration === "5s" || duration === "10s" || duration === "15s")) {
    res.status(400).json({ error: "Invalid duration" });
    return;
  }
  if (!(quality === "fast" || quality === "standard" || quality === "HD")) {
    res.status(400).json({ error: "Invalid quality" });
    return;
  }
  if (!isAspectRatio(aspectRatio)) {
    res.status(400).json({ error: "Invalid aspect_ratio" });
    return;
  }

  const project = await getCineProject(req.auth!.user_id, projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const asset = await getCineAsset(req.auth!.user_id, assetId);
  if (!asset || asset.projectId !== projectId) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const effectiveStyleId = styleId ?? asset.styleId ?? project.styleId ?? null;

  const cost =
    duration === "5s" && quality === "fast" ? CREDIT_COSTS.video_5_fast
      : duration === "10s" && quality === "standard" ? CREDIT_COSTS.video_10_standard
      : duration === "15s" && quality === "HD" ? CREDIT_COSTS.video_15_hd
      : CREDIT_COSTS.video_10_standard;

  await requireCredits(req.auth!.user_id, normalizePlan(req.auth!.plan), cost);

  const job = await createCineJob({
    userId: req.auth!.user_id,
    projectId,
    characterId: null,
    provider: "seedance",
    jobType: "image_to_video",
    status: "queued",
    costCredits: cost,
    inputPayload: { projectId, assetId, imageUrl, duration, quality, aspectRatio, cameraMotion, customMotionPrompt, styleId: effectiveStyleId, stylePreset },
  });

  try {
    const style = await resolveStylePrompt(req.auth!.user_id, effectiveStyleId);
    const baseMotion = customMotionPrompt || await buildVideoMotionPrompt(`Image: ${imageUrl}`, cameraMotion);
    const builtin = (() => {
      return builtinStylePrompt(stylePreset);
    })();
    const styleText = style?.stylePrompt ?? builtin;
    const motionPrompt = `Animate this image with subtle cinematic motion. Preserve the original composition, character identity, lighting, and the original visual style. Also preserve this selected visual style: ${styleText}. No face morphing, no clothing/body change, no sudden camera movement, no style change.\n\n${baseMotion}`.trim();
    const started = await seedanceGenerateVideoFromImage({ imageUrl, motionPrompt, duration, quality, aspectRatio });
    await deductCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "processing", output: { requestId: started.requestId, motionPrompt, styleId: style?.id ?? null } },
    });
    res.json({ jobId: job.id, requestId: started.requestId, motionPrompt });
  } catch (err) {
    await refundCredits(req.auth!.user_id, cost);
    await updateCineJob({
      userId: req.auth!.user_id,
      jobId: job.id,
      patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Video generation failed" },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Video generation failed" });
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  const jobId = String(req.params.jobId || "");
  const job = await getCineJob(req.auth!.user_id, jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // If it's a Seedance job in processing, attempt to refresh status and finalize on completion.
  if (job.status === "processing" && job.jobType === "image_to_video") {
    const output = (job.output ?? {}) as Record<string, unknown>;
    const requestId = typeof output.requestId === "string" ? output.requestId : null;
    if (requestId) {
      const status = await getVideoJobStatus(requestId);
      if (status.status === "completed" && status.videoUrl) {
        try {
          const downloaded = await downloadToBuffer(status.videoUrl);
          const stored = await storeCineBytes({
            userId: req.auth!.user_id,
            kind: "videos",
            bytes: downloaded.bytes,
            mimeType: downloaded.contentType.includes("video") ? downloaded.contentType : "video/mp4",
          });
          const asset = await createCineAsset({
            userId: req.auth!.user_id,
            projectId: job.projectId,
            characterId: job.characterId,
            styleId: typeof output.styleId === "string" ? output.styleId : null,
            type: "video",
            category: "final_video",
            url: stored.url,
            prompt: String(output.motionPrompt ?? ""),
            provider: "seedance",
            metadata: { requestId, upstreamVideoUrl: status.videoUrl },
          });
          await updateCineJob({
            userId: req.auth!.user_id,
            jobId,
            patch: { status: "completed", output: { ...output, status: status.raw, asset } },
          });
          res.json({ job: await getCineJob(req.auth!.user_id, jobId), asset });
          return;
        } catch (err) {
          await updateCineJob({
            userId: req.auth!.user_id,
            jobId,
            patch: { status: "failed", errorMessage: err instanceof Error ? err.message : "Video finalization failed" },
          });
          res.json({ job: await getCineJob(req.auth!.user_id, jobId) });
          return;
        }
      }

      if (status.status === "failed") {
        // Best-effort refund: we deducted after job start.
        await refundCredits(req.auth!.user_id, job.costCredits ?? 0);
        await updateCineJob({
          userId: req.auth!.user_id,
          jobId,
          patch: { status: "failed", errorMessage: status.error ?? "Seedance job failed" },
        });
        res.json({ job: await getCineJob(req.auth!.user_id, jobId) });
        return;
      }

      // Still queued/processing
      res.json({ job, providerStatus: status });
      return;
    }
  }

  res.json({ job });
});

router.get("/assets/:assetId/download", async (req, res) => {
  // For now assets are stored with a direct URL; redirect to it.
  const assetId = String(req.params.assetId || "");
  const asset = await getCineAsset(req.auth!.user_id, assetId);
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.redirect(asset.url);
});

export default router;

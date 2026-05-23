import { randomUUID } from "crypto";

type AspectRatio = "16:9" | "9:16" | "1:1";

function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

function nanoBananaPromptGuardrails() {
  return [
    "Preserve the same character identity across all images.",
    "Preserve facial structure, age, hair, outfit, and body proportions.",
    "Preserve cinematic realism; avoid AI-looking skin and over-smoothing.",
    "Avoid distorted hands and extra fingers.",
    "Avoid changing the face between shots.",
    "Realistic lighting and natural skin texture.",
  ].join(" ");
}

function aspectHint(aspectRatio: AspectRatio) {
  if (aspectRatio === "16:9") return "widescreen 16:9";
  if (aspectRatio === "9:16") return "vertical 9:16";
  return "square 1:1";
}

function resolveEndpoint() {
  // Allow override without code changes; defaults are best-effort.
  return process.env.GEMINI_IMAGE_ENDPOINT
    ?? "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages";
}

async function geminiGenerateImages(prompt: string, aspectRatio: AspectRatio): Promise<Array<{ bytes: Buffer; mimeType: string }>> {
  const key = requireGeminiKey();
  const endpoint = resolveEndpoint();
  const url = new URL(endpoint);
  url.searchParams.set("key", key);

  const body = {
    prompt: `${prompt}\n\n${nanoBananaPromptGuardrails()}\n\nAspect: ${aspectHint(aspectRatio)}`,
    // Be permissive: different endpoints accept different fields.
    // We'll parse multiple possible output formats.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? String((data as { error?: unknown }).error ?? "Gemini request failed")
      : "Gemini request failed";
    throw new Error(msg);
  }

  // Parse common shapes:
  // - { generatedImages: [{ bytesBase64Encoded, mimeType }] }
  // - { images: [{ bytesBase64Encoded, mimeType }] }
  // - { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }] }
  const out: Array<{ bytes: Buffer; mimeType: string }> = [];

  const listA = (data as { generatedImages?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> }).generatedImages;
  for (const item of listA ?? []) {
    if (!item?.bytesBase64Encoded) continue;
    out.push({ bytes: Buffer.from(item.bytesBase64Encoded, "base64"), mimeType: item.mimeType ?? "image/png" });
  }

  const listB = (data as { images?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> }).images;
  for (const item of listB ?? []) {
    if (!item?.bytesBase64Encoded) continue;
    out.push({ bytes: Buffer.from(item.bytesBase64Encoded, "base64"), mimeType: item.mimeType ?? "image/png" });
  }

  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> }).candidates;
  for (const cand of candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      const inline = part.inlineData;
      if (!inline?.data) continue;
      out.push({ bytes: Buffer.from(inline.data, "base64"), mimeType: inline.mimeType ?? "image/png" });
    }
  }

  if (!out.length) {
    throw new Error("Gemini did not return any images (unexpected response format).");
  }

  return out;
}

export async function generateImage(prompt: string, aspectRatio: AspectRatio) {
  return await geminiGenerateImages(prompt, aspectRatio);
}

export async function editImage(_referenceImageUrl: string, prompt: string, aspectRatio: AspectRatio) {
  // Best-effort MVP: treat edits as regenerate with stronger constraints.
  // If you want true reference-image edits, set GEMINI_IMAGE_ENDPOINT to an edit-capable endpoint.
  return await geminiGenerateImages(`EDIT REQUEST: ${prompt}`, aspectRatio);
}

export async function generateCharacterSheet(characterIdentityPrompt: string, aspectRatio: AspectRatio) {
  const views = [
    { key: "front_view", label: "front view" },
    { key: "three_quarter_view", label: "3/4 view" },
    { key: "side_view", label: "side view" },
    { key: "back_view", label: "back view" },
    { key: "face_close_up", label: "face close-up" },
    { key: "full_body", label: "full body" },
  ] as const;

  return {
    sheetId: randomUUID(),
    views: await Promise.all(views.map(async (view) => {
      const prompt = `${characterIdentityPrompt}\n\nCharacter sheet ${view.label}. Neutral pose. Consistent wardrobe. ${nanoBananaPromptGuardrails()}`;
      const [img] = await geminiGenerateImages(prompt, aspectRatio);
      return { view: view.key, ...img, prompt };
    })),
  };
}

export async function generateCharacterAngle(referenceImageUrl: string, characterIdentityPrompt: string, angle: string, aspectRatio: AspectRatio) {
  const prompt = `${characterIdentityPrompt}\n\nMatch this reference: ${referenceImageUrl}\n\nAngle: ${angle}. ${nanoBananaPromptGuardrails()}`;
  const [img] = await geminiGenerateImages(prompt, aspectRatio);
  return { ...img, prompt };
}

export async function generateSceneImage(characterReferenceUrl: string, scenePrompt: string, aspectRatio: AspectRatio) {
  const prompt = `Use this character reference: ${characterReferenceUrl}\n\nScene: ${scenePrompt}\n\n${nanoBananaPromptGuardrails()}`;
  const [img] = await geminiGenerateImages(prompt, aspectRatio);
  return { ...img, prompt };
}

export async function generateShotImage(characterReferenceUrl: string, shotPrompt: string, aspectRatio: AspectRatio) {
  const prompt = `Use this character reference: ${characterReferenceUrl}\n\nShot: ${shotPrompt}\n\n${nanoBananaPromptGuardrails()}`;
  const [img] = await geminiGenerateImages(prompt, aspectRatio);
  return { ...img, prompt };
}


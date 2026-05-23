type AspectRatio = "16:9" | "9:16" | "1:1";
type Duration = "5s" | "10s" | "15s";
type Quality = "fast" | "standard" | "HD";

function requireFalKey() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("Missing FAL_API_KEY");
  return key;
}

function falBaseUrl() {
  return process.env.FAL_BASE_URL ?? "https://fal.run";
}

function seedanceModel() {
  return process.env.FAL_SEEDANCE_MODEL ?? "fal-ai/seedance";
}

export async function generateVideoFromImage(input: {
  imageUrl: string;
  motionPrompt: string;
  duration: Duration;
  quality: Quality;
  aspectRatio: AspectRatio;
}) {
  const key = requireFalKey();
  const model = seedanceModel();
  const url = `${falBaseUrl().replace(/\/+$/, "")}/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify({
      input: {
        image_url: input.imageUrl,
        prompt: input.motionPrompt,
        duration: input.duration,
        quality: input.quality,
        aspect_ratio: input.aspectRatio,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? String((data as { error?: unknown }).error ?? "Seedance request failed")
      : "Seedance request failed";
    throw new Error(msg);
  }

  const requestId = (data as { request_id?: string; id?: string }).request_id ?? (data as { request_id?: string; id?: string }).id;
  if (!requestId) throw new Error("Seedance did not return a request id");
  return { requestId };
}

export async function getVideoJobStatus(requestId: string): Promise<{
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
  raw?: unknown;
}> {
  const key = requireFalKey();
  const model = seedanceModel();
  const url = `${falBaseUrl().replace(/\/+$/, "")}/${model}/${encodeURIComponent(requestId)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Key ${key}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: "failed", error: "Failed to fetch Seedance job status", raw: data };
  }

  const statusRaw = String((data as { status?: unknown }).status ?? "").toLowerCase();
  const status =
    statusRaw.includes("complete") ? "completed"
      : statusRaw.includes("fail") ? "failed"
      : statusRaw.includes("queue") ? "queued"
      : "processing";

  const videoUrl =
    (data as { output?: { video_url?: string; url?: string }; video_url?: string; url?: string }).output?.video_url
      ?? (data as { output?: { video_url?: string; url?: string }; video_url?: string; url?: string }).output?.url
      ?? (data as { video_url?: string; url?: string }).video_url
      ?? (data as { video_url?: string; url?: string }).url;

  const error =
    (data as { error?: string; message?: string }).error
      ?? (data as { error?: string; message?: string }).message;

  return { status, videoUrl: status === "completed" ? videoUrl : undefined, error: status === "failed" ? error : undefined, raw: data };
}

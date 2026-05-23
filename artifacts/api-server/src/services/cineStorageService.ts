import { randomUUID } from "crypto";
import { putR2Object, r2PublicUrlForKey } from "../lib/b2";

function extFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("mp4")) return ".mp4";
  return "";
}

export async function storeCineBytes(input: {
  userId: number;
  kind: "images" | "videos" | "references";
  bytes: Buffer;
  mimeType: string;
}) {
  const id = randomUUID();
  const ext = extFromMime(input.mimeType) || (input.kind === "videos" ? ".mp4" : ".png");
  const key = `users/${input.userId}/cine/${input.kind}/${id}${ext}`;
  const stored = await putR2Object({ key, contentType: input.mimeType, body: input.bytes });
  const url = stored.fileUrl ?? r2PublicUrlForKey(key) ?? key;
  return { key, url };
}

export async function downloadToBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download asset: ${res.status}`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), contentType };
}


import { randomUUID } from "crypto";
import path from "path";
import { deleteFromB2, putR2Object } from "../lib/b2";

function extFromFilename(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();
  return ext && ext.length <= 8 ? ext : "";
}

function readPublicBase() {
  const raw = process.env.R2_PUBLIC_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

export async function storeUploadedAudio(input: {
  userId: number;
  filename: string;
  bytes: Buffer;
  contentType: string;
}) {
  const id = randomUUID();
  const ext = extFromFilename(input.filename) || ".bin";
  const key = `users/${input.userId}/audio-transcripts/uploads/${id}${ext}`;
  const stored = await putR2Object({ key, contentType: input.contentType, body: input.bytes });
  return {
    key,
    url: stored.fileUrl ?? (readPublicBase() ? `${readPublicBase()}/${key}` : key),
  };
}

export async function deleteUploadedAudioFile(fileUrlOrKey: string) {
  try {
    const raw = (fileUrlOrKey || "").trim();
    if (!raw) return { deleted: false };
    const publicBase = readPublicBase();
    let key: string | null = null;
    if (publicBase && raw.startsWith(publicBase)) {
      key = raw.slice(publicBase.length).replace(/^\/+/, "");
    } else if (raw.startsWith("users/")) {
      key = raw;
    } else {
      // Try parse as URL
      try {
        const url = new URL(raw);
        const pathname = url.pathname.replace(/^\/+/, "");
        if (pathname.startsWith("users/")) key = pathname;
      } catch {
        // ignore
      }
    }
    if (!key) return { deleted: false };
    await deleteFromB2(key);
    return { deleted: true, key };
  } catch {
    // cleanup should never crash job
    return { deleted: false };
  }
}


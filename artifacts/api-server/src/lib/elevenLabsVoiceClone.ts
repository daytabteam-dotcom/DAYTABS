import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import FormData from "form-data";
import { logger } from "./logger";

const connectors = new ReplitConnectors();

/**
 * Clone a voice from an audio file via ElevenLabs Instant Voice Cloning.
 * Returns the ephemeral voice_id.
 */
export async function cloneVoiceFromAudio(audioPath: string, name: string): Promise<string> {
  const audioBuffer = await fs.readFile(audioPath);
  const ext = path.extname(audioPath).slice(1) || "mp3";
  const filename = `voice_sample.${ext}`;

  const form = new FormData();
  form.append("name", name);
  form.append("description", "Auto-cloned from uploaded video");
  form.append("files", audioBuffer, { filename, contentType: `audio/${ext}` });

  const response = await connectors.proxy("elevenlabs", "/v1/voices/add", {
    method: "POST",
    headers: form.getHeaders(),
    body: form.getBuffer(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs voice clone failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { voice_id: string };
  logger.info({ voiceId: data.voice_id }, "Voice cloned successfully");
  return data.voice_id;
}

/**
 * Generate TTS audio using a cloned (or existing) ElevenLabs voice.
 * Returns a Buffer of MP3 audio.
 */
export async function generateTtsWithVoice(
  text: string,
  voiceId: string,
  modelId = "eleven_multilingual_v2"
): Promise<Buffer> {
  const response = await connectors.proxy(
    "elevenlabs",
    `/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    const text_ = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${text_}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete a cloned voice by voice_id (cleanup after export).
 */
export async function deleteClonedVoice(voiceId: string): Promise<void> {
  try {
    await connectors.proxy("elevenlabs", `/v1/voices/${voiceId}`, { method: "DELETE" });
    logger.info({ voiceId }, "Cloned voice deleted");
  } catch (err) {
    logger.warn({ err, voiceId }, "Failed to delete cloned voice (non-fatal)");
  }
}

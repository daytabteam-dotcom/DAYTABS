import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "fs";
import type { Readable } from "stream";

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      // Disable automatic checksums so presigned PUT URLs work from browsers.
      // Without this the SDK injects x-amz-checksum-crc32 as a signed header
      // and R2 rejects the upload because the browser never sends the header.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return _client;
}

/**
 * Apply a permissive CORS policy to the bucket so browsers can PUT directly.
 * Call once at server startup when R2 is configured.
 */
export async function ensureR2Cors(): Promise<void> {
  try {
    await client().send(
      new PutBucketCorsCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["PUT"],
              AllowedHeaders: ["*"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
    console.log("[r2] CORS policy applied to bucket");
  } catch (err) {
    console.warn("[r2] Failed to apply CORS policy:", err);
  }
}

/**
 * Generate a presigned PUT URL valid for 1 hour.
 * The frontend uses this to upload directly to R2.
 */
export async function generatePresignedPutUrl(
  fileKey: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileKey,
      ContentType: contentType,
    }),
    { expiresIn: 3600 }
  );
}

/**
 * Stream an R2 object directly to a local file via the SDK.
 * Does NOT require a public bucket.
 */
export async function downloadFromR2(fileKey: string, destPath: string): Promise<void> {
  const response = await client().send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileKey })
  );
  const body = response.Body as Readable;
  const writer = createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    body.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    body.on("error", reject);
  });
}

/**
 * Delete an object from R2. Errors are swallowed — this is always called
 * in a fire-and-forget context (cleanup after download/processing).
 */
export async function deleteFromR2(fileKey: string): Promise<void> {
  try {
    await client().send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: fileKey })
    );
  } catch (err) {
    console.warn(`[r2] Failed to delete key "${fileKey}":`, err);
  }
}

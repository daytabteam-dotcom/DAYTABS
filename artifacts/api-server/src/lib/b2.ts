import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import { createReadStream } from "fs";
import path from "path";
import { logger } from "./logger";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required for Cloudflare R2 integration`);
  }
  return value;
}

interface R2Config {
  endpoint: string;
  bucket: string;
  publicUrl?: string;
}

let r2Client: S3Client | null = null;
let r2Config: R2Config | null = null;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readR2Config(): R2Config {
  if (r2Config) return r2Config;

  const configuredEndpoint = process.env.R2_ENDPOINT || (
    process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined
  );
  if (!configuredEndpoint) {
    throw new Error("Environment variable R2_ENDPOINT or R2_ACCOUNT_ID is required for Cloudflare R2 integration");
  }

  const url = new URL(configuredEndpoint);
  const pathBucket = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || undefined;
  const bucket = process.env.R2_BUCKET_NAME || pathBucket;
  if (!bucket) {
    throw new Error("Environment variable R2_BUCKET_NAME is required unless R2_ENDPOINT includes the bucket path");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  r2Config = {
    endpoint: stripTrailingSlash(url.toString()),
    bucket,
    publicUrl: process.env.R2_PUBLIC_URL ? stripTrailingSlash(process.env.R2_PUBLIC_URL) : undefined,
  };
  return r2Config;
}

function getR2Client(): S3Client {
  if (!r2Client) {
    try {
      const config = readR2Config();
      r2Client = new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize R2 client. Check R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY env vars");
      throw err;
    }
  }
  return r2Client;
}

function getR2Bucket(): string {
  return readR2Config().bucket;
}

export function getR2RequiredEnvStatus() {
  const missing: string[] = [];
  if (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID) missing.push("R2_ENDPOINT");
  if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!process.env.R2_BUCKET_NAME) {
    const endpoint = process.env.R2_ENDPOINT;
    const pathBucket = endpoint ? new URL(endpoint).pathname.replace(/^\/+|\/+$/g, "").split("/")[0] : "";
    if (!pathBucket) missing.push("R2_BUCKET_NAME");
  }
  return { configured: missing.length === 0, missing };
}

export function buildR2ObjectKey(uploadId: string, filename: string, userId?: number | null): string {
  const ext = path.extname(filename) || ".mp4";
  const owner = userId ? `users/${userId}` : "anonymous";
  return `${owner}/uploads/${uploadId}${ext.toLowerCase()}`;
}

export async function createR2UploadUrl(key: string, contentType: string) {
  const config = readR2Config();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 6 * 60 * 60 });
  return {
    uploadUrl,
    fileKey: key,
    fileUrl: config.publicUrl ? `${config.publicUrl}/${key}` : undefined,
  };
}

export async function getR2ObjectMetadata(key: string) {
  const response = await getR2Client().send(
    new HeadObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );
  return {
    contentLength: response.ContentLength ?? 0,
    contentType: response.ContentType,
  };
}

export async function uploadToB2(key: string, filePath: string, contentType: string) {
  logger.info({ key, filePath, contentType }, "uploadToR2 called");

  const client = getR2Client();
  const bucket = getR2Bucket();

  logger.info({ bucket, endpoint: readR2Config().endpoint }, "R2 client and bucket initialized");

  try {
    const stats = await fs.promises.stat(filePath);
    logger.info({ key, filePath, size: stats.size }, "Starting R2 upload");

    // For very large files, stream; for smaller files, buffer
    let body: any;
    if (stats.size > 100 * 1024 * 1024) {
      // > 100MB: use stream
      body = createReadStream(filePath);
    } else {
      // <= 100MB: use buffer for better compatibility
      body = await fs.promises.readFile(filePath);
    }

    logger.info({ key, bodyType: stats.size > 100 * 1024 * 1024 ? 'stream' : 'buffer', size: stats.size }, "Prepared upload body");

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    logger.info({ key }, "R2 upload completed successfully");
  } catch (err) {
    logger.error({ err, key, filePath }, "R2 upload failed");
    throw err;
  }
}

export async function downloadFromB2(key: string, destPath: string) {
  const client = getR2Client();
  const bucket = getR2Bucket();

  try {
    logger.info({ key, destPath }, "Starting R2 download");
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const dir = path.dirname(destPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const writeStream = fs.createWriteStream(destPath);
    return new Promise<void>((resolve, reject) => {
      (response.Body as any).pipe(writeStream);
      writeStream.on("finish", () => {
        logger.info({ key }, "R2 download completed successfully");
        resolve();
      });
      writeStream.on("error", reject);
      (response.Body as any).on("error", reject);
    });
  } catch (err) {
    logger.error({ err, key, destPath }, "R2 download failed");
    throw err;
  }
}

export async function deleteFromB2(key: string) {
  const client = getR2Client();
  const bucket = getR2Bucket();

  try {
    logger.info({ key }, "Deleting R2 object");
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    logger.info({ key }, "R2 object deleted successfully");
  } catch (err) {
    logger.error({ err, key }, "R2 delete failed");
    throw err;
  }
}

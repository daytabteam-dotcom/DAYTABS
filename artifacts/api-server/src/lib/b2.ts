import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import { createReadStream } from "fs";
import path from "path";
import { logger } from "./logger";
import { registerAnalysisCancelHandler } from "./analysisCancellation";

function getConfiguredTimeoutMs(envName: string, defaultMs: number): number {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultMs;
}

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

export async function createR2MultipartUpload(key: string, contentType: string) {
  const response = await getR2Client().send(
    new CreateMultipartUploadCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ContentType: contentType,
    }),
  );

  if (!response.UploadId) {
    throw new Error("R2 multipart upload could not be created");
  }

  return {
    uploadId: response.UploadId,
    fileKey: key,
    fileUrl: readR2Config().publicUrl ? `${readR2Config().publicUrl}/${key}` : undefined,
  };
}

export async function createR2MultipartPartUploadUrl(key: string, multipartUploadId: string, partNumber: number) {
  const command = new UploadPartCommand({
    Bucket: getR2Bucket(),
    Key: key,
    UploadId: multipartUploadId,
    PartNumber: partNumber,
  });

  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 6 * 60 * 60 });
  return { uploadUrl };
}

export async function completeR2MultipartUpload(
  key: string,
  multipartUploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
) {
  const sortedParts = [...parts]
    .filter((part) => part.etag.trim())
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((part) => ({
      ETag: part.etag,
      PartNumber: part.partNumber,
    }));

  if (sortedParts.length === 0) {
    throw new Error("R2 multipart upload cannot be completed without uploaded parts");
  }

  await getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: getR2Bucket(),
      Key: key,
      UploadId: multipartUploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    }),
  );
}

export async function abortR2MultipartUpload(key: string, multipartUploadId: string) {
  await getR2Client().send(
    new AbortMultipartUploadCommand({
      Bucket: getR2Bucket(),
      Key: key,
      UploadId: multipartUploadId,
    }),
  );
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

export async function downloadFromB2(key: string, destPath: string, jobId?: string) {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const timeoutMs = getConfiguredTimeoutMs("R2_DOWNLOAD_TIMEOUT_MS", 30 * 60 * 1000);

  try {
    logger.info({ key, destPath, timeoutMs }, "Starting R2 download");
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const dir = path.dirname(destPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const writeStream = fs.createWriteStream(destPath);
    const body = response.Body as NodeJS.ReadableStream | undefined;
    if (!body || typeof body.pipe !== "function") {
      throw new Error("R2 download failed because the response body was empty");
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let bytesDownloaded = 0;
      const startedAt = Date.now();
      const unregisterCancelHandler = jobId
        ? registerAnalysisCancelHandler(jobId, () => {
            fail(new Error("Analysis cancelled"));
          })
        : undefined;

      const cleanup = () => {
        clearTimeout(timeout);
        unregisterCancelHandler?.();
        body.off("data", onData);
        body.off("error", onError);
        writeStream.off("finish", onFinish);
        writeStream.off("error", onError);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        (body as { destroy?: (error?: Error) => void }).destroy?.(err);
        writeStream.destroy(err);
        reject(err);
      };

      const timeout = setTimeout(() => {
        fail(new Error(`R2 download timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onData = (chunk: Buffer) => {
        bytesDownloaded += chunk.length;
      };

      const onError = (err: Error) => {
        fail(err);
      };

      const onFinish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        logger.info({ key, bytesDownloaded, durationMs: Date.now() - startedAt }, "R2 download completed successfully");
        resolve();
      };

      body.on("data", onData);
      body.on("error", onError);
      writeStream.on("finish", onFinish);
      writeStream.on("error", onError);
      body.pipe(writeStream);
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

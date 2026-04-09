import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { createReadStream } from "fs";
import path from "path";
import { logger } from "./logger";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required for Backblaze B2 integration`);
  }
  return value;
}

let b2Client: S3Client | null = null;
let b2Bucket: string | null = null;

function getB2Client(): S3Client {
  if (!b2Client) {
    try {
      b2Client = new S3Client({
        region: "us-east-1",
        endpoint: requireEnv("B2_ENDPOINT"),
        credentials: {
          accessKeyId: requireEnv("B2_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("B2_SECRET_ACCESS_KEY"),
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize B2 client. Check B2_ENDPOINT, B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY env vars");
      throw err;
    }
  }
  return b2Client;
}

function getB2Bucket(): string {
  if (!b2Bucket) {
    try {
      b2Bucket = requireEnv("B2_BUCKET_NAME");
    } catch (err) {
      logger.error({ err }, "B2_BUCKET_NAME not set");
      throw err;
    }
  }
  return b2Bucket;
}

export async function uploadToB2(key: string, filePath: string, contentType: string) {
  const client = getB2Client();
  const bucket = getB2Bucket();

  try {
    const stats = await fs.promises.stat(filePath);
    logger.info({ key, filePath, size: stats.size }, "Starting B2 upload");

    // For very large files, stream; for smaller files, buffer
    let body: any;
    if (stats.size > 100 * 1024 * 1024) {
      // > 100MB: use stream
      body = createReadStream(filePath);
    } else {
      // <= 100MB: use buffer for better compatibility
      body = await fs.promises.readFile(filePath);
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    logger.info({ key }, "B2 upload completed successfully");
  } catch (err) {
    logger.error({ err, key, filePath }, "B2 upload failed");
    throw err;
  }
}

export async function downloadFromB2(key: string, destPath: string) {
  const client = getB2Client();
  const bucket = getB2Bucket();

  try {
    logger.info({ key, destPath }, "Starting B2 download");
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
        logger.info({ key }, "B2 download completed successfully");
        resolve();
      });
      writeStream.on("error", reject);
      (response.Body as any).on("error", reject);
    });
  } catch (err) {
    logger.error({ err, key, destPath }, "B2 download failed");
    throw err;
  }
}

export async function deleteFromB2(key: string) {
  try {
    const client = getB2Client();
    const bucket = getB2Bucket();
    logger.info({ key }, "Deleting from B2");
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    logger.info({ key }, "B2 deletion completed");
  } catch (err) {
    logger.error({ err, key }, "Failed to delete from B2");
  }
}

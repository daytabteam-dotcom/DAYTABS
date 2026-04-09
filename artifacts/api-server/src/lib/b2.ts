import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required for Backblaze B2 integration`);
  }
  return value;
}

function createB2Client() {
  return new S3Client({
    region: "us-east-1",
    endpoint: requireEnv("B2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("B2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("B2_SECRET_ACCESS_KEY"),
    },
  });
}

export const b2 = createB2Client();
export const B2_BUCKET = requireEnv("B2_BUCKET_NAME");

export async function uploadToB2(key: string, filePath: string, contentType: string) {
  const fileBuffer = fs.readFileSync(filePath);
  await b2.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    }),
  );
}

export async function downloadFromB2(key: string, destPath: string) {
  const response = await b2.send(
    new GetObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
    }),
  );
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  fs.writeFileSync(destPath, Buffer.concat(chunks));
}

export async function deleteFromB2(key: string) {
  try {
    await b2.send(
      new DeleteObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
      }),
    );
  } catch (err) {
    console.error("Failed to delete from B2:", err);
  }
}

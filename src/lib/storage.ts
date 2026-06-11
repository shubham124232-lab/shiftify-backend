// Storage adapter — local disk (dev) or Cloudflare R2 (prod).
// R2 presigning uses AWS Signature Version 4 implemented natively with
// Node.js crypto — no @aws-sdk dependency required.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SavedFile {
  filePath: string; // relative to UPLOAD_DIR (local) or key in R2 bucket
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  userId: string;
  category: "compliance" | "avatars";
}

export interface PresignResult {
  uploadUrl: string;   // PUT to this URL
  fileKey: string;     // the object key in R2 (store this in DB)
  publicUrl: string;   // URL to read the file after upload
  expiresIn: number;   // seconds
}

// ── Save / delete (R2 when configured, local disk otherwise) ────────────────

export async function saveFile(input: UploadInput): Promise<SavedFile> {
  const fileKey = buildFileKey({
    originalName: input.originalName,
    userId:       input.userId,
    category:     input.category,
  });

  // R2: PUT the buffer server-side via a presigned URL. Without this, files
  // land on local disk while buildFileUrl() points at R2 — broken links.
  if (r2Configured()) {
    const presigned = generatePresignedUrl({ fileKey, contentType: input.mimeType })!;
    const res = await fetch(presigned.uploadUrl, {
      method:  "PUT",
      headers: { "Content-Type": input.mimeType },
      body:    new Uint8Array(input.buffer),
    });
    if (!res.ok) {
      throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);
    }
    return {
      filePath: fileKey,
      fileName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    };
  }

  const absPath = path.resolve(env.UPLOAD_DIR, fileKey);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, input.buffer);
  return {
    filePath: fileKey,
    fileName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
  };
}

export function getAbsolutePath(relPath: string): string {
  return path.resolve(env.UPLOAD_DIR, relPath);
}

export async function deleteFile(relPath: string): Promise<void> {
  if (r2Configured()) {
    const res = await fetch(presignR2Url("DELETE", relPath), { method: "DELETE" });
    // 404 = already gone — same tolerance as the ENOENT branch below.
    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
    }
    return;
  }
  const abs = getAbsolutePath(relPath);
  try {
    await fs.unlink(abs);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Build a publicly accessible URL for a stored file. */
export function buildFileUrl(relPath: string): string {
  if (env.R2_PUBLIC_URL) {
    // R2: relPath is already the full object key
    return `${env.R2_PUBLIC_URL}/${relPath}`;
  }
  const base = process.env.APP_BASE_URL ?? `http://localhost:${env.PORT}`;
  return `${base}/uploads/${relPath}`;
}

// ── R2 presign (AWS SigV4) ───────────────────────────────────────────────────

function r2Configured(): boolean {
  return !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET_NAME
  );
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

// Presign an R2 URL for a host-only-signed request (GET/DELETE — no body headers).
function presignR2Url(method: "GET" | "DELETE", fileKey: string, expiresIn = 300): string {
  const accountId = env.R2_ACCOUNT_ID!;
  const accessKey = env.R2_ACCESS_KEY_ID!;
  const secretKey = env.R2_SECRET_ACCESS_KEY!;
  const bucket    = env.R2_BUCKET_NAME!;
  const region    = "auto";
  const service   = "s3";

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;

  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const credentialScope = `${date}/${region}/${service}/aws4_request`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
    "X-Amz-Credential":    `${accessKey}/${credentialScope}`,
    "X-Amz-Date":          time,
    "X-Amz-Expires":       String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };

  const sortedQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalUri = `/${encodeURIComponent(fileKey).replace(/%2F/g, "/")}`;

  const canonicalRequest = [
    method,
    canonicalUri,
    sortedQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    time,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate    = hmac(`AWS4${secretKey}`, date);
  const kRegion  = hmac(kDate,    region);
  const kService = hmac(kRegion,  service);
  const kSigning = hmac(kService, "aws4_request");

  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${sortedQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Generate a presigned PUT URL for Cloudflare R2 (S3-compatible).
 * The client can PUT directly to this URL without going through the server.
 *
 * Returns null when R2 env vars are not configured (local-disk mode).
 */
export function generatePresignedUrl(opts: {
  fileKey: string;
  contentType: string;
  expiresIn?: number; // seconds, default 300
}): PresignResult | null {
  if (!r2Configured()) return null;

  const {
    fileKey,
    contentType,
    expiresIn = 300,
  } = opts;

  const accountId  = env.R2_ACCOUNT_ID!;
  const accessKey  = env.R2_ACCESS_KEY_ID!;
  const secretKey  = env.R2_SECRET_ACCESS_KEY!;
  const bucket     = env.R2_BUCKET_NAME!;
  const publicUrl  = env.R2_PUBLIC_URL ?? `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;

  const host   = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const time = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; // YYYYMMDDTHHmmssZ

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const credential      = `${accessKey}/${credentialScope}`;

  // Canonical query string (parameters must be sorted)
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
    "X-Amz-Credential":    credential,
    "X-Amz-Date":          time,
    "X-Amz-Expires":       String(expiresIn),
    "X-Amz-SignedHeaders": "content-type;host",
  };

  const sortedQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalUri     = `/${encodeURIComponent(fileKey).replace(/%2F/g, "/")}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders    = "content-type;host";
  const payloadHash      = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    time,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  // Derive signing key
  const kDate    = hmac(`AWS4${secretKey}`, date);
  const kRegion  = hmac(kDate,    region);
  const kService = hmac(kRegion,  service);
  const kSigning = hmac(kService, "aws4_request");

  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const uploadUrl = `https://${host}${canonicalUri}?${sortedQuery}&X-Amz-Signature=${signature}`;

  return {
    uploadUrl,
    fileKey,
    publicUrl: `${publicUrl}/${fileKey}`,
    expiresIn,
  };
}

/**
 * Generate a presigned GET URL for Cloudflare R2 (S3-compatible).
 * Used by admin document viewer so the admin's browser can fetch the file directly.
 * Falls back to buildFileUrl() when R2 is not configured (local-disk dev).
 */
export function generateGetPresignedUrl(opts: {
  fileKey: string;
  expiresIn?: number; // seconds, default 300
}): string {
  if (!r2Configured()) {
    return buildFileUrl(opts.fileKey);
  }

  const { fileKey, expiresIn = 300 } = opts;

  const accountId = env.R2_ACCOUNT_ID!;
  const accessKey = env.R2_ACCESS_KEY_ID!;
  const secretKey = env.R2_SECRET_ACCESS_KEY!;
  const bucket    = env.R2_BUCKET_NAME!;
  const region    = "auto";
  const service   = "s3";

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;

  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const credential      = `${accessKey}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
    "X-Amz-Credential":    credential,
    "X-Amz-Date":          time,
    "X-Amz-Expires":       String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };

  const sortedQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalUri     = `/${encodeURIComponent(fileKey).replace(/%2F/g, "/")}`;
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders    = "host";
  const payloadHash      = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "GET",
    canonicalUri,
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    time,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate    = hmac(`AWS4${secretKey}`, date);
  const kRegion  = hmac(kDate,    region);
  const kService = hmac(kRegion,  service);
  const kSigning = hmac(kService, "aws4_request");

  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${sortedQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Build an object key for R2 uploads.
 * Format: <category>/<userId>/<random><ext>
 */
export function buildFileKey(opts: {
  originalName: string;
  userId: string;
  category: "compliance" | "avatars";
}): string {
  const safeExt = path.extname(opts.originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const rand    = crypto.randomBytes(12).toString("hex");
  return `${opts.category}/${opts.userId}/${rand}${safeExt}`;
}

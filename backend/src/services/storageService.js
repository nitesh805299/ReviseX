import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

function getS3Client() {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

function extensionFromMime(mimeType) {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.bin';
  }
}

export async function uploadAssetFile({ buffer, mimeType, originalName, projectId }) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    const err = new Error('Unsupported image format. Allowed: PNG, JPEG, WebP, GIF.');
    err.statusCode = 400;
    throw err;
  }
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    const err = new Error('Image exceeds 5 MB upload limit.');
    err.statusCode = 400;
    throw err;
  }

  const randomId = crypto.randomBytes(12).toString('hex');
  const ext = extensionFromMime(mimeType);
  const storageKey = `projects/${projectId}/${randomId}${ext}`;

  const s3 = getS3Client();
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    const publicBase = env.S3_PUBLIC_URL || `${env.S3_ENDPOINT}/${env.S3_BUCKET}`;
    return {
      storageKey,
      url: `${publicBase.replace(/\/$/, '')}/${storageKey}`,
      filename: originalName || `${randomId}${ext}`,
    };
  }

  // Safe local disk fallback for development & testing
  const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);

  return {
    storageKey,
    url: `/uploads/${storageKey}`,
    filename: originalName || `${randomId}${ext}`,
  };
}

export async function deleteAssetFile(storageKey) {
  if (!storageKey) return;
  const s3 = getS3Client();
  if (s3) {
    await s3
      .send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }))
      .catch(() => {});
    return;
  }

  const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
  await fs.unlink(fullPath).catch(() => {});
}

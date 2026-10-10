/**
 * R2 Presigner
 *
 * Wraps Firebase Cloud Function calls for R2 presigned URL generation
 * and multipart upload orchestration.
 */

import { getFunctionsInstance } from "#lib/shared/auth/firebase.js";

async function call<T>(functionName: string, data: unknown): Promise<T> {
  const { httpsCallable } = await import("firebase/functions");
  const functions = await getFunctionsInstance();
  const callable = httpsCallable<unknown, T>(functions, functionName);
  const result = await callable(data);
  return result.data;
}

export async function getUploadUrl(params: {
  fileName: string;
  contentType: string;
  contentLength: number;
  userId: string;
  category: string;
  sequenceId: string;
}): Promise<{ presignedUrl: string; publicUrl: string; key: string }> {
  return call("r2PresignUrl", params);
}

export async function startMultipart(params: {
  fileName: string;
  contentType: string;
  userId: string;
  category: string;
  sequenceId: string;
}): Promise<{ uploadId: string; key: string }> {
  return call("r2MultipartStart", params);
}

export async function getPartUrl(params: {
  key: string;
  uploadId: string;
  partNumber: number;
}): Promise<{ presignedUrl: string }> {
  return call("r2MultipartPartUrl", params);
}

export async function completeMultipart(params: {
  key: string;
  uploadId: string;
  parts: Array<{ ETag: string; PartNumber: number }>;
}): Promise<{ publicUrl: string }> {
  return call("r2MultipartComplete", params);
}

export async function abortMultipart(params: {
  key: string;
  uploadId: string;
}): Promise<void> {
  await call("r2MultipartAbort", params);
}

export async function listParts(params: {
  key: string;
  uploadId: string;
}): Promise<{
  parts: Array<{ ETag: string; PartNumber: number; Size: number }>;
  expired: boolean;
}> {
  return call("r2MultipartListParts", params);
}

export async function deleteObject(key: string): Promise<void> {
  await call("r2DeleteObject", { key });
}

export async function deleteByPrefix(prefix: string): Promise<{ deletedCount: number }> {
  return call("r2DeleteByPrefix", { prefix });
}

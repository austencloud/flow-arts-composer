import type { RequestHandler } from "./$types";
import { requireFirebaseUser } from "#lib/server/auth/requireFirebaseUser.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";

const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
const MAX_SEQUENCE_ID_LENGTH = 200;
const CONTENT_TYPE_TO_EXTENSION = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
]);

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "");
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function hasStatus(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  );
}

function matchesImageType(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

type BodyReadResult =
  | { status: "ok"; bytes: Uint8Array }
  | { status: "empty" }
  | { status: "too_large" }
  | { status: "unreadable" };

async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<BodyReadResult> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("Thumbnail is too large");
        } catch {
          // The size result is already known; a failed cancel does not change it.
        }
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { status: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return { status: "empty" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", bytes };
}

export const POST: RequestHandler = async (event) => {
  const blocked = await withRateLimit(event, RATE_LIMITS.GENERAL, "ip");
  if (blocked) return blocked;

  const origin = event.request.headers.get("origin");
  if (origin && origin !== event.url.origin) {
    return textResponse("Cross-origin uploads are not allowed", 403);
  }

  let caller;
  try {
    caller = await requireFirebaseUser(event);
  } catch (error) {
    if (hasStatus(error)) {
      return textResponse(
        error instanceof Error ? error.message : "Authentication failed",
        error.status
      );
    }
    throw error;
  }

  const sequenceId = event.url.searchParams.get("sequenceId")?.trim() ?? "";
  if (!sequenceId || sequenceId.length > MAX_SEQUENCE_ID_LENGTH) {
    return textResponse("Invalid sequence ID", 400);
  }

  const contentType =
    event.request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? "";
  const extension = CONTENT_TYPE_TO_EXTENSION.get(contentType);
  if (!extension) {
    return textResponse("Unsupported thumbnail type", 415);
  }

  const env = workerEnv();
  const bucket = env?.TKA_ASSETS;
  const publicUrl = env?.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!bucket || !publicUrl) {
    return textResponse("Thumbnail storage is not configured", 503);
  }

  const declaredLengthHeader = event.request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
      return textResponse("Invalid thumbnail size", 400);
    }
    if (declaredLength > MAX_THUMBNAIL_SIZE) {
      return textResponse("Thumbnail is too large", 413);
    }
  }

  if (!event.request.body) {
    return textResponse("Thumbnail is empty", 400);
  }
  const bodyResult = await readBodyWithinLimit(
    event.request.body,
    MAX_THUMBNAIL_SIZE
  );
  if (bodyResult.status === "unreadable") {
    return textResponse("Thumbnail body could not be read", 400);
  }
  if (bodyResult.status === "empty") {
    return textResponse("Thumbnail is empty", 400);
  }
  if (bodyResult.status === "too_large") {
    return textResponse("Thumbnail is too large", 413);
  }

  const thumbnailBytes = bodyResult.bytes;
  if (!matchesImageType(contentType, thumbnailBytes)) {
    return textResponse("Thumbnail data does not match its content type", 415);
  }

  const uid = sanitizePathSegment(caller.uid);
  const safeSequenceId = sanitizePathSegment(sequenceId);
  if (!uid || !safeSequenceId) {
    return textResponse("Invalid thumbnail path", 400);
  }

  const key = `users/${uid}/thumbnails/${safeSequenceId}/thumbnail.${extension}`;

  try {
    await bucket.put(key, thumbnailBytes.buffer, {
      httpMetadata: { contentType },
    });
  } catch (error) {
    console.error("[thumbnail-upload] R2 put failed", error);
    return textResponse("Thumbnail upload failed", 503);
  }

  return Response.json(
    {
      url: `${publicUrl}/${key}`,
      key,
    },
    { status: 201 }
  );
};

import type { RequestHandler } from "./$types";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const HASH_RE = /^[0-9a-f]{64}$/;

const KNOWN_MP4_BRANDS = new Set([
  0x69736f6d, // isom
  0x69736f32, // iso2
  0x6d703431, // mp41
  0x6d703432, // mp42
  0x4d345620, // M4V
  0x61766331, // avc1
  0x66347620, // f4v
]);

function isMP4(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const view = new DataView(buf);
  if (view.getUint32(4) !== 0x66747970) return false;
  return KNOWN_MP4_BRANDS.has(view.getUint32(8));
}

export const PUT: RequestHandler = async (event) => {
  const blocked = await withRateLimit(event, RATE_LIMITS.GENERAL, "ip");
  if (blocked) return blocked;

  const origin = event.request.headers.get("origin");
  if (origin && origin !== event.url.origin) {
    return new Response("Cross-origin uploads not allowed", { status: 403 });
  }

  const { params, request } = event;
  const hash = params.hash;
  if (!hash || !HASH_RE.test(hash)) {
    return new Response("Invalid hash", { status: 400 });
  }

  const bucket = workerEnv()?.QR_VIDEOS;
  if (!bucket) {
    return new Response("R2 not configured", { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SIZE) {
    return new Response("Payload too large", { status: 413 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_SIZE) {
    return new Response("Payload too large", { status: 413 });
  }

  if (!isMP4(body)) {
    return new Response("Not a valid MP4", { status: 400 });
  }

  await bucket.put(`qr-videos/${hash}.mp4`, body, {
    httpMetadata: { contentType: "video/mp4" },
  });

  return new Response(null, { status: 204 });
};

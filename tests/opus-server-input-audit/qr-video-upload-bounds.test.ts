/**
 * AUDIT (read-only): /api/qr-video/[hash] PUT — reachable in production,
 * unauthenticated, and rate-limited by a key that includes the hash.
 *
 * Exercises the shipped handler against an in-memory R2 double. No network,
 * no credentials, no production probe.
 */
import { describe, expect, it, vi } from "vitest";
import { PUT } from "../../src/routes/api/qr-video/[hash]/+server";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import {
  fakeEvent,
  hashForIndex,
  minimalMp4Bytes,
} from "./helpers/fake-request-event";

interface BucketDouble {
  put: ReturnType<typeof vi.fn>;
  keys: string[];
}

function bucketDouble(): BucketDouble {
  const keys: string[] = [];
  const put = vi.fn(async (key: string) => {
    keys.push(key);
  });
  return { put, keys };
}

function putEvent(hash: string, bucket: BucketDouble, headers: Record<string, string> = {}) {
  return fakeEvent({
    url: `https://tkaflowarts.com/api/qr-video/${hash}`,
    method: "PUT",
    headers,
    body: minimalMp4Bytes(),
    params: { hash },
    clientAddress: "198.51.100.99",
    platformEnv: { QR_VIDEOS: bucket },
  });
}

describe("qr-video PUT: who may write", () => {
  it("accepts an unauthenticated request that sends no Origin header", async () => {
    const bucket = bucketDouble();
    const response = await PUT(putEvent(hashForIndex(7), bucket) as never);

    // No Authorization header, no session cookie, no Origin: a plain curl.
    expect(response.status).toBe(204);
    expect(bucket.keys).toEqual([`qr-videos/${hashForIndex(7)}.mp4`]);
  });

  it("rejects a browser request from another origin", async () => {
    const bucket = bucketDouble();
    const response = await PUT(
      putEvent(hashForIndex(8), bucket, { origin: "https://evil.example" }) as never
    );

    expect(response.status).toBe(403);
    expect(bucket.put).not.toHaveBeenCalled();
  });
});

describe("qr-video PUT: per-caller write ceiling", () => {
  it("writes far past the 100/min preset when the hash varies", async () => {
    vi.resetModules();
    const bucket = bucketDouble();
    const attempts = RATE_LIMITS.GENERAL.maxRequests * 4;

    for (let i = 0; i < attempts; i++) {
      const response = await PUT(putEvent(hashForIndex(50_000 + i), bucket) as never);
      expect(response.status).toBe(204);
    }

    // One IP, one 60-second window, a 100/min preset — and every write landed.
    expect(bucket.keys).toHaveLength(attempts);
    expect(new Set(bucket.keys).size).toBe(attempts);
  });
});

describe("qr-video PUT: payload bounds that DO hold", () => {
  it("rejects a body that is not an MP4", async () => {
    const bucket = bucketDouble();
    const response = await PUT(
      fakeEvent({
        url: `https://tkaflowarts.com/api/qr-video/${hashForIndex(9)}`,
        method: "PUT",
        body: new Uint8Array(64),
        params: { hash: hashForIndex(9) },
        platformEnv: { QR_VIDEOS: bucket },
      }) as never
    );

    expect(response.status).toBe(400);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("rejects a hash that is not 64 lowercase hex characters", async () => {
    const bucket = bucketDouble();
    const response = await PUT(putEvent("../../etc/passwd", bucket) as never);

    expect(response.status).toBe(400);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared content-length before reading the body", async () => {
    const bucket = bucketDouble();
    const hash = hashForIndex(10);
    const event = fakeEvent({
      url: `https://tkaflowarts.com/api/qr-video/${hash}`,
      method: "PUT",
      body: minimalMp4Bytes(),
      params: { hash },
      platformEnv: { QR_VIDEOS: bucket },
    });
    // Request headers are immutable once constructed; override the single
    // accessor the handler consults.
    vi.spyOn(event.request.headers, "get").mockImplementation((name: string) =>
      name.toLowerCase() === "content-length" ? String(21 * 1024 * 1024) : null
    );

    const response = await PUT(event as never);
    expect(response.status).toBe(413);
    expect(bucket.put).not.toHaveBeenCalled();
  });
});

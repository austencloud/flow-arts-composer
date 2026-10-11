import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireFirebaseUser: vi.fn(),
}));
const rateLimitMocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
}));

vi.mock("#lib/server/auth/requireFirebaseUser.js", () => ({
  requireFirebaseUser: authMocks.requireFirebaseUser,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: rateLimitMocks.withRateLimit,
}));

import { POST } from "../../src/routes/api/thumbnail/+server";
import { setWorkerEnv } from "#test-helpers/worker-env.js";

const R2_PUBLIC_URL = "https://pub-f5505ed75927471cb198c54336317370.r2.dev";
const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;

interface CapturedWrite {
  key: string;
  bytes: Uint8Array;
  options: {
    httpMetadata: {
      contentType: string;
    };
  };
}

function createBucket() {
  const writes: CapturedWrite[] = [];
  const put = vi.fn(
    async (
      key: string,
      value: ArrayBuffer,
      options: CapturedWrite["options"]
    ) => {
      const bytes = new Uint8Array(value);
      writes.push({ key, bytes, options });
      return { key };
    }
  );

  return {
    bucket: { put } as unknown as R2Bucket,
    put,
    writes,
  };
}

function makeRequest(
  body: BodyInit,
  options: {
    contentType?: string;
    contentLength?: number;
    origin?: string;
    sequenceId?: string;
  } = {}
): Request {
  const headers = new Headers({
    Authorization: "Bearer test-token",
    "Content-Type": options.contentType ?? "image/png",
    Origin: options.origin ?? "https://tkaflowarts.com",
  });
  if (options.contentLength !== undefined) {
    headers.set("Content-Length", String(options.contentLength));
  }

  const sequenceId = options.sequenceId ?? "sequence-123";
  return new Request(
    `https://tkaflowarts.com/api/thumbnail?sequenceId=${encodeURIComponent(sequenceId)}`,
    {
      method: "POST",
      headers,
      body,
    }
  );
}

function makeEvent(request: Request, bucket?: R2Bucket) {
  setWorkerEnv({ TKA_ASSETS: bucket, R2_PUBLIC_URL });
  return {
    request,
    url: new URL(request.url),
    getClientAddress: () => "203.0.113.10",
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requireFirebaseUser.mockResolvedValue({ uid: "firebase-user-1" });
  rateLimitMocks.withRateLimit.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/thumbnail", () => {
  it("stores the thumbnail under the authenticated user's canonical key", async () => {
    const { bucket, writes } = createBucket();
    const source = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);

    const response = await POST(
      makeEvent(
        makeRequest(new Blob([source], { type: "image/png" }), {
          contentLength: source.byteLength,
        }),
        bucket
      )
    );

    expect(response.status).toBe(201);
    expect(authMocks.requireFirebaseUser).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      key: "users/firebase-user-1/thumbnails/sequence-123/thumbnail.png",
      bytes: source,
      options: {
        httpMetadata: {
          contentType: "image/png",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      url:
        `${R2_PUBLIC_URL}/users/firebase-user-1/` +
        "thumbnails/sequence-123/thumbnail.png",
      key: "users/firebase-user-1/thumbnails/sequence-123/thumbnail.png",
    });
  });

  it("requires a verified Firebase caller before writing", async () => {
    const { bucket, put } = createBucket();
    const authError = Object.assign(new Error("Missing token"), {
      status: 401,
      code: "missing_token",
    });
    authMocks.requireFirebaseUser.mockRejectedValueOnce(authError);

    const response = await POST(
      makeEvent(makeRequest(new Blob(["image"])), bucket)
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Missing token");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types before writing", async () => {
    const { bucket, put } = createBucket();

    const response = await POST(
      makeEvent(
        makeRequest(new Blob(["not-an-image"]), {
          contentType: "text/html",
        }),
        bucket
      )
    );

    expect(response.status).toBe(415);
    expect(await response.text()).toBe("Unsupported thumbnail type");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects image bytes that do not match the declared type", async () => {
    const { bucket, put } = createBucket();

    const response = await POST(
      makeEvent(
        makeRequest(new Blob(["not-a-png"]), {
          contentType: "image/png",
        }),
        bucket
      )
    );

    expect(response.status).toBe(415);
    expect(await response.text()).toBe(
      "Thumbnail data does not match its content type"
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin upload before authentication", async () => {
    const { bucket, put } = createBucket();

    const response = await POST(
      makeEvent(
        makeRequest(new Blob(["image"]), {
          origin: "https://attacker.example",
        }),
        bucket
      )
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Cross-origin uploads are not allowed");
    expect(authMocks.requireFirebaseUser).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a declared body larger than ten MiB before writing", async () => {
    const { bucket, put } = createBucket();

    const response = await POST(
      makeEvent(
        makeRequest(new Blob(["small"]), {
          contentLength: MAX_THUMBNAIL_SIZE + 1,
        }),
        bucket
      )
    );

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Thumbnail is too large");
    expect(put).not.toHaveBeenCalled();
  });

  it("enforces the actual body size when content-length is absent", async () => {
    const { bucket, put } = createBucket();
    const oversized = new Blob([new Uint8Array(MAX_THUMBNAIL_SIZE + 1)], {
      type: "image/png",
    });
    const request = makeRequest(oversized);
    request.headers.delete("content-length");

    const response = await POST(makeEvent(request, bucket));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Thumbnail is too large");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an empty body before writing", async () => {
    const { bucket, put } = createBucket();

    const response = await POST(
      makeEvent(makeRequest(new Blob([], { type: "image/png" })), bucket)
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Thumbnail is empty");
    expect(put).not.toHaveBeenCalled();
  });

  it("returns a retryable response when R2 rejects the write", async () => {
    const put = vi.fn().mockRejectedValueOnce(new Error("R2 unavailable"));
    const bucket = { put } as unknown as R2Bucket;
    const source = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await POST(
      makeEvent(makeRequest(new Blob([source], { type: "image/png" })), bucket)
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Thumbnail upload failed");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

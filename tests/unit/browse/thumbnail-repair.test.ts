import { beforeEach, describe, expect, it, vi } from "vitest";

const markMissing = vi.fn();
vi.mock("#lib/shared/browse/services/cloud-thumbnail-cache.js", () => ({
  markMissing: (...a: unknown[]) => markMissing(...a),
}));

import { repairThumbnailCaches } from "../../../src/lib/shared/browse/services/thumbnail-repair";
import { saveCloudBlobToLocal } from "../../../src/lib/shared/browse/services/thumbnail-render-orchestrator";

const cloudKey = {
  sequenceName: "AB",
  propType: "staff",
  lightMode: false,
  variant: "default",
  showQRCode: false,
} as unknown as Parameters<typeof saveCloudBlobToLocal>[2];

describe("repairThumbnailCaches", () => {
  beforeEach(() => markMissing.mockClear());

  it("cloud-404: marks missing + deletes local blob + evicts memory hash", async () => {
    const localCache = { delete: vi.fn(async () => {}) };
    const evictHash = vi.fn();
    await repairThumbnailCaches({
      kind: "cloud-404",
      hash: "h1",
      cloudKey,
      localCache,
      evictHash,
    });
    expect(markMissing).toHaveBeenCalledWith(cloudKey);
    expect(localCache.delete).toHaveBeenCalledWith("h1");
    expect(evictHash).toHaveBeenCalledWith("h1");
  });

  it("blob-decode: purges local tiers but does NOT negative-cache the cloud", async () => {
    const localCache = { delete: vi.fn(async () => {}) };
    const evictHash = vi.fn();
    await repairThumbnailCaches({
      kind: "blob-decode",
      hash: "h2",
      cloudKey,
      localCache,
      evictHash,
    });
    expect(markMissing).not.toHaveBeenCalled();
    expect(localCache.delete).toHaveBeenCalledWith("h2");
    expect(evictHash).toHaveBeenCalledWith("h2");
  });
});

describe("saveCloudBlobToLocal", () => {
  beforeEach(() => markMissing.mockClear());

  const blob = new Blob(["x"]);

  it("writes the blob on 200", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal(
      "u",
      "h",
      cloudKey,
      localCache,
      async () =>
        ({ ok: true, status: 200, blob: async () => blob }) as unknown as Response
    );
    expect(localCache.set).toHaveBeenCalledWith("h", blob);
    expect(markMissing).not.toHaveBeenCalled();
  });

  it("404: no write, negative-caches the cloud key", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal(
      "u",
      "h",
      cloudKey,
      localCache,
      async () =>
        ({ ok: false, status: 404, blob: async () => blob }) as unknown as Response
    );
    expect(localCache.set).not.toHaveBeenCalled();
    expect(markMissing).toHaveBeenCalledWith(cloudKey);
  });

  it("500: no write, NOT negative-cached (stays retryable)", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal(
      "u",
      "h",
      cloudKey,
      localCache,
      async () =>
        ({ ok: false, status: 500, blob: async () => blob }) as unknown as Response
    );
    expect(localCache.set).not.toHaveBeenCalled();
    expect(markMissing).not.toHaveBeenCalled();
  });
});

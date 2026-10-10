import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks must be declared before importing the SUT.
const blobGet = vi.fn();
const blobSet = vi.fn().mockResolvedValue(undefined);
vi.mock("#lib/shared/render/services/pictograph-blob-cache.js", () => ({
  pictographBlobCache: {
    get: (...a: unknown[]) => blobGet(...a),
    set: (...a: unknown[]) => blobSet(...a),
  },
}));

const poolRender = vi.fn();
vi.mock("#lib/shared/render/services/worker-render-pool.js", () => ({
  getWorkerRenderPool: () => ({
    render: (...a: unknown[]) => poolRender(...a),
  }),
}));

const cloudDownload = vi.fn();
const cloudUpload = vi.fn().mockResolvedValue("https://x/y.webp");
vi.mock("#lib/shared/render/services/pictograph-cloud-cache.js", () => ({
  download: (...a: unknown[]) => cloudDownload(...a),
  upload: (...a: unknown[]) => cloudUpload(...a),
  cellPublicUrl: (h: string) => `https://x/${h}.webp`,
}));

vi.mock("#lib/shared/render/services/cloud-cell-key.js", () => ({
  CANONICAL_CELL_SIZE: 480,
  deriveCloudCellHash: vi.fn().mockResolvedValue("HASH"),
  canonicalCellKeyString: vi.fn().mockReturnValue("k"),
}));

vi.mock(
  "#lib/shared/pictograph/shared/services/pictograph-preparer.js",
  () => ({
    pictographPreparer: { prepareSingle: vi.fn().mockResolvedValue({}) },
  })
);
vi.mock("#lib/shared/render/services/png-blob-to-webp.js", () => ({
  pngBlobToWebp: vi
    .fn()
    .mockResolvedValue(new Blob(["w"], { type: "image/webp" })),
}));

globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");

import { renderCell } from "./preview-cell-renderer";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const data = { letter: "A", motions: {} } as unknown as PictographData;

describe("renderCell cloud tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blobGet.mockResolvedValue(null); // IndexedDB miss (cold)
  });

  it("probeCloud HIT: downloads, never calls the worker", async () => {
    cloudDownload.mockResolvedValue(new Blob(["img"], { type: "image/webp" }));
    await renderCell(data, undefined, true, { size: 300, probeCloud: true });
    expect(cloudDownload).toHaveBeenCalledWith("HASH");
    expect(poolRender).not.toHaveBeenCalled();
  });

  it("probeCloud MISS without uploadCanonical: renders locally, does NOT upload", async () => {
    cloudDownload.mockResolvedValue(null);
    poolRender.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await renderCell(data, undefined, true, { size: 300, probeCloud: true });
    expect(poolRender).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(cloudUpload).not.toHaveBeenCalled();
  });

  it("probeCloud failure recovers locally and caches the cell for a repeat demo view", async () => {
    cloudDownload.mockRejectedValue(new Error("network unavailable"));
    poolRender.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await renderCell(data, undefined, true, { size: 300, probeCloud: true });
    expect(poolRender).toHaveBeenCalledTimes(1);
    expect(blobSet).toHaveBeenCalledWith(expect.any(String), expect.any(Blob));

    blobGet.mockResolvedValue(new Blob(["cached"], { type: "image/png" }));
    await renderCell(data, undefined, true, { size: 300, probeCloud: true });
    expect(poolRender).toHaveBeenCalledTimes(1);
    expect(cloudDownload).toHaveBeenCalledTimes(1);
    expect(cloudUpload).not.toHaveBeenCalled();
  });

  it("cloudOnly MISS: fails without loading the local renderer", async () => {
    cloudDownload.mockResolvedValue(null);

    await expect(
      renderCell(data, undefined, true, {
        size: 300,
        probeCloud: true,
        cloudOnly: true,
      })
    ).rejects.toThrow("Canonical pictograph HASH is unavailable");

    expect(poolRender).not.toHaveBeenCalled();
  });

  it("uploadCanonical: renders + uploads (render-at-publish path)", async () => {
    cloudDownload.mockResolvedValue(null);
    poolRender.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await renderCell(data, undefined, true, {
      size: 300,
      probeCloud: true,
      uploadCanonical: true,
    });
    expect(cloudDownload).toHaveBeenCalledWith("HASH", {
      probeUnknown: false,
    });
    expect(poolRender).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(cloudUpload).toHaveBeenCalledWith("HASH", expect.any(Blob))
    );
  });

  it("no flags: skips cloud entirely, renders locally", async () => {
    poolRender.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await renderCell(data, undefined, true, { size: 300 });
    expect(cloudDownload).not.toHaveBeenCalled();
    expect(poolRender).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(cloudUpload).not.toHaveBeenCalled();
  });

  it("uploadCanonical + IDB hit + cloud MISS: backfills the upload from the cached blob", async () => {
    blobGet.mockResolvedValue(new Blob(["cached"], { type: "image/png" }));
    cloudDownload.mockResolvedValue(null);
    await renderCell(data, undefined, true, {
      size: 300,
      probeCloud: true,
      uploadCanonical: true,
    });
    expect(cloudDownload).toHaveBeenCalledWith("HASH", {
      probeUnknown: false,
    });
    expect(cloudUpload).toHaveBeenCalledWith("HASH", expect.any(Blob));
    expect(poolRender).not.toHaveBeenCalled(); // cached blob reused, no re-render
  });

  it("uploadCanonical + IDB hit + cloud HIT: uploads nothing (idempotent re-warm)", async () => {
    blobGet.mockResolvedValue(new Blob(["cached"], { type: "image/png" }));
    cloudDownload.mockResolvedValue(
      new Blob(["cloud"], { type: "image/webp" })
    );
    await renderCell(data, undefined, true, {
      size: 300,
      probeCloud: true,
      uploadCanonical: true,
    });
    expect(cloudUpload).not.toHaveBeenCalled();
    expect(poolRender).not.toHaveBeenCalled();
  });

  it("plain IDB hit without uploadCanonical: never touches the cloud", async () => {
    blobGet.mockResolvedValue(new Blob(["cached"], { type: "image/png" }));
    await renderCell(data, undefined, true, { size: 300, probeCloud: true });
    expect(cloudDownload).not.toHaveBeenCalled();
    expect(cloudUpload).not.toHaveBeenCalled();
    expect(poolRender).not.toHaveBeenCalled();
  });
});

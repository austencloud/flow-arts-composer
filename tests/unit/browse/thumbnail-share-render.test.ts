/**
 * A card that opts out of sharing its render never uploads it.
 *
 * Uploading signs a signed-out visitor in anonymously, which loads Firebase
 * Auth, Storage and Firestore. The /composer gallery passes
 * shareRender: false so gliding past it creates no account; nothing on the
 * page shows whether an upload ran, so this pins the gate.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));
vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: () => {},
  invalidateUrl: () => {},
  markMissing: vi.fn(),
}));

import { ThumbnailRenderOrchestrator } from "$lib/shared/browse/services/thumbnail-render-orchestrator";
import { ThumbnailRenderQueue } from "$lib/shared/browse/services/thumbnail-render-queue";
import * as cloudThumbnailCache from "$lib/shared/browse/services/cloud-thumbnail-cache";

const sequence = {
  id: "seq-1",
  word: "AB",
  steps: [],
} as unknown as SequenceData;

const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "seq-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

function renderOnce(shareRender?: boolean) {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:rendered"),
    revokeObjectURL: vi.fn(),
  });
  const localCache = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  };
  const orchestrator = new ThumbnailRenderOrchestrator(
    new ThumbnailRenderQueue(),
    {
      render: vi.fn(async () => ({
        blob: new Blob(["card"], { type: "image/webp" }),
        qrConsistent: true,
      })),
    } as never,
    localCache as never
  );
  return {
    localCache,
    result: orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      ...(shareRender === undefined ? {} : { shareRender }),
    }),
  };
}

afterEach(() => {
  vi.mocked(cloudThumbnailCache.upload).mockClear();
  vi.unstubAllGlobals();
});

describe("ThumbnailRenderOrchestrator shareRender", () => {
  it("uploads a fresh shared render by default", async () => {
    const { result } = renderOnce();
    await expect(result).resolves.toMatchObject({ url: "blob:rendered" });
    expect(cloudThumbnailCache.upload).toHaveBeenCalledOnce();
  });

  it("keeps the render on this device when sharing is off", async () => {
    const { result, localCache } = renderOnce(false);
    await expect(result).resolves.toMatchObject({ url: "blob:rendered" });
    expect(localCache.set).toHaveBeenCalledOnce();
    expect(cloudThumbnailCache.upload).not.toHaveBeenCalled();
  });
});

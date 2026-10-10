import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ThumbnailRenderInput } from "./thumbnail-key-deriver";

// The cloud tier talks to Firebase Storage — stub it out entirely so a miss
// there can't mask (or fake) the tiers under test.
vi.mock("#lib/shared/browse/services/cloud-thumbnail-cache.js", () => ({
  getCachedUrl: () => undefined,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => {}),
  clearMemoryCache: () => {},
  invalidateUrl: () => {},
  markMissing: vi.fn(),
}));

import { ThumbnailRenderOrchestrator } from "./thumbnail-render-orchestrator";
import { deriveKey } from "./thumbnail-key-deriver";
import * as cloudCacheModule from "#lib/shared/browse/services/cloud-thumbnail-cache.js";

const sequence = {
  id: "seq-1",
  word: "AB",
  steps: [],
} as unknown as SequenceData;

/** Default-composition gallery input → usesDefaults=true → static tier eligible. */
const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "seq-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

const staticKey = (() => {
  // Same construction as orchestrator.buildStaticKey — asserted below so the
  // test fails loudly if the formats ever drift apart.
  const key = deriveKey(input);
  return `${key.inputs.variant}/${key.propKey}/${key.inputs.sequenceName}_${key.inputs.sequenceId}_r${key.rendererVersion}_dark`;
})();

function makeOrchestrator() {
  const render = vi.fn(async () => ({
    blob: new Blob(["x"], { type: "image/webp" }),
    qrConsistent: true,
  }));
  // Mirrors ThumbnailRenderQueue.enqueue: the task receives BOTH an abort
  // signal and a reportActivity callback (the real queue uses the latter to
  // refresh its inactivity deadline). Dropping the second argument makes every
  // render throw "reportActivity is not a function" instead of exercising the
  // tiers under test.
  const reportActivity = vi.fn();
  const enqueue = vi.fn(
    (
      _hash: string,
      task: (
        signal: AbortSignal,
        reportActivity: () => void
      ) => Promise<unknown>
    ) => task(new AbortController().signal, reportActivity)
  );
  const queue = {
    enqueue,
    getStats: () => ({ queued: 0, active: 0 }),
    cancel: () => {},
  };
  const localCache = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  };
  const orchestrator = new ThumbnailRenderOrchestrator(
    queue as never,
    { render } as never,
    localCache as never
  );
  return { orchestrator, render, localCache, enqueue };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/thumbnails/manifest.json")) {
        return {
          ok: true,
          json: async () => ({ keys: [staticKey] }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    })
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThumbnailRenderOrchestrator cache tiers", () => {
  it("buildStaticKey matches the manifest key format this test assumes", () => {
    const { orchestrator } = makeOrchestrator();
    expect(orchestrator.buildStaticKey(deriveKey(input))).toBe(staticKey);
  });

  it("serves the STATIC tier on the very first request of a session (no local render)", async () => {
    // Regression: `renderedGenerations.get(hash) ?? -1` made -1 < generation(0)
    // true for every unseen key, silently skipping static/local/cloud and
    // re-rendering the whole gallery locally once per session.
    const { orchestrator, render } = makeOrchestrator();

    const result = await orchestrator.getThumbnail({ sequence, input });

    expect(result.url).toBe(`/thumbnails/${staticKey}.webp`);
    expect(result.fromCache).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });

  it("invalidateAllCaches() forces a fresh render even when the static manifest matched before", async () => {
    const { orchestrator, render } = makeOrchestrator();
    await orchestrator.getThumbnail({ sequence, input }); // static hit
    expect(render).not.toHaveBeenCalled();

    orchestrator.invalidateAllCaches();
    const result = await orchestrator.getThumbnail({ sequence, input });

    expect(render).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.url).toBe("blob:test");
  });

  it("skipCache renders fresh without touching tiers", async () => {
    const { orchestrator, render, localCache } = makeOrchestrator();
    const result = await orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(localCache.get).not.toHaveBeenCalled();
  });

  it("reserves the exclusive queue lane only for QR-bearing thumbnails", async () => {
    const ordinary = makeOrchestrator();
    await ordinary.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
    });
    expect(ordinary.enqueue).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ exclusive: false })
    );

    const qr = makeOrchestrator();
    await qr.orchestrator.getThumbnail({
      sequence,
      input: {
        ...input,
        visibility: { showQRCode: true },
      },
      skipCache: true,
    });
    expect(qr.enqueue).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ exclusive: true })
    );
  });

  it("does not turn an ordinary unknown cloud key into a failed network request", async () => {
    const { orchestrator, render } = makeOrchestrator();
    const uncachedInput = {
      ...input,
      sequenceName: "CD",
      sequenceId: "quiet-cloud-miss",
    };

    await orchestrator.getThumbnail({
      sequence: { ...sequence, id: "quiet-cloud-miss", word: "CD" },
      input: uncachedInput,
    });

    expect(cloudCacheModule.getUrl).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceId: "quiet-cloud-miss" }),
      Infinity,
      { probeUnknown: false }
    );
    expect(render).toHaveBeenCalledOnce();
  });
});

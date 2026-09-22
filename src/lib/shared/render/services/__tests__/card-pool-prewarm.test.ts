import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  probeWorkerSupport: vi.fn(),
  getDispatcher: vi.fn(),
  getCardAssetBundle: vi.fn(),
  buildOverridePlacementBundle: vi.fn(),
}));

vi.mock("../composition-dispatcher", () => ({
  CompositionDispatcher: {
    probeWorkerSupport: mocked.probeWorkerSupport,
  },
}));
vi.mock("../../get-composition-dispatcher", () => ({
  getCompositionDispatcher: mocked.getDispatcher,
}));
vi.mock("../get-card-asset-bundle", () => ({
  getCardAssetBundle: mocked.getCardAssetBundle,
}));
vi.mock("../override-placement-bundle", () => ({
  buildOverridePlacementBundle: mocked.buildOverridePlacementBundle,
}));

import {
  computeBundleSignature,
  prewarmCardPool,
  resolvePrewarmPropTypes,
  seedCardPool,
} from "../card-pool-prewarm";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const seq = (id: string) =>
  ({ id, word: id, steps: [] }) as unknown as SequenceData;
const base = {
  sequences: [seq("a"), seq("b")],
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  theme: "cosmic",
  iconPaths: ["/icons/fire.png"],
};

function createDispatcher() {
  let seededSignature: string | null = null;
  let requestedSignature: string | null = null;
  const finishSeed = vi.fn();
  const dispatcher = {
    getSeededSignature: vi.fn(() => seededSignature),
    beginSeed: vi.fn((signature: string) => {
      requestedSignature = signature;
      return finishSeed;
    }),
    setAssetBundle: vi.fn(),
    setOverrideBundle: vi.fn(),
    ensureInitialized: vi.fn(async () => {
      seededSignature = requestedSignature;
    }),
  };
  return { dispatcher, finishSeed };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.probeWorkerSupport.mockResolvedValue(true);
  mocked.getCardAssetBundle.mockResolvedValue({ keys: [], bitmaps: [] });
  mocked.buildOverridePlacementBundle.mockReturnValue({});
});

describe("computeBundleSignature", () => {
  it("is stable for the same inputs regardless of sequence order", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({
      ...base,
      sequences: [seq("b"), seq("a")],
    });
    expect(s1).toBe(s2);
  });

  it("changes when a sequence id set changes", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({
      ...base,
      sequences: [seq("a"), seq("c")],
    });
    expect(s1).not.toBe(s2);
  });

  it("changes for variations that share a base sequence id", () => {
    const variationA = {
      ...seq("reused"),
      steps: [{ startPosition: "alpha" }],
    } as unknown as SequenceData;
    const variationB = {
      ...seq("reused"),
      steps: [{ startPosition: "beta" }],
    } as unknown as SequenceData;

    expect(
      computeBundleSignature({ ...base, sequences: [variationA] })
    ).not.toBe(computeBundleSignature({ ...base, sequences: [variationB] }));
  });

  it("changes when prop types change", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({ ...base, rightPropType: PropType.FAN });
    expect(s1).not.toBe(s2);
  });

  it("changes when footer icons or theme change", () => {
    const original = computeBundleSignature(base);

    expect(
      computeBundleSignature({ ...base, iconPaths: ["/icons/water.png"] })
    ).not.toBe(original);
    expect(computeBundleSignature({ ...base, theme: "light" })).not.toBe(
      original
    );
  });

  it("seeds hand-path pools with hand assets regardless of live prop settings", () => {
    const handPath = { ...base, handPathMode: true };

    expect(resolvePrewarmPropTypes(handPath)).toEqual({
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
    });
    expect(computeBundleSignature(handPath)).toBe(
      computeBundleSignature({
        ...base,
        leftPropType: PropType.HAND,
        rightPropType: PropType.HAND,
      })
    );
  });
});

describe("seedCardPool", () => {
  it("awaits bundle installation and worker initialization", async () => {
    const { dispatcher, finishSeed } = createDispatcher();
    mocked.getDispatcher.mockReturnValue(dispatcher);

    await seedCardPool(base);

    expect(mocked.getCardAssetBundle).toHaveBeenCalledWith(base.sequences, {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      theme: "cosmic",
      iconPaths: ["/icons/fire.png"],
    });
    expect(dispatcher.setAssetBundle).toHaveBeenCalledTimes(1);
    expect(dispatcher.setOverrideBundle).toHaveBeenCalledWith({});
    expect(finishSeed).toHaveBeenCalledTimes(1);
    expect(dispatcher.ensureInitialized).toHaveBeenCalledTimes(1);
  });

  it("installs a fresh bundle for a hand-to-staff deck switch", async () => {
    const { dispatcher } = createDispatcher();
    mocked.getDispatcher.mockReturnValue(dispatcher);
    const handDeck = { ...base, handPathMode: true };

    await seedCardPool(handDeck);
    await seedCardPool(base);

    expect(dispatcher.beginSeed).toHaveBeenCalledTimes(2);
    expect(mocked.getCardAssetBundle).toHaveBeenNthCalledWith(
      1,
      base.sequences,
      expect.objectContaining({
        leftPropType: PropType.HAND,
        rightPropType: PropType.HAND,
      })
    );
    expect(mocked.getCardAssetBundle).toHaveBeenNthCalledWith(
      2,
      base.sequences,
      expect.objectContaining({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      })
    );
    expect(dispatcher.setAssetBundle).toHaveBeenCalledTimes(2);
  });

  it("rejects strict setup after opening the gate while production prewarm falls back", async () => {
    const { dispatcher, finishSeed } = createDispatcher();
    mocked.getDispatcher.mockReturnValue(dispatcher);
    mocked.getCardAssetBundle.mockRejectedValue(
      new Error("asset bundle failed")
    );

    await expect(seedCardPool(base)).rejects.toThrow("asset bundle failed");
    expect(finishSeed).toHaveBeenCalledTimes(1);
    expect(dispatcher.ensureInitialized).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    prewarmCardPool(base);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(finishSeed).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

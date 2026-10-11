import { afterEach, describe, expect, it, vi } from "vitest";
import type { MandalaPrimitiveRef } from "#lib/features/sticker-lab/domain/sticker-types.js";

const mocks = vi.hoisted(() => ({
  getSequence: vi.fn(),
  calculate: vi.fn(),
}));

vi.mock("#lib/shared/create/get-sequence-repository.js", () => ({
  getSequenceRepository: () => ({ getSequence: mocks.getSequence }),
}));
vi.mock("#lib/shared/mandala/services/mandala-geometry-calculator.js", () => ({
  calculate: mocks.calculate,
}));

import {
  clearMandalaPathsCache,
  getPrimitivePaths,
  loadPrimitivePaths,
} from "#lib/features/sticker-lab/state/mandala-paths-cache.svelte.js";

const ref: MandalaPrimitiveRef = {
  shapeHash: "geometric-shape",
  ultraHash: "geometric-orbit",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-source",
};

describe("mandala paths cache", () => {
  afterEach(() => {
    clearMandalaPathsCache();
    vi.clearAllMocks();
  });

  it("loads through the representative sequence and caches by geometric identity", async () => {
    const paths = {
      left: [{ d: "M 0 0 C 0 0, 1 1, 2 2", tipIndex: 0 }],
      right: [],
      purple: [],
    };
    mocks.getSequence.mockResolvedValue({ steps: [{}] });
    mocks.calculate.mockReturnValue(paths);

    await expect(loadPrimitivePaths(ref)).resolves.toBe(paths);
    expect(mocks.getSequence).toHaveBeenCalledWith("sequence-source");
    expect(mocks.getSequence).not.toHaveBeenCalledWith("geometric-shape");
    expect(getPrimitivePaths("geometric-shape")).toEqual(paths);
  });
});

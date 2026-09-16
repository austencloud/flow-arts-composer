import { describe, it, expect, vi } from "vitest";

// Stub the heavy buildBackJob import graph (Svelte components, rasterize-node)
// so importing the warm module under test doesn't pull it in. Functionality is
// exercised via the injected buildBackJob param below.
vi.mock("../card-back-job-builder", () => ({ buildBackJob: vi.fn() }));

import { warmCardBackCachesAsync } from "../warm-card-back-caches";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const seq = { id: "x", steps: [] } as unknown as SequenceData;
const bmp = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

function makeJob() {
  return {
    width: 1644,
    height: 2244,
    bleedPx: 72,
    borderPx: 144,
    borderGradient: {},
    bgGradient: {},
    decorations: null,
    mandala: { bitmap: bmp(), placement: {} },
    bitmaps: [
      { kind: "brand", bitmap: bmp(), placement: {} },
      { kind: "url-ornament", bitmap: bmp(), placement: {} },
      { kind: "difficulty-badge", bitmap: bmp(), placement: {} },
      { kind: "turn-glyph", bitmap: bmp(), placement: {} },
      { kind: "reversal-glyph", bitmap: bmp(), placement: {} },
      { kind: "step-count", bitmap: bmp(), placement: {} },
      { kind: "start-placement-pictograph", bitmap: bmp(), placement: {} },
      { kind: "loop-icon", bitmap: bmp(), placement: {} },
    ],
  } as never;
}

describe("warmCardBackCaches", () => {
  it("calls buildBackJob once with the standard back dims + theme", async () => {
    const build = vi.fn().mockResolvedValue(makeJob());
    await warmCardBackCachesAsync(seq, "cosmic", build);
    expect(build).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledWith(seq, { width: 1644, height: 2244, bleedPx: 72, theme: "cosmic" });
  });

  it("closes per-card bitmaps + mandala, keeps cache-shared bitmaps open", async () => {
    const job = makeJob();
    await warmCardBackCachesAsync(seq, "cosmic", vi.fn().mockResolvedValue(job));
    const closeByKind = Object.fromEntries(
      (job as { bitmaps: { kind: string; bitmap: { close: ReturnType<typeof vi.fn> } }[] }).bitmaps.map(
        (b) => [b.kind, b.bitmap.close],
      ),
    );
    // Per-card kinds → closed.
    for (const k of ["turn-glyph", "reversal-glyph", "step-count", "start-placement-pictograph", "loop-icon"]) {
      expect(closeByKind[k]).toHaveBeenCalledOnce();
    }
    expect((job as { mandala: { bitmap: { close: ReturnType<typeof vi.fn> } } }).mandala.bitmap.close).toHaveBeenCalledOnce();
    // Cache-shared kinds → NOT closed (would corrupt the constant caches).
    for (const k of ["brand", "url-ornament", "difficulty-badge"]) {
      expect(closeByKind[k]).not.toHaveBeenCalled();
    }
  });

  it("swallows a buildBackJob rejection without throwing", async () => {
    await expect(
      warmCardBackCachesAsync(seq, "cosmic", vi.fn().mockRejectedValue(new Error("boom"))),
    ).resolves.toBeUndefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ThumbnailResult } from "./thumbnail-render-orchestrator";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { expandCombos, startGalleryWarm, type WarmScope } from "./gallery-thumbnail-warmer";

/** Minimal SequenceData — only identity + steps affect the warmer path.
 * id defaults to the word: real pool ids are unique, and the warmer now
 * dedupes by id, so same-id fixtures would silently collapse. */
function seq(overrides: Partial<SequenceData>): SequenceData {
  return {
    id: overrides.word ?? "id",
    name: "",
    word: "",
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ...overrides,
  } as SequenceData;
}

const scope: WarmScope = {
  props: [PropType.STAFF, PropType.FAN],
  modes: ["dark", "light"],
  qr: [false, true],
};

/** Fake orchestrator whose getThumbnail returns a scripted result. */
function fakeOrchestrator(
  respond: (input: unknown, sequence: SequenceData) => ThumbnailResult
) {
  const getThumbnail = vi.fn(async (req: { sequence: SequenceData; input: unknown }) =>
    respond(req.input, req.sequence)
  );
  return { orchestrator: { getThumbnail } as never, getThumbnail };
}

const loaderOf = (sequences: SequenceData[]) => ({
  loadSequenceMetadata: vi.fn(async () => sequences),
});

const okResult = (fromCache: boolean): ThumbnailResult =>
  ({ url: "blob:x", fromCache, key: { hash: "h" } } as unknown as ThumbnailResult);
const nullResult = (): ThumbnailResult =>
  ({ url: null, fromCache: false, key: { hash: "h" } } as unknown as ThumbnailResult);

describe("expandCombos", () => {
  it("produces sequences × props × modes × qr combos", () => {
    const sequences = [seq({ word: "A" }), seq({ word: "B" })];
    const combos = expandCombos(sequences, scope);
    expect(combos).toHaveLength(2 * 2 * 2 * 2); // 16
  });

  it("is empty when any axis is empty", () => {
    expect(expandCombos([seq({ word: "A" })], { ...scope, props: [] })).toHaveLength(0);
  });
});

describe("startGalleryWarm", () => {
  it("tallies rendered / skipped / failed by result shape", async () => {
    const sequences = [seq({ word: "A" }), seq({ word: "B" }), seq({ word: "C" })];
    // fresh render for A, cache hit for B, failure for C — across all combos.
    const { orchestrator } = fakeOrchestrator((_input, s) => {
      if (s.word === "A") return okResult(false);
      if (s.word === "B") return okResult(true);
      return nullResult();
    });
    const single: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };

    const handle = startGalleryWarm(single, () => {}, {
      orchestrator,
      loader: loaderOf(sequences),
      concurrency: 2,
    });
    const final = await handle.promise;

    expect(final.total).toBe(3);
    expect(final.done).toBe(3);
    expect(final.rendered).toBe(1);
    expect(final.skipped).toBe(1);
    expect(final.failed).toBe(1);
    expect(final.failedCombinations).toEqual(["C [C] (staff, dark)"]);
    expect(final.finished).toBe(true);
    expect(final.cancelled).toBe(false);
  });

  it("counts a thrown getThumbnail as failed, not a crash", async () => {
    const { orchestrator, getThumbnail } = fakeOrchestrator(() => okResult(false));
    getThumbnail.mockRejectedValueOnce(new Error("boom"));

    const single: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };
    const handle = startGalleryWarm(single, () => {}, {
      orchestrator,
      loader: loaderOf([seq({ word: "A" }), seq({ word: "B" })]),
      concurrency: 1,
    });
    const final = await handle.promise;

    expect(final.failed).toBe(1);
    expect(final.failedCombinations).toEqual(["A [A] (staff, dark)"]);
    expect(final.rendered).toBe(1);
    expect(final.done).toBe(2);
  });

  it("distinguishes same-word failure identities by public sequence ID", async () => {
    const { orchestrator } = fakeOrchestrator(() => nullResult());
    const single: WarmScope = {
      props: [PropType.FAN],
      modes: ["dark"],
      qr: [false],
    };
    const handle = startGalleryWarm(single, () => {}, {
      orchestrator,
      loader: loaderOf([
        seq({ id: "variant-1", word: "AB" }),
        seq({ id: "variant-2", word: "AB" }),
      ]),
      concurrency: 1,
    });

    const final = await handle.promise;

    expect(final.failedCombinations).toEqual([
      "AB [variant-1] (fan, dark)",
      "AB [variant-2] (fan, dark)",
    ]);
  });

  it("builds a usesDefaults input: gallery variant, row layout, mandala on, QR per combo", async () => {
    const inputs: Array<Record<string, unknown>> = [];
    const { orchestrator } = fakeOrchestrator((input) => {
      inputs.push(input as Record<string, unknown>);
      return okResult(false);
    });
    const s: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false, true] };
    const handle = startGalleryWarm(s, () => {}, {
      orchestrator,
      loader: loaderOf([seq({ word: "AB", steps: [{} as never, {} as never] })]),
      concurrency: 1,
    });
    await handle.promise;

    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.variant).toBe("gallery");
      expect(input.startPlacementLayout).toBe("row");
      expect(input.leftPropType).toBe(PropType.STAFF);
      expect((input.visibility as { showMandala: boolean }).showMandala).toBe(true);
    }
    const qrFlags = inputs.map((i) => (i.visibility as { showQRCode: boolean }).showQRCode);
    expect(qrFlags).toContain(true);
    expect(qrFlags).toContain(false);
  });

  it("includes extraSequences (canonical pool) and dedupes by id against the loader", async () => {
    const warmedIds: string[] = [];
    const { orchestrator } = fakeOrchestrator((_input, s) => {
      warmedIds.push(s.id);
      return okResult(false);
    });
    const single: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };

    const handle = startGalleryWarm(single, () => {}, {
      orchestrator,
      loader: loaderOf([seq({ id: "pub-1", word: "A" }), seq({ id: "shared", word: "B" })]),
      extraSequences: async () => [
        seq({ id: "shared", word: "B" }), // already in the public index — warms once
        seq({ id: "tnd-split-same-aaaa__t_0-0", word: "AAAA" }),
        seq({ id: "tnd-split-same-aaaa__t_0-0p5", word: "AAAA" }),
      ],
      concurrency: 1,
    });
    const final = await handle.promise;

    expect(final.total).toBe(4);
    expect(warmedIds.sort()).toEqual([
      "pub-1",
      "shared",
      "tnd-split-same-aaaa__t_0-0",
      "tnd-split-same-aaaa__t_0-0p5",
    ]);
  });

  it("stops early and reports cancelled when cancel() is called", async () => {
    let calls = 0;
    // Slow responses so cancel lands mid-run.
    const { orchestrator } = fakeOrchestrator(() => {
      calls++;
      return okResult(false);
    });
    const many = Array.from({ length: 50 }, (_, i) => seq({ word: `S${i}` }));
    const single: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };

    const handle = startGalleryWarm(single, () => {}, {
      orchestrator,
      loader: loaderOf(many),
      concurrency: 1,
    });
    handle.cancel();
    const final = await handle.promise;

    expect(final.cancelled).toBe(true);
    expect(final.finished).toBe(true);
    expect(calls).toBeLessThan(50); // did not process the whole list
  });

  it("never exceeds the concurrency cap in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const getThumbnail = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return okResult(false);
    });
    const single: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };
    const handle = startGalleryWarm(single, () => {}, {
      orchestrator: { getThumbnail } as never,
      loader: loaderOf(Array.from({ length: 20 }, (_, i) => seq({ word: `S${i}` }))),
      concurrency: 3,
    });
    await handle.promise;

    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("upload settling", () => {
  const oneCombo: WarmScope = { props: [PropType.STAFF], modes: ["dark"], qr: [false] };

  it("does not report finished until the orchestrator's uploads have settled", async () => {
    let releaseUploads = () => {};
    const settled = new Promise<void>((resolve) => {
      releaseUploads = resolve;
    });
    const getThumbnail = vi.fn(async () => okResult(false));
    const settleUploads = vi.fn(() => settled);

    const seen: boolean[] = [];
    const handle = startGalleryWarm(
      oneCombo,
      (p) => seen.push(p.finished),
      {
        orchestrator: { getThumbnail, settleUploads } as never,
        loader: loaderOf([seq({ word: "A" })]),
      }
    );

    // Every render has resolved, but the uploads have not.
    await vi.waitFor(() => expect(settleUploads).toHaveBeenCalled());
    expect(seen.some(Boolean)).toBe(false);

    releaseUploads();
    const final = await handle.promise;
    expect(final.finished).toBe(true);
    expect(final.uploading).toBe(false);
    expect(final.rendered).toBe(1);
  });

  it("reports the draining state while uploads are in flight", async () => {
    let releaseUploads = () => {};
    const settled = new Promise<void>((resolve) => {
      releaseUploads = resolve;
    });
    const uploadingStates: boolean[] = [];
    const handle = startGalleryWarm(
      oneCombo,
      (p) => uploadingStates.push(p.uploading),
      {
        orchestrator: {
          getThumbnail: vi.fn(async () => okResult(false)),
          settleUploads: vi.fn(() => settled),
        } as never,
        loader: loaderOf([seq({ word: "A" })]),
      }
    );

    await vi.waitFor(() => expect(uploadingStates.some(Boolean)).toBe(true));
    releaseUploads();
    await handle.promise;
  });

  it("still finishes when the orchestrator has no settle point", async () => {
    // Legacy/stubbed orchestrators predate settleUploads; a missing settle
    // point must not strand the run.
    const handle = startGalleryWarm(oneCombo, () => {}, {
      orchestrator: { getThumbnail: vi.fn(async () => okResult(false)) } as never,
      loader: loaderOf([seq({ word: "A" })]),
    });
    const final = await handle.promise;
    expect(final.finished).toBe(true);
    expect(final.rendered).toBe(1);
  });
});

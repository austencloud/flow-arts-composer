/**
 * Audit evidence: what a fast scroll costs the render queue.
 *
 * A gallery card aborts its thumbnail request the moment the
 * IntersectionObserver reports it off-screen (PropAwareThumbnail.svelte:226-232)
 * and re-requests it on re-entry. Two consequences are measured here, and BOTH
 * are still present on this branch:
 *
 *  1. ThumbnailRenderer never re-checks its signal between stages, so a
 *     cancelled render keeps running until `sequence_load` and LOOP detection
 *     finish. The renderer is outside this task's ownership; see the report's
 *     recommendation to add three stage guards.
 *  2. Because the work has not settled, it keeps its queue slot — so cancelled
 *     renders can delay the cards the user is actually looking at.
 *
 * The third consequence this suite originally recorded — a returning card
 * deduplicating onto the dying render and inheriting its AbortError or its 15s
 * deadline — is FIXED on this branch by per-task identity in
 * ThumbnailRenderQueue. Its regression coverage lives with the fix, in
 * tests/unit/browse/thumbnail-queue-task-identity.test.ts, so this file no
 * longer asserts that behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderer } from "$lib/shared/browse/services/thumbnail-renderer";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: vi.fn(),
  invalidateUrl: vi.fn(),
  markMissing: vi.fn(),
}));

/** A metadata-only gallery card: `steps` is empty, so the renderer must load
 *  the full document before it can compose (the production Browse shape). */
const metadataOnly = (id: string): SequenceData =>
  ({ id, word: id, steps: [], sequenceLength: 8 }) as unknown as SequenceData;

const loadedDocument = (id: string): SequenceData =>
  ({
    id,
    word: id,
    // Two steps: enough for the renderer to run LOOP detection, which is the
    // main-thread work a cancelled render should no longer be paying for.
    steps: [
      { id: `${id}-1`, motions: {} },
      { id: `${id}-2`, motions: {} },
    ],
  }) as unknown as SequenceData;

const input = (id: string): ThumbnailRenderInput => ({
  sequenceName: id,
  sequenceId: id,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
  startPositionLayout: "row",
  visibility: { showQRCode: false, showMandala: true },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Drain pending microtasks without advancing any clock. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cancelled renders keep working", () => {
  it("DEFECT: an aborted render still completes its Firestore load and LOOP detection", async () => {
    const gate = deferred<SequenceData>();
    const loadFullSequenceData = vi.fn(() => gate.promise);
    const detectLOOPType = vi.fn(() => ({ loopType: null }));
    // Mirrors CompositionDispatcher.compose()'s entry guard
    // (composition-dispatcher.ts:339) — the ONLY place the render observes the
    // queue signal before work starts.
    const compose = vi.fn(
      async (_s: unknown, _o: unknown, _p: unknown, signal?: AbortSignal) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return new Blob(["rendered"], { type: "image/webp" });
      }
    );

    const renderer = new ThumbnailRenderer(
      { compose } as never,
      { deriveFromFirstStep: vi.fn() } as never,
      { loadFullSequenceData } as never,
      { detectLOOPType } as never
    );

    const controller = new AbortController();
    let settled = false;
    const render = renderer
      .render(
        metadataOnly("AB"),
        input("AB"),
        undefined,
        undefined,
        controller.signal
      )
      .catch((error: Error) => {
        settled = true;
        return error;
      });

    await flush();
    expect(loadFullSequenceData).toHaveBeenCalledOnce();

    // The card leaves the viewport here.
    controller.abort();
    await flush();

    // DEFECT: the render has not settled — it is still awaiting the document
    // read it no longer needs. Should settle promptly once the renderer checks
    // its signal between stages.
    expect(settled).toBe(false);

    gate.resolve(loadedDocument("AB"));
    await flush();

    // DEFECT: LOOP detection ran after the cancellation, on the main thread.
    expect(detectLOOPType).toHaveBeenCalledOnce();
    expect(((await render) as Error).name).toBe("AbortError");
    expect(settled).toBe(true);
  });

  it("DEFECT: three cancelled renders hold every queue slot away from a visible card", async () => {
    const { ThumbnailRenderQueue } =
      await import("$lib/shared/browse/services/thumbnail-render-queue");
    const queue = new ThumbnailRenderQueue();
    const gates = new Map<string, ReturnType<typeof deferred<SequenceData>>>();
    const started: string[] = [];

    const renderer = new ThumbnailRenderer(
      {
        compose: async (
          _s: unknown,
          _o: unknown,
          _p: unknown,
          signal?: AbortSignal
        ) => {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          return new Blob(["rendered"], { type: "image/webp" });
        },
      } as never,
      { deriveFromFirstStep: vi.fn() } as never,
      {
        loadFullSequenceData: (name: string) => {
          started.push(name);
          const gate = deferred<SequenceData>();
          gates.set(name, gate);
          return gate.promise;
        },
      } as never,
      { detectLOOPType: () => ({ loopType: null }) } as never
    );

    const enqueue = (id: string) =>
      queue
        .enqueue(id, (signal) =>
          renderer.render(
            metadataOnly(id),
            input(id),
            undefined,
            undefined,
            signal
          )
        )
        .catch(() => "cancelled");

    // Three cards scroll into view, then straight out again.
    const scrolledPast = ["A", "B", "C"].map(enqueue);
    await flush();
    expect(started).toEqual(["A", "B", "C"]);
    for (const id of ["A", "B", "C"]) queue.cancel(id);
    await flush();

    // The card the user is now looking at.
    const visible = enqueue("VISIBLE");
    await flush();

    // DEFECT: all three slots are still accounted active by cancelled work, so
    // the visible card has not started.
    expect(queue.getStats().active).toBe(3);
    expect(started).not.toContain("VISIBLE");

    // Only when the abandoned document reads land does the visible card start.
    for (const id of ["A", "B", "C"])
      gates.get(id)!.resolve(loadedDocument(id));
    await flush();
    expect(started).toContain("VISIBLE");

    gates.get("VISIBLE")!.resolve(loadedDocument("VISIBLE"));
    await Promise.all([...scrolledPast, visible]);
  });
});

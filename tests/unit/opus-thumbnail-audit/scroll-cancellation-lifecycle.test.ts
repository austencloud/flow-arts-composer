/**
 * Audit repro: what a fast scroll costs, and what it strands.
 *
 * A gallery card aborts its thumbnail request the moment the
 * IntersectionObserver reports it off-screen (PropAwareThumbnail.svelte:226-232)
 * and re-requests it on re-entry. This file measures the three consequences with
 * the real queue, the real orchestrator, and the real ThumbnailRenderer:
 *
 *  1. the renderer never re-checks its signal between stages, so a cancelled
 *     render keeps running (and keeps its queue slot) until `sequence_load` and
 *     LOOP detection finish;
 *  2. because the slot is held, cancelled renders can starve the cards the user
 *     is actually looking at;
 *  3. a card that returns before the zombie settles deduplicates onto it and is
 *     rejected with AbortError even though its own request was never cancelled —
 *     which leaves the live card with no URL, no error state, and no retry.
 *
 * DEFECT assertions encode today's behavior on `main`.
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

describe("a card that scrolls back before the zombie settles", () => {
  /** Real orchestrator + real queue + real renderer, with only the composition
   *  dispatcher and the document loader stubbed. Returns the loader gates so a
   *  test can decide when (or whether) the abandoned read lands. */
  async function createStack() {
    const [{ ThumbnailRenderOrchestrator }, { ThumbnailRenderQueue }] =
      await Promise.all([
        import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
        import("$lib/shared/browse/services/thumbnail-render-queue"),
      ]);

    const gates: Array<ReturnType<typeof deferred<SequenceData>>> = [];
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
        loadFullSequenceData: () => {
          const gate = deferred<SequenceData>();
          gates.push(gate);
          return gate.promise;
        },
      } as never,
      { detectLOOPType: () => ({ loopType: null }) } as never
    );

    const orchestrator = new ThumbnailRenderOrchestrator(
      new ThumbnailRenderQueue(),
      renderer,
      { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never
    );
    return { orchestrator, gates };
  }

  it("DEFECT: the returning card inherits the cancellation instead of rendering", async () => {
    const { orchestrator, gates } = await createStack();

    // First mount: visible, render starts, document read in flight.
    const firstMount = new AbortController();
    const first = orchestrator
      .getThumbnail({
        sequence: metadataOnly("AB"),
        input: input("AB"),
        signal: firstMount.signal,
      })
      .catch((error: Error) => error);
    await flush();
    expect(gates).toHaveLength(1);

    // Scrolled out: the observer aborts this caller, the queue aborts the
    // shared render, and the render cannot exit until its read resolves.
    firstMount.abort();
    await flush();
    expect(((await first) as Error).name).toBe("AbortError");

    // Scrolled back in: a brand new request with its own, never-aborted signal.
    const secondMount = new AbortController();
    const second = orchestrator
      .getThumbnail({
        sequence: metadataOnly("AB"),
        input: input("AB"),
        signal: secondMount.signal,
      })
      .catch((error: Error) => error);
    await flush();

    // DEFECT: no new render was started. ThumbnailRenderQueue only drops
    // `pendingPromises` when the core task settles (never at cancel time), so
    // the retry deduplicated onto the dying render.
    expect(gates).toHaveLength(1);

    // The abandoned read lands; the zombie exits through the dispatcher's
    // abort guard and takes the live request down with it.
    gates[0]!.resolve(loadedDocument("AB"));
    const outcome = await second;

    expect(secondMount.signal.aborted).toBe(false);
    expect((outcome as Error).name).toBe("AbortError");
    // PropAwareThumbnail treats a cancellation as "not my problem": no URL, no
    // error placeholder, and currentKeyHash still equals this key, so the
    // $effect will not re-request. The card is stranded on the loading
    // placeholder for the rest of the session.
  });

  it("DEFECT: if the abandoned read stalls, the returning card waits out the full 15s deadline", async () => {
    vi.useFakeTimers();
    try {
      const { orchestrator, gates } = await createStack();
      const tick = () => vi.advanceTimersByTimeAsync(0);

      const firstMount = new AbortController();
      const first = orchestrator
        .getThumbnail({
          sequence: metadataOnly("AB"),
          input: input("AB"),
          signal: firstMount.signal,
        })
        .catch((error: Error) => error);
      await tick();
      firstMount.abort();
      await tick();
      await first;

      const second = orchestrator.getThumbnail({
        sequence: metadataOnly("AB"),
        input: input("AB"),
      });
      await tick();
      expect(gates).toHaveLength(1);

      // 14.9s in: still nothing, because the only progress signal belongs to a
      // render that was cancelled before this card ever asked.
      await vi.advanceTimersByTimeAsync(14_900);
      let settled = false;
      void second.then(() => {
        settled = true;
      });
      await tick();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      const result = await second;

      // DEFECT: a fresh request pays the inactivity deadline of a stalled
      // render it inherited, then surfaces the error placeholder.
      expect(result.url).toBeNull();
      expect(result.error?.name).toBe("ThumbnailRenderTimeoutError");
      expect(gates).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("CONTROL: once the zombie has settled, the same key renders normally", async () => {
    const { orchestrator, gates } = await createStack();

    const firstMount = new AbortController();
    const first = orchestrator
      .getThumbnail({
        sequence: metadataOnly("AB"),
        input: input("AB"),
        signal: firstMount.signal,
      })
      .catch((error: Error) => error);
    await flush();
    firstMount.abort();
    await flush();
    // Let the abandoned read land BEFORE the card returns.
    gates[0]!.resolve(loadedDocument("AB"));
    await first;
    await flush();

    const retry = orchestrator.getThumbnail({
      sequence: metadataOnly("AB"),
      input: input("AB"),
    });
    await flush();
    expect(gates).toHaveLength(2);
    gates[1]!.resolve(loadedDocument("AB"));

    const result = await retry;
    expect(result.url).toBe("blob:rendered");
    expect(result.error).toBeUndefined();
  });
});

/**
 * Queue bookkeeping is per-TASK, not per-ID.
 *
 * A gallery card aborts its request when the IntersectionObserver reports it
 * off-screen and re-requests on re-entry. The abandoned render cannot always
 * exit immediately (ThumbnailRenderer awaits its document read before it can
 * observe the signal), so a returning card used to deduplicate onto the dying
 * render and inherit its outcome: an AbortError the component treats as "not
 * mine" (no URL, no error placeholder, no retry), or — if the abandoned read
 * stalled — that render's full 15s inactivity deadline.
 *
 * The queue now releases the ID when it cancels a task, so a retry starts a
 * fresh render. That is only safe because slot bookkeeping is keyed by a
 * per-task token: an ID-keyed map would let the cancelled task's cleanup delete
 * the retry's controller, its active slot, and its consumer count. These tests
 * pin both halves — the release AND the ownership it must not break.
 */

import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderQueue } from "$lib/shared/browse/services/thumbnail-render-queue";
import { ThumbnailRenderOrchestrator } from "$lib/shared/browse/services/thumbnail-render-orchestrator";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("cancelled task identity", () => {
  it("releases the ID so a retry renders instead of adopting the dying task", async () => {
    const queue = new ThumbnailRenderQueue();
    const gates: Array<ReturnType<typeof deferred<string>>> = [];
    const run = (id: string) => {
      const gate = deferred<string>();
      gates.push(gate);
      return queue
        .enqueue(id, () => gate.promise)
        .catch((error: Error) => error.name);
    };

    const first = run("card");
    await flush();
    expect(gates).toHaveLength(1);

    // The card leaves the viewport. The work does not settle: its document read
    // is still in flight.
    queue.cancel("card");
    await flush();

    // The card comes back.
    const retry = run("card");
    await flush();

    // A second task really started, with its own work.
    expect(gates).toHaveLength(2);

    gates[1]!.resolve("fresh render");
    expect(await retry).toBe("fresh render");

    // The abandoned task settles late and harmlessly.
    gates[0]!.resolve("abandoned");
    await first;
  });

  it("keeps the retry's slot, controller and consumer count when the abandoned task settles", async () => {
    const queue = new ThumbnailRenderQueue();
    const signals: AbortSignal[] = [];
    const gates: Array<ReturnType<typeof deferred<string>>> = [];
    const run = (id: string) => {
      const gate = deferred<string>();
      gates.push(gate);
      return queue
        .enqueue(id, (signal) => {
          signals.push(signal);
          return gate.promise;
        })
        .catch((error: Error) => error.name);
    };

    // The abandoned task ignores its signal — the real renderer's shape, since
    // it cannot observe an abort until its document read resolves.
    const first = run("card");
    await flush();
    queue.cancel("card");
    await flush();

    // The retry is abort-aware, like the composition dispatcher's guard.
    const retryGate = deferred<string>();
    const retry = queue
      .enqueue("card", (signal) => {
        signals.push(signal);
        signal.addEventListener("abort", () =>
          retryGate.reject(new DOMException("Aborted", "AbortError"))
        );
        return retryGate.promise;
      })
      .catch((error: Error) => error.name);
    await flush();
    expect(signals).toHaveLength(2);

    // The abandoned task finally settles. Its cleanup must remove only its own
    // bookkeeping.
    gates[0]!.resolve("abandoned");
    await first;
    await flush();

    expect(queue.getStats().active).toBe(1);
    expect(queue.getStats().activeIds).toEqual(["card"]);

    // Ownership check: cancelling the ID must reach the LIVE task, not a
    // forgotten one.
    expect(signals[1]!.aborted).toBe(false);
    queue.cancel("card");
    expect(signals[1]!.aborted).toBe(true);
    expect(await retry).toBe("AbortError");

    // Its slot is released by its own settlement, not by the older task's.
    await flush();
    expect(queue.getStats().active).toBe(0);
  });

  it("does not make the retry wait out the abandoned task's inactivity deadline", async () => {
    vi.useFakeTimers();
    try {
      const queue = new ThumbnailRenderQueue();
      const gates: Array<ReturnType<typeof deferred<string>>> = [];
      const run = (id: string) => {
        const gate = deferred<string>();
        gates.push(gate);
        return queue
          .enqueue(id, () => gate.promise)
          .catch((error: Error) => error.name);
      };
      const tick = () => vi.advanceTimersByTimeAsync(0);

      const stalled = run("card");
      await tick();
      queue.cancel("card");
      await tick();

      const retry = run("card");
      await tick();
      expect(gates).toHaveLength(2);

      // The retry finishes on its own schedule, long before the 15s deadline
      // the stalled task is still counting down.
      await vi.advanceTimersByTimeAsync(500);
      gates[1]!.resolve("fresh render");
      expect(await retry).toBe("fresh render");

      // The stalled task times out later, alone.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await stalled).toBe("ThumbnailRenderTimeoutError");
    } finally {
      vi.useRealTimers();
    }
  });

  it("CONTROL: two consumers of one live task still share a single render", async () => {
    const queue = new ThumbnailRenderQueue();
    const execute = vi.fn(async () => "shared");
    const a = new AbortController();

    const first = queue.enqueue("card", execute, { consumerSignal: a.signal });
    const second = queue.enqueue("card", execute);

    expect(execute).toHaveBeenCalledOnce();
    expect(await first).toBe("shared");
    expect(await second).toBe("shared");
  });

  it("CONTROL: one consumer leaving does not cancel a render another card needs", async () => {
    const queue = new ThumbnailRenderQueue();
    const gate = deferred<string>();
    const signals: AbortSignal[] = [];
    const leaving = new AbortController();

    const abandoned = queue
      .enqueue(
        "card",
        (signal) => {
          signals.push(signal);
          return gate.promise;
        },
        { consumerSignal: leaving.signal }
      )
      .catch((error: Error) => error.name);
    const surviving = queue.enqueue("card", () => gate.promise);
    await flush();

    leaving.abort();
    expect(await abandoned).toBe("AbortError");
    expect(signals[0]!.aborted).toBe(false);

    gate.resolve("shared");
    expect(await surviving).toBe("shared");
  });
});

describe("a card that returns mid-render", () => {
  const metadataOnly = (id: string): SequenceData =>
    ({ id, word: id, steps: [], sequenceLength: 8 }) as unknown as SequenceData;

  const loadedDocument = (id: string): SequenceData =>
    ({
      id,
      word: id,
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

  /** Real orchestrator, queue and renderer. Stubbed: the composition dispatcher
   *  (with the abort guard it really implements) and the document loader. */
  function createStack() {
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

  it("renders its own thumbnail instead of inheriting the cancelled request", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })
      )
    );
    try {
      const { orchestrator, gates } = createStack();

      // Visible: the render starts and waits on its document read.
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

      // Scrolled out: the IntersectionObserver path aborts this caller.
      firstMount.abort();
      await flush();
      expect(((await first) as Error).name).toBe("AbortError");

      // Scrolled back in before the abandoned read resolves.
      const secondMount = new AbortController();
      const second = orchestrator.getThumbnail({
        sequence: metadataOnly("AB"),
        input: input("AB"),
        signal: secondMount.signal,
      });
      await flush();

      // A second render really started for the returning card...
      expect(gates).toHaveLength(2);
      gates[1]!.resolve(loadedDocument("AB"));
      const result = await second;

      // ...and it produced a thumbnail rather than the abandoned request's
      // AbortError, which PropAwareThumbnail would have swallowed silently.
      expect(result.url).toBe("blob:rendered");
      expect(result.error).toBeUndefined();

      // The abandoned read lands afterwards and changes nothing.
      gates[0]!.resolve(loadedDocument("AB"));
      await flush();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});

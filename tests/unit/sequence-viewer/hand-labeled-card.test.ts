import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createHandLabeledCardHarness } from "./hand-labeled-card-harness.svelte";

function makeSequence(id: string): SequenceData {
  return { id, name: id, word: "AB", steps: [] } as unknown as SequenceData;
}

/** Let the helper's then/finally chain drain, then flush Svelte. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("hand labeled card", () => {
  it("gives the source and a null labeling when there is no labeling", () => {
    const source = makeSequence("s");
    const resolveFn = vi.fn();
    const harness = createHandLabeledCardHarness(source, null, resolveFn);
    flushSync();

    expect(harness.card.sequence).toBe(source);
    expect(harness.card.labeling).toBeNull();
    expect(harness.card.pending).toBe(false);
    expect(resolveFn).not.toHaveBeenCalled();
    harness.dispose();
  });

  it("draws the resolved sequence and matching labeling once the resolve lands", async () => {
    const source = makeSequence("s");
    const mirrored = makeSequence("mirrored");
    const work = deferred<SequenceData>();
    const resolveFn = vi.fn(() => work.promise);
    const harness = createHandLabeledCardHarness(
      source,
      "mirror-me",
      resolveFn
    );
    flushSync();

    expect(harness.card.sequence).toBe(source);
    expect(harness.card.labeling).toBeNull();
    expect(harness.card.pending).toBe(true);

    work.resolve(mirrored);
    await work.promise;
    await settle();

    expect(harness.card.sequence).toBe(mirrored);
    expect(harness.card.labeling).toBe("mirror-me");
    expect(harness.card.pending).toBe(false);
    // A settled pair must not re-run the effect and resolve again.
    await settle();
    expect(resolveFn).toHaveBeenCalledTimes(1);
    harness.dispose();
  });

  it("keeps the previous pair on a labeling flip until the new resolve lands", async () => {
    const source = makeSequence("s");
    const mirrored = makeSequence("mirrored");
    const asPerformed = makeSequence("as-performed");
    const first = deferred<SequenceData>();
    const second = deferred<SequenceData>();
    const resolveFn = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const harness = createHandLabeledCardHarness(
      source,
      "mirror-me",
      resolveFn
    );
    flushSync();

    first.resolve(mirrored);
    await first.promise;
    await settle();
    expect(harness.card.sequence).toBe(mirrored);
    expect(harness.card.labeling).toBe("mirror-me");

    harness.setLabeling("as-performed");
    flushSync();

    // Same source, so the old pair is held: no blank flash, and the legend
    // still describes the geometry on screen.
    expect(harness.card.sequence).toBe(mirrored);
    expect(harness.card.labeling).toBe("mirror-me");
    expect(harness.card.pending).toBe(true);

    second.resolve(asPerformed);
    await second.promise;
    await settle();

    expect(harness.card.sequence).toBe(asPerformed);
    expect(harness.card.labeling).toBe("as-performed");
    expect(resolveFn).toHaveBeenCalledTimes(2);
    harness.dispose();
  });

  it("settles pending after a failed resolve and retries on the next request", async () => {
    const source = makeSequence("s");
    const asPerformed = makeSequence("as-performed");
    const second = deferred<SequenceData>();
    const resolveFn = vi
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error("mirror failed")))
      .mockReturnValueOnce(second.promise);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const harness = createHandLabeledCardHarness(
      source,
      "mirror-me",
      resolveFn
    );
    flushSync();
    await settle();

    // A rejected request must not leave the control that asked disabled.
    expect(harness.card.pending).toBe(false);
    expect(harness.card.sequence).toBe(source);
    expect(harness.card.labeling).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);

    harness.setLabeling("as-performed");
    flushSync();
    expect(harness.card.pending).toBe(true);
    second.resolve(asPerformed);
    await second.promise;
    await settle();

    expect(harness.card.sequence).toBe(asPerformed);
    expect(harness.card.labeling).toBe("as-performed");
    expect(harness.card.pending).toBe(false);
    expect(resolveFn).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
    harness.dispose();
  });

  it("clears the pair immediately on a source change", async () => {
    const sourceA = makeSequence("a");
    const sourceB = makeSequence("b");
    const mirroredA = makeSequence("mirrored-a");
    const workA = deferred<SequenceData>();
    const workB = deferred<SequenceData>();
    const resolveFn = vi
      .fn()
      .mockReturnValueOnce(workA.promise)
      .mockReturnValueOnce(workB.promise);
    const harness = createHandLabeledCardHarness(
      sourceA,
      "mirror-me",
      resolveFn
    );
    flushSync();

    workA.resolve(mirroredA);
    await workA.promise;
    await settle();
    expect(harness.card.sequence).toBe(mirroredA);

    harness.setSource(sourceB);
    flushSync();

    // The held pair came from sourceA and must not survive a source change.
    expect(harness.card.sequence).toBe(sourceB);
    expect(harness.card.labeling).toBeNull();
    workB.resolve(makeSequence("mirrored-b"));
    await workB.promise;
    await settle();
    expect(harness.card.labeling).toBe("mirror-me");
    expect(resolveFn).toHaveBeenCalledTimes(2);
    harness.dispose();
  });
});

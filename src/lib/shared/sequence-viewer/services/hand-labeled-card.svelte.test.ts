import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import {
  createHandLabeledCard,
  type HandLabeledCard,
} from "./hand-labeled-card.svelte";

function makeSequence(id: string): SequenceData {
  return {
    id,
    name: id,
    word: "AB",
    steps: [],
    thumbnails: [],
  } as unknown as SequenceData;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
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
    let card!: HandLabeledCard;
    const cleanup = $effect.root(() => {
      card = createHandLabeledCard(
        { getSequence: () => source, getLabeling: () => null },
        resolveFn
      );
    });
    flushSync();

    expect(card.sequence).toBe(source);
    expect(card.labeling).toBeNull();
    expect(card.pending).toBe(false);
    expect(resolveFn).not.toHaveBeenCalled();
    cleanup();
  });

  it("draws the resolved sequence and matching labeling once the resolve lands", async () => {
    const source = makeSequence("s");
    const mirrored = makeSequence("mirrored");
    const work = deferred<SequenceData>();
    const resolveFn = vi.fn(() => work.promise);
    let card!: HandLabeledCard;
    const cleanup = $effect.root(() => {
      card = createHandLabeledCard(
        {
          getSequence: () => source,
          getLabeling: () => "mirror-me" as HandLabeling,
        },
        resolveFn
      );
    });
    flushSync();

    // Still the source, pending, no legend - the resolve has not landed yet.
    expect(card.sequence).toBe(source);
    expect(card.labeling).toBeNull();
    expect(card.pending).toBe(true);

    work.resolve(mirrored);
    await work.promise;
    flushSync();

    expect(card.sequence).toBe(mirrored);
    expect(card.labeling).toBe("mirror-me");
    expect(card.pending).toBe(false);
    cleanup();
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

    let labeling = $state<HandLabeling | null>("mirror-me");
    let card!: HandLabeledCard;
    const cleanup = $effect.root(() => {
      card = createHandLabeledCard(
        { getSequence: () => source, getLabeling: () => labeling },
        resolveFn
      );
    });
    flushSync();

    first.resolve(mirrored);
    await first.promise;
    flushSync();
    expect(card.sequence).toBe(mirrored);
    expect(card.labeling).toBe("mirror-me");

    labeling = "as-performed";
    flushSync();

    // Old pair held - same source, so no blank flash - even though the
    // requested labeling has already changed.
    expect(card.sequence).toBe(mirrored);
    expect(card.labeling).toBe("mirror-me");
    expect(card.pending).toBe(true);

    second.resolve(asPerformed);
    await second.promise;
    flushSync();

    expect(card.sequence).toBe(asPerformed);
    expect(card.labeling).toBe("as-performed");
    cleanup();
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

    let source = $state(sourceA);
    let card!: HandLabeledCard;
    const cleanup = $effect.root(() => {
      card = createHandLabeledCard(
        {
          getSequence: () => source,
          getLabeling: () => "mirror-me" as HandLabeling,
        },
        resolveFn
      );
    });
    flushSync();

    workA.resolve(mirroredA);
    await workA.promise;
    flushSync();
    expect(card.sequence).toBe(mirroredA);
    expect(card.labeling).toBe("mirror-me");

    source = sourceB;
    flushSync();

    // The held pair was derived from sourceA - it must not survive a source
    // change even though the labeling request did not change.
    expect(card.sequence).toBe(sourceB);
    expect(card.labeling).toBeNull();
    cleanup();
  });
});

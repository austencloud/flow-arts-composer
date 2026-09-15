import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createHandLabeledSequenceResolver } from "./hand-labeled-sequence";

function makeSequence(id: string): SequenceData {
  return {
    id,
    name: id,
    word: "AB",
    steps: [],
    thumbnails: [],
  } as unknown as SequenceData;
}

describe("hand labeled sequence", () => {
  it("returns the input untouched for as-performed", async () => {
    const mirror = vi.fn();
    const swap = vi.fn();
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const source = makeSequence("s");
    expect(await resolve(source, "as-performed")).toBe(source);
    expect(mirror).not.toHaveBeenCalled();
    expect(swap).not.toHaveBeenCalled();
  });

  it("mirrors then swaps for mirror-me", async () => {
    const mirrored = makeSequence("mirrored");
    const swapped = makeSequence("swapped");
    const mirror = vi.fn(async () => mirrored);
    const swap = vi.fn(() => swapped);
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const source = makeSequence("s");
    expect(await resolve(source, "mirror-me")).toBe(swapped);
    expect(mirror).toHaveBeenCalledWith(source);
    expect(swap).toHaveBeenCalledWith(mirrored);
  });

  it("computes once per source object and again for a new object", async () => {
    const mirror = vi.fn(async (s: SequenceData) => makeSequence(`m:${s.id}`));
    const swap = vi.fn((s: SequenceData) => makeSequence(`w:${s.id}`));
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const a = makeSequence("a");
    const first = await resolve(a, "mirror-me");
    const second = await resolve(a, "mirror-me");
    expect(second).toBe(first);
    expect(mirror).toHaveBeenCalledTimes(1);

    const b = makeSequence("a"); // same id, different object
    await resolve(b, "mirror-me");
    expect(mirror).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed mirror, so a retry tries again", async () => {
    const mirrored = makeSequence("mirrored");
    const swapped = makeSequence("swapped");
    const mirror = vi
      .fn()
      .mockRejectedValueOnce(new Error("no data"))
      .mockResolvedValue(mirrored);
    const swap = vi.fn(() => swapped);
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const source = makeSequence("s");

    await expect(resolve(source, "mirror-me")).rejects.toThrow("no data");

    expect(await resolve(source, "mirror-me")).toBe(swapped);
    expect(mirror).toHaveBeenCalledTimes(2);
  });
});

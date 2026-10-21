import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { applyFilter } from "../browse-filter";
import { resolveMandalaSignature } from "../sequence-density";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";

function sequence(id: string, word: string): SequenceData {
  return { id, name: id, word, steps: [] } as unknown as SequenceData;
}

describe("applyFilter STARTING_LETTER with skew braces", () => {
  it("matches a braced dash-variant word under its dash filter, not the bare letter", () => {
    const skewed = sequence("skewed", "{W-AB}");
    const bare = sequence("bare", "W-AB");

    expect(applyFilter([skewed, bare], BrowseFilterType.STARTING_LETTER, "W-").map((s) => s.id)).toEqual([
      "skewed",
      "bare",
    ]);
    expect(applyFilter([skewed, bare], BrowseFilterType.STARTING_LETTER, "W").map((s) => s.id)).toEqual([]);
  });

  it("places a braced word into its letter range by the stripped first letter", () => {
    const skewed = sequence("skewed", "{STS}");
    const outOfRange = sequence("out-of-range", "{ABC}");

    const result = applyFilter(
      [skewed, outOfRange],
      BrowseFilterType.STARTING_LETTER,
      "Q-T"
    ).map((s) => s.id);
    expect(result).toEqual(["skewed"]);
  });
});

describe("filtering by mandala", () => {
  const CLOCKWISE = ["n", "e", "s", "w"] as const;
  function motion(motionType: "pro" | "anti", start: number) {
    return {
      motionType,
      rotationDirection: "cw",
      startLocation: CLOCKWISE[start % 4]!,
      endLocation: CLOCKWISE[(start + 1) % 4]!,
      turns: 0,
      startOrientation: "in",
      endOrientation: "in",
      isVisible: true,
    };
  }
  const steps = Array.from({ length: 4 }, (_, beat) => ({
    letter: "A",
    stepNumber: beat + 1,
    motions: { left: motion("anti", beat + 2), right: motion("pro", beat) },
  }));
  function drawn(id: string): SequenceData {
    return { ...sequence(id, "AAAA"), steps } as unknown as SequenceData;
  }

  it("matches the measured sequences that draw the key and skips unmeasured ones", () => {
    const measured = drawn("mandala-measured");
    const same = drawn("mandala-same");
    const unmeasured = drawn("mandala-unmeasured");
    const key = resolveMandalaSignature(measured).key;
    resolveMandalaSignature(same);

    expect(
      applyFilter([measured, same, unmeasured], BrowseFilterType.MANDALA, key).map((s) => s.id)
    ).toEqual(["mandala-measured", "mandala-same"]);
    expect(applyFilter([measured], BrowseFilterType.MANDALA, "")).toEqual([]);
    expect(applyFilter([measured], BrowseFilterType.MANDALA, "not-a-key")).toEqual([]);
  });
});

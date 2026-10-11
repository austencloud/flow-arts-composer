import { describe, it, expect } from "vitest";
import { tilePeriod } from "#lib/shared/create/domain/rhythm/rhythm-mask.js";
import { resolvePattern } from "#lib/features/choreo-card/domain/reversal-transform.js";

/**
 * Verifies the create-side reversal glue: a 2-lane boolean strip (left=blue,
 * right=red), tiled to the sequence length, resolves to the canonical reversal
 * pattern that choreo-card's transformSequence consumes.
 *
 * Symbol mapping (toSequenceString): both→P, red→R, blue→B, neither→-.
 * (blue = Left lane, red = Right lane.)
 */
describe("reversal strip → pattern", () => {
  const resolve = (left: boolean[], right: boolean[], len: number) =>
    resolvePattern(tilePeriod(left, len), tilePeriod(right, len));

  it("an Alternating strip tiles to RBRB / alternating", () => {
    // left=[F,T] right=[T,F] → beat0 right→R, beat1 left→B → RBRB
    const p = resolve([false, true], [true, false], 4);
    expect(p.sequence).toBe("RBRB");
    expect(p.id).toBe("alternating");
    expect(p.isNamed).toBe(true);
  });

  it("a both-hands strip tiles to PPPP / book", () => {
    const p = resolve([true], [true], 4);
    expect(p.sequence).toBe("PPPP");
    expect(p.id).toBe("book");
  });

  it("an all-off strip tiles to ---- / continuous", () => {
    const p = resolve([false], [false], 4);
    expect(p.sequence).toBe("----");
    expect(p.id).toBe("continuous");
  });

  it("a single-lane (red) strip tiles to RRRR / red-book", () => {
    const p = resolve([false], [true], 4);
    expect(p.sequence).toBe("RRRR");
    expect(p.id).toBe("red-book");
  });

  it("reports a clean loop only when each hand reverses an even number of times", () => {
    // RBRB: red reverses twice, blue twice → clean.
    expect(resolve([false, true], [true, false], 4).isCleanLoop).toBe(true);
    // PPP (3 beats both): each hand reverses 3 times → not clean.
    expect(resolve([true], [true], 3).isCleanLoop).toBe(false);
  });
});

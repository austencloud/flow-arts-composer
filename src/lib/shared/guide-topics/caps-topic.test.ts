/**
 * The cap record behind /guide/three-levels. The silent failures: the
 * checked-in cap table drifting from what the dataframe spells, a cap whose
 * hands do not close back where they started, a strip whose placements do not
 * chain, the Book spelling something other than DJ, or a VTG reading that
 * disagrees with the hand cycle.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  lookupLetter,
  parseCsvEdges,
} from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import type { PairLetterLookup } from "#lib/shared/foundation/services/solo-prop-pair-variations.js";
import {
  BOOK_LEFT_STEPS,
  BOOK_RIGHT_STEPS,
  BOOK_WORD,
  CAPS,
  bookStrip,
  capBeats,
  capCell,
  capGap,
  capHandSteps,
  capStrip,
  enumerateCaps,
  spellPair,
} from "./caps-topic";

const edges = parseCsvEdges(
  readFileSync(
    resolve(
      process.cwd(),
      "static/data/pictographs/DiamondPictographDataframe.csv"
    ),
    "utf8"
  )
);
const lookup: PairLetterLookup = (q) =>
  lookupLetter(edges, {
    startPlacement: q.startPlacement,
    endPlacement: q.endPlacement,
    left: q.left,
    right: q.right,
  });

describe("the cap table", () => {
  it("is every cap the dataframe spells under the cap rules", () => {
    const derived = enumerateCaps(lookup)
      .map((c) => c.word)
      .sort();
    expect(CAPS.map((c) => c.word).sort()).toEqual(derived);
    expect(CAPS).toHaveLength(20);
  });

  it("spells each cap's word from its own hands", () => {
    for (const cap of CAPS) {
      expect(
        spellPair(capHandSteps(cap.left), capHandSteps(cap.right), lookup)
      ).toBe(cap.word);
    }
  });

  it("brings both hands and both props back to where they started", () => {
    for (const cap of CAPS) {
      for (const hand of [cap.left, cap.right]) {
        const steps = capHandSteps(hand);
        expect(steps.at(-1)!.endLocation).toBe(steps[0]!.startLocation);
        expect(steps.at(-1)!.endOrientation).toBe(steps[0]!.startOrientation);
      }
    }
  });

  it("groups the caps by how far apart the hands run: 7 in step, 8 one beat, 5 two", () => {
    const count = (gap: number) => CAPS.filter((c) => capGap(c) === gap).length;
    expect([count(0), count(1), count(2)]).toEqual([7, 8, 5]);
  });

  it("finds the repeating cell", () => {
    expect(capCell("AABBAABB")).toBe("AABB");
    expect(capCell("CCCCCCCC")).toBe("C");
    expect(capCell("FLFLFLFL")).toBe("FL");
  });
});

describe("capBeats", () => {
  it("reads two beats of 1:1 extension and two of 1:3 antispin in each hand", () => {
    for (const cap of CAPS) {
      const beats = capBeats(cap);
      for (const side of ["left", "right"] as const) {
        const spins = beats.map((b) => b[side].spin);
        expect(spins.filter((s) => s === "extension")).toHaveLength(4);
        for (const b of beats) {
          expect(b[side].ratio).toBe(
            b[side].spin === "extension" ? "1:1" : "1:3"
          );
        }
      }
    }
  });

  it("reads AABB as split-same throughout", () => {
    const aabb = CAPS.find((c) => c.word === "AABBAABB")!;
    expect(new Set(capBeats(aabb).map((b) => b.family))).toEqual(
      new Set(["split-same"])
    );
  });
});

describe("strips", () => {
  it("plays every cap as a start pose and eight chained beats", () => {
    for (const cap of CAPS) {
      const strip = capStrip(cap);
      expect(strip).toHaveLength(9);
      for (let i = 1; i < strip.length; i++) {
        expect(strip[i]!.startPlacement).toBe(strip[i - 1]!.endPlacement);
      }
      expect(
        strip
          .slice(1)
          .map((s) => s.letter)
          .join("")
      ).toBe(cap.word);
    }
  });

  it("spells the Book as D and J, opening and closing", () => {
    expect(spellPair(BOOK_LEFT_STEPS, BOOK_RIGHT_STEPS, lookup)).toBe(
      BOOK_WORD
    );
    const strip = bookStrip();
    for (let i = 1; i < strip.length; i++) {
      expect(strip[i]!.startPlacement).toBe(strip[i - 1]!.endPlacement);
    }
  });
});

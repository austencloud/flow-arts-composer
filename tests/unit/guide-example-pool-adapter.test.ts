import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  entryToStrip,
  loopLabel,
  buildPools,
  flaggedEntries,
  rawSlots,
  mirroredPool,
  rotatedPool,
  swappedPool,
} from "../../src/routes/(public)/guide/level-1/_data/example-pools/pool-adapter";
import type { RawPool } from "../../src/routes/(public)/guide/level-1/_data/example-pools/pool-adapter";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  getGridPlacementFromLocations,
  getGridLocationsFromPlacement,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// The adapter turns curated MCP step JSON into pictograph strips via the SAME
// canonical primitives the hand-authored content uses. These are silent-bug
// checks: a wrong position inverse or a mis-mapped letter renders a subtly wrong
// pictograph that no test-less eye reliably catches.

describe("position inverse (the canon the adapter relies on)", () => {
  it("is unique per position and round-trips through the forward deriver", () => {
    // Enumerate every GridLocation pair through the canonical forward deriver;
    // assert no two pairs collapse onto one position (uniqueness), and the
    // canonical inverse of every produced position forward-derives back to it.
    const producedBy = new Map<string, string>();
    for (const left of Object.values(GridLocation)) {
      for (const right of Object.values(GridLocation)) {
        let pos: string;
        try {
          pos = getGridPlacementFromLocations(left, right);
        } catch {
          continue;
        }
        const key = `${left},${right}`;
        const prior = producedBy.get(pos);
        expect(prior === undefined || prior === key).toBe(true);
        producedBy.set(pos, key);
      }
    }
    for (const [pos, key] of producedBy) {
      const [b, r] = getGridLocationsFromPlacement(pos as GridPlacement);
      expect(getGridPlacementFromLocations(b, r)).toBe(pos);
      expect(`${b},${r}`).toBe(key);
    }
  });
});

describe("entryToStrip — GΘSZ spot check (field-by-field)", () => {
  const gtsz = rawSlots.mirrored.candidates.find((c) => c.word === "GΘSZ");
  it("the pilot slate still contains GΘSZ", () => {
    expect(gtsz).toBeDefined();
  });

  const strip = entryToStrip(gtsz!) as unknown as StepData[];

  it("builds a start box + 8 steps (items.length === steps.length)", () => {
    expect(strip.length).toBe(gtsz!.steps.length);
    expect(strip.length).toBe(9);
  });

  it("maps the start box: β start letter, stepNumber 0, beta7", () => {
    const start = strip[0]!;
    expect(start.letter).toBe(Letter.BETA);
    expect(start.stepNumber).toBe(0);
    // beta7 = (WEST, WEST) per the canonical deriver.
    expect(start.startPlacement).toBe(GridPlacement.BETA7);
    expect(start.motions.left.startLocation).toBe(GridLocation.WEST);
    expect(start.motions.right.startLocation).toBe(GridLocation.WEST);
  });

  it("maps step 1 (G, beta7→beta1): letter enum, inverted locations, motion fields", () => {
    const s1 = strip[1]!;
    expect(s1.letter).toBe(Letter.G);
    expect(s1.stepNumber).toBe(1);
    expect(s1.startPlacement).toBe(GridPlacement.BETA7); // (w,w)
    expect(s1.endPlacement).toBe(GridPlacement.BETA1); // (n,n)
    // Locations come from inverting the JSON positions, per hand.
    expect(s1.motions.left.startLocation).toBe(GridLocation.WEST);
    expect(s1.motions.left.endLocation).toBe(GridLocation.NORTH);
    expect(s1.motions.right.startLocation).toBe(GridLocation.WEST);
    expect(s1.motions.right.endLocation).toBe(GridLocation.NORTH);
    // Motion type / direction taken straight from the JSON (pro cw / pro cw).
    expect(s1.motions.left.motionType).toBe(MotionType.PRO);
    expect(s1.motions.left.rotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(s1.motions.right.motionType).toBe(MotionType.PRO);
    expect(s1.motions.right.rotationDirection).toBe(RotationDirection.CLOCKWISE);
  });

  it("maps a Greek letter (step 2 Θ) and a static hand", () => {
    const s2 = strip[2]!;
    expect(s2.letter).toBe(Letter.THETA);
    // JSON: blue static on Θ, red pro cw.
    expect(s2.motions.left.motionType).toBe(MotionType.STATIC);
    expect(s2.motions.right.motionType).toBe(MotionType.PRO);
  });

  it("ran bakeReversals — the cw→ccw seam flip produced a reversal mark", () => {
    // The mirrored second half inverts every rotation direction; bakeReversals
    // derives the dot from the motions themselves. Its presence proves baking ran.
    const anyReversal = strip.some((s) => s.leftReversal || s.rightReversal);
    expect(anyReversal).toBe(true);
  });
});

describe("every pilot candidate adapts", () => {
  const all = [
    ...rawSlots.mirrored.candidates.map((c) => ({ slot: "mirrored", c })),
    ...rawSlots.rotated.candidates.map((c) => ({ slot: "rotated", c })),
    ...rawSlots.swapped.candidates.map((c) => ({ slot: "swapped", c })),
  ];

  it("has 12 pilot candidates (4 per slot)", () => {
    expect(rawSlots.mirrored.candidates.length).toBe(4);
    expect(rawSlots.rotated.candidates.length).toBe(4);
    expect(rawSlots.swapped.candidates.length).toBe(4);
    expect(all.length).toBe(12);
  });

  for (const { slot, c } of [
    ...rawSlots.mirrored.candidates.map((c) => ({ slot: "mirrored", c })),
    ...rawSlots.rotated.candidates.map((c) => ({ slot: "rotated", c })),
    ...rawSlots.swapped.candidates.map((c) => ({ slot: "swapped", c })),
  ]) {
    it(`${slot}/${c.word} adapts with items.length === steps.length`, () => {
      const strip = entryToStrip(c);
      expect(strip.length).toBe(c.steps.length);
    });
  }

  it("no entry was flagged/excluded", () => {
    expect(flaggedEntries).toEqual([]);
  });

  it("all three slot pools built with the expected counts", () => {
    expect(mirroredPool.length).toBe(4);
    expect(rotatedPool.length).toBe(4);
    expect(swappedPool.length).toBe(4);
  });
});

describe("loopLabel", () => {
  it("names the rotation slice for rotated entries, plain label otherwise", () => {
    expect(loopLabel({ word: "x", loopType: "mirrored", prose: "", steps: [] })).toBe("Mirrored");
    expect(loopLabel({ word: "x", loopType: "swapped", prose: "", steps: [] })).toBe("Swapped");
    expect(
      loopLabel({ word: "x", loopType: "rotated", period: "halved", prose: "", steps: [] }),
    ).toBe("Rotated 180°");
    expect(
      loopLabel({ word: "x", loopType: "rotated", period: "quartered", prose: "", steps: [] }),
    ).toBe("Rotated 90°");
  });

  it("an explicit label wins over the derivation (compound classifications)", () => {
    expect(
      loopLabel({
        word: "x",
        loopType: "rotated_swapped",
        label: "Swapped & Mirrored",
        prose: "",
        steps: [],
      }),
    ).toBe("Swapped & Mirrored");
  });
});

// ── Factory sweep: every *.pool.json in example-pools/, not just permutations
// ── ─────────────────────────────────────────────────────────────────────────
// The rollout (docs/superpowers/specs/2026-07-16-guide-example-pools-rollout.md,
// section 6) adds a page pool JSON per guide page. This sweep reads the
// directory at test time - drop a new <page>.pool.json in and it's covered
// automatically, no test file edits required.
const poolsDir = resolve(
  process.cwd(),
  "src/routes/(public)/guide/level-1/_data/example-pools",
);
const poolFiles = readdirSync(poolsDir).filter((f) => f.endsWith(".pool.json"));
const poolsByFile = poolFiles.map((file) => ({
  file,
  raw: JSON.parse(readFileSync(resolve(poolsDir, file), "utf-8")) as RawPool,
}));

describe("factory sweep: every pool JSON builds cleanly", () => {
  it("found at least one *.pool.json to sweep (permutations, at minimum)", () => {
    expect(poolFiles.length).toBeGreaterThan(0);
  });

  for (const { file, raw } of poolsByFile) {
    describe(file, () => {
      const { flagged } = buildPools(raw);

      it("adapts every candidate with zero flagged entries", () => {
        expect(flagged).toEqual([]);
      });

      for (const [slotKey, slot] of Object.entries(raw.slots)) {
        for (const candidate of slot.candidates) {
          it(`${slotKey}/${candidate.word}: start box derives from step 0, positions round-trip`, () => {
            const strip = entryToStrip(candidate) as unknown as StepData[];

            // Start box derives from step 0 (or the first step, if 0 is absent).
            const s0 = candidate.steps.find((s) => s.step === 0) ?? candidate.steps[0]!;
            expect(strip[0]!.stepNumber).toBe(0);
            expect(strip[0]! as unknown as { letter: string }).toMatchObject({
              letter: s0.letter,
            });

            // Every position this candidate actually uses round-trips through
            // the canonical location <-> position deriver. This is the same
            // invariant assertPositionInverseIsUnique proves by exhaustive
            // enumeration; here it's checked against the real positions each
            // candidate names, so a curated typo ("beta9" for a position that
            // doesn't exist) fails loudly instead of silently degrading.
            for (const step of candidate.steps) {
              const [startName, endName] = step.pos.split("→").map((s) => s.trim());
              for (const name of [startName, endName]) {
                const [left, right] = getGridLocationsFromPlacement(name as GridPlacement);
                expect(getGridPlacementFromLocations(left, right)).toBe(name);
              }
            }
          });
        }
      }
    });
  }
});

describe("prose hygiene: every candidate in every pool JSON", () => {
  // Only the compound "half turn(s)" / "quarter turn(s)" is banned here. Prop
  // turns and body turns are legitimate uses of "turn" elsewhere in the guide
  // (tka-domain.md); this regex targets only the loop-rotation misnomer these
  // pool pages describe (rotated 180°/90°, never "half turns"/"quarter turns").
  const BANNED_LOOP_ROTATION_MISNOMER = /\b(half|quarter)[- ]turns?\b/i;
  // Built from a code point, not typed literally, so this file never contains
  // the character it's banning.
  const EM_DASH_CHAR = String.fromCodePoint(8212);

  for (const { file, raw } of poolsByFile) {
    for (const [slotKey, slot] of Object.entries(raw.slots)) {
      for (const candidate of slot.candidates) {
        it(`${file} ${slotKey}/${candidate.word}: prose has no em dash and no half/quarter-turn misnomer`, () => {
          expect(candidate.prose.includes(EM_DASH_CHAR)).toBe(false);
          expect(candidate.prose).not.toMatch(BANNED_LOOP_ROTATION_MISNOMER);
        });
      }
    }
  }
});

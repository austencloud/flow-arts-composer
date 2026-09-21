/**
 * Fused-word derivation — regression for the "GI" bug (2026-07-08).
 *
 * A production fuse (users/pN1yIVYGv0…/sequences/seq_1783511935084_hy071ftoq)
 * saved with word "GI" for a 12-step fused sequence whose steps actually spell
 * "IIECCKIIECCK": the word builder silently dropped steps whose letter
 * derivation returned null. These tests pin down:
 *   1. The full fuse → derive pipeline produces a letter for EVERY step of a
 *      real fused input (real CSV dataframes, no stubs) and a word whose
 *      length matches the step count.
 *   2. A partial derivation is never silent — letter-deriver warns with counts
 *      when the word omits unlettered steps.
 *   3. fusedDisplayName turns the derived word into a sane name (simplified
 *      repeat, never "__fused__", never "blue + red"-style placeholders).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fuseSequences, fusedDisplayName } from "../sequence-fuser";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

// Real pictograph dataframes — the letter lookup must run against the actual
// domain data, never a stub (mcp-ground-truth / verify-at-canonical-source).
function injectRealCsvData() {
  const root = resolve(__dirname, "../../../../../..");
  const read = (f: string) =>
    readFileSync(resolve(root, "static/data/pictographs", f), "utf8");
  Object.assign(window, {
    csvData: {
      diamondData: read("DiamondPictographDataframe.csv"),
      boxData: read("BoxPictographDataframe.csv"),
      skewedData: read("SkewedPictographDataframe.csv"),
    },
  });
}

type StepSpec = [MotionType, GridLocation, GridLocation, RotationDirection];

function makeSoloProp(
  specs: StepSpec[],
  start: GridLocation,
  gridMode: GridMode = GridMode.DIAMOND
): SoloPropData {
  const steps: SoloPropStepData[] = specs.map(([motionType, s, e, rot]) => ({
    startLocation: s,
    endLocation: e,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType,
    rotationDirection: rot,
    turns: 0,
    duration: 1,
  }));
  const locations = [start, ...specs.map(([, , e]) => e)];
  return {
    id: crypto.randomUUID(),
    steps,
    startLocation: start,
    startOrientation: Orientation.IN,
    contentHash: "",
    handPath: {
      id: crypto.randomUUID(),
      locations,
      contentHash: "",
      startLocation: start,
      endLocation: locations[locations.length - 1]!,
      length: specs.length,
      bigrams: [],
      uniqueLocations: [...new Set(locations)],
      impliedGridMode: gridMode,
      isClosed: locations[0] === locations[locations.length - 1],
    },
    length: specs.length,
    bigrams: [],
    impliedGridMode: gridMode,
  };
}

const N = "n" as GridLocation;
const E = "e" as GridLocation;
const S = "s" as GridLocation;
const W = "w" as GridLocation;
const NE = "ne" as GridLocation;
const SE = "se" as GridLocation;
const SW = "sw" as GridLocation;
const NW = "nw" as GridLocation;
/** What the Rotate 45 degree rule does to a diamond hand: every point one step clockwise. */
const rotate45: Record<string, GridLocation> = { n: NE, e: SE, s: SW, w: NW };
const PRO = MotionType.PRO;
const ANTI = MotionType.ANTI;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

// The exact solo-prop step lists from the production doc that saved as "GI".
const leftSpecs: StepSpec[] = [
  [PRO, S, E, CCW],
  [PRO, E, N, CCW],
  [ANTI, N, E, CCW],
  [PRO, E, N, CCW],
  [PRO, N, W, CCW],
  [ANTI, W, N, CCW],
  [PRO, N, W, CCW],
  [PRO, W, S, CCW],
  [ANTI, S, W, CCW],
  [PRO, W, S, CCW],
  [PRO, S, E, CCW],
  [ANTI, E, S, CCW],
];
const rightSpecs: StepSpec[] = [
  [ANTI, S, E, CW],
  [ANTI, E, N, CW],
  [ANTI, N, W, CW],
  [ANTI, W, S, CW],
  [ANTI, S, E, CW],
  [ANTI, E, N, CW],
  [ANTI, N, W, CW],
  [ANTI, W, S, CW],
  [ANTI, S, E, CW],
  [ANTI, E, N, CW],
  [ANTI, N, W, CW],
  [ANTI, W, S, CW],
];

const rightSkewedSpecs: StepSpec[] = rightSpecs.map(([type, s, e, rot]) => [
  type,
  rotate45[s]!,
  rotate45[e]!,
  rot,
]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fused sequence word derivation", () => {
  it("derives a letter for every fused step and a length-consistent word", async () => {
    injectRealCsvData();
    const fused = fuseSequences(
      makeSoloProp(leftSpecs, S),
      makeSoloProp(rightSpecs, S)
    );
    expect(fused.steps.length).toBe(12);

    const derived = await deriveLettersForSequence(fused);

    // No silent drops: every step must carry a letter for this input, and the
    // word must be exactly the per-step letters joined — same length, same order.
    const letters = derived.steps.map((s) => s.letter);
    expect(letters.every((l) => !!l)).toBe(true);
    expect(derived.word).toBe(letters.join(""));
    expect(derived.word.length).toBe(derived.steps.length);
    expect(derived.word).toBe("IIECCKIIECCK");
  });

  it("warns loudly (not silently) when some steps derive no letter", async () => {
    injectRealCsvData();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fused = fuseSequences(
      makeSoloProp(leftSpecs, S),
      makeSoloProp(rightSpecs, S)
    );
    // Sabotage one step so its lookup cannot match any dataframe row.
    const steps = fused.steps.map((s, i) =>
      i === 3
        ? {
            ...s,
            motions: {
              ...s.motions,
              left: { ...s.motions.left!, startLocation: N, endLocation: S },
            },
          }
        : s
    );
    const derived = await deriveLettersForSequence({ ...fused, steps });

    expect(derived.steps.filter((s) => s.letter).length).toBe(11);
    // Word follows the codebase convention (unlettered steps contribute
    // nothing — see word-deriver.deriveWordFromBeats)…
    expect(derived.word.length).toBe(11);
    // …but never silently: the incomplete word is called out with counts.
    const calls = warn.mock.calls.map((c) => String(c[0]));
    expect(
      calls.some((m) => m.includes("1/12") && m.includes("incomplete"))
    ).toBe(true);
  });

  it("letters every beat of a rotate-45 fuse and writes the span in braces", async () => {
    injectRealCsvData();
    const fused = fuseSequences(
      makeSoloProp(leftSpecs, S),
      makeSoloProp(rightSkewedSpecs, SW, GridMode.BOX)
    );
    expect(fused.gridMode).toBe(GridMode.SKEWED);

    const derived = await deriveLettersForSequence(fused);
    const letters = derived.steps.map((step) => step.letter);
    expect(letters.every(Boolean), letters.join(",")).toBe(true);
    // Beat 1: blue pro s->e and red anti sw->se both travel counter-clockwise;
    // blue is ahead and is the pro hand, so the pro hand leads: U.
    expect(letters[0]).toBe("U");
    expect(derived.word).toBe(`{${letters.join("")}}`);
    expect(fusedDisplayName(derived.word)).toMatch(/^\{[^{}]+\}$/);
  });
});

describe("fusedDisplayName", () => {
  it("simplifies a repeated fused word into the display name", () => {
    expect(fusedDisplayName("IIECCKIIECCK")).toBe("IIECCK");
  });

  it("falls back to an honest label for empty or sentinel words", () => {
    expect(fusedDisplayName("")).toBe("Fused sequence");
    expect(fusedDisplayName("__fused__")).toBe("Fused sequence");
  });
});

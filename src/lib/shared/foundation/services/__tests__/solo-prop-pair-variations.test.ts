/**
 * Zan's Diamond variations — the silent failures here are a reversed hand
 * whose turns quietly flip the prop to `in`, a stagger that drifts off the
 * closed loop, or a beat whose letter lookup fails and vanishes from the word.
 * The fixture is a copy of the author-verified record's solo-prop steps
 * (seq_1791923102683_sysj46042); the letters come from the real dataframe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildStaggerAndReversalVariations,
  cyclicPairSignature,
  enumerateStaggerAndReversalVariations,
  pairSoloPropSteps,
  reverseSoloPropSteps,
  rotateSoloPropSteps,
  type PairLetterLookup,
} from "../solo-prop-pair-variations";
import {
  lookupLetter,
  parseCsvEdges,
} from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import type { SoloPropStepData } from "../../domain/models/solo-prop-step-data.js";
import record from "./fixtures/zans-diamond-record.json";

const leftSteps = record.leftSteps as SoloPropStepData[];
const rightSteps = record.rightSteps as SoloPropStepData[];

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

const PATH = ["s", "e", "w", "n", "s", "w", "e", "n", "s"];

function locations(steps: readonly SoloPropStepData[]): string[] {
  return [steps[0]!.startLocation, ...steps.map((s) => s.endLocation)];
}

describe("rotateSoloPropSteps", () => {
  it("starts the closed path on the requested step and keeps every step", () => {
    const rotated = rotateSoloPropSteps(leftSteps, 3);
    expect(locations(rotated)).toEqual([...PATH.slice(3), ...PATH.slice(1, 4)]);
    expect(rotateSoloPropSteps(leftSteps, 8)).toEqual(leftSteps);
  });

  it("refuses an open path", () => {
    expect(() => rotateSoloPropSteps(leftSteps.slice(0, 3), 1)).toThrow(
      /closed/
    );
  });
});

describe("reverseSoloPropSteps", () => {
  it("retraces the locations backwards with the prop still spinning the same way", () => {
    const reversed = reverseSoloPropSteps(leftSteps);
    expect(locations(reversed)).toEqual([...PATH].reverse());
    expect(reversed.every((s) => s.rotationDirection === "ccw")).toBe(true);
    // Arcs flip pro ↔ anti; dashes stay dashes.
    expect(reversed.map((s) => s.motionType)).toEqual([
      "dash",
      "anti",
      "dash",
      "pro",
      "dash",
      "pro",
      "dash",
      "anti",
    ]);
  });

  it("keeps the record's out → out orientation on every reversed beat", () => {
    for (const steps of [leftSteps, rightSteps]) {
      for (const step of reverseSoloPropSteps(steps)) {
        expect(step.startOrientation).toBe("out");
        expect(step.endOrientation).toBe("out");
      }
    }
  });

  it("is an involution on locations, motion types and turns", () => {
    const twice = reverseSoloPropSteps(reverseSoloPropSteps(rightSteps));
    expect(
      twice.map((s) => [s.startLocation, s.endLocation, s.motionType, s.turns])
    ).toEqual(
      rightSteps.map((s) => [
        s.startLocation,
        s.endLocation,
        s.motionType,
        s.turns,
      ])
    );
  });
});

describe("pairSoloPropSteps", () => {
  it("reproduces the source record when both hands run forward in step", () => {
    const result = pairSoloPropSteps(
      {
        id: "source",
        label: "source",
        left: { reversed: false, offset: 0 },
        right: { reversed: false, offset: 0 },
      },
      leftSteps,
      rightSteps,
      lookup
    );
    expect(result.word).toBe(record.word);
    expect(result.beats[0]!.startPlacement).toBe(record.startPlacement);
    expect(result.unresolvedBeats).toEqual([]);
  });
});

describe("Zan's Diamond stagger and reversal set", () => {
  const results = buildStaggerAndReversalVariations(
    leftSteps,
    rightSteps,
    lookup
  );

  it("enumerates 7 staggers plus 8 reversals per hand", () => {
    expect(enumerateStaggerAndReversalVariations(8)).toHaveLength(23);
  });

  it("keeps all 23 as distinct loops", () => {
    expect(results.map((r) => r.variation.id)).toEqual(
      enumerateStaggerAndReversalVariations(8).map((v) => v.id)
    );
    expect(new Set(results.map(cyclicPairSignature)).size).toBe(23);
    // Two of them spell the same word from different placements (the
    // CΦ- loop entered at alpha1 and at alpha5); the word alone is not identity.
    expect(
      new Set(results.map((r) => `${r.word}@${r.beats[0]!.startPlacement}`))
        .size
    ).toBe(23);
  });

  it("resolves a dataframe letter on every beat of every variation", () => {
    const misses = results
      .filter((r) => r.unresolvedBeats.length > 0)
      .map((r) => `${r.variation.id}: beats ${r.unresolvedBeats.join(",")}`);
    expect(misses).toEqual([]);
    expect(
      results.every((r) => r.word.length === 8 || !r.word.includes("?"))
    ).toBe(true);
  });

  it("closes every loop where it started", () => {
    for (const r of results) {
      expect(r.beats[7]!.endPlacement).toBe(r.beats[0]!.startPlacement);
    }
  });

  it("puts a shift against a dash on every beat of an odd stagger", () => {
    const odd = results.find((r) => r.variation.id === "right+1")!;
    for (const beat of odd.beats) {
      const types = [beat.left.motionType, beat.right.motionType];
      expect(types.filter((t) => t === "dash")).toHaveLength(1);
      expect(types.some((t) => t === "pro" || t === "anti")).toBe(true);
    }
  });
});

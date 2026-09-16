/**
 * Regression lock: component recovery on REAL generated loops.
 *
 * Fixtures: tests/fixtures/loop-audit/real-loop-fixtures.json (repo root) —
 * produced by scripts/generate-loop-audit-fixtures.mjs, which drives the
 * production pipeline (Diamond CSV dataset -> SequenceBuilder beam search
 * with LOOP seam targeting -> executeLOOPSpec). Same path as MCP
 * `generate_sequence loopType=...` and the app's circular generation, so
 * these are canonical instances of each LOOPType, committed for determinism.
 *
 * Locks the 2026-07-05 pair-relation consolidation (see pair-relation.ts):
 *   - swap/invert aliasing on the motion-type axis is gone (swap is read from
 *     hand identity via locations; inversion along the matched correspondence)
 *   - swap∘invert no longer cancels to nothing
 *   - FLIPPED and REWOUND detection paths exist
 *   - single-point rotation false positives are gone
 *   - nested (inner-rotation) loops recover their rotated component
 *
 * Known generator-contract exclusions (detector is data-faithful; the emitted
 * loop does not carry the labeled transform — see the audit handoff addendum):
 *   - mirrored_swapped_inverted: LOOPEndPlacementSelector seams it at
 *     startPlacement, but the correct seam is SWAP(VMIRROR(start)); the emitted
 *     loop is not an absolute mirror+swap+invert (sample 0 actually reads as
 *     flipped+inverted+swapped — the composite the wrong seam produces).
 *   - rotated_swapped samples 1-2: dash/static-heavy seeds make the
 *     continuity-based FusedExecutor emit loops with no uniform absolute
 *     halved relation.
 *   - mirrored_rotated_inverted_swapped sample 2: started on a seam where the
 *     composite resolves to the flipped reading.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectLOOPFromSteps,
  loopDetectorClass,
} from "../../../src/loop/detection/LOOPDetector.js";
import { LOOPType } from "../../../src/loop/loop-types.js";
import type { SequenceStep } from "../../../src/core/types/sequence-engine-types.js";
import { normalizeLegacySteps } from "@tka/tka-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../../../tests/fixtures/loop-audit/real-loop-fixtures.json",
);

interface FixtureSample {
  loopType: string;
  seedWord: string;
  derivedWord: string;
  steps: SequenceStep[];
}

const FIXTURES: Record<string, FixtureSample[]> = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, FixtureSample[]>
  ).map(([type, samples]) => [
    type,
    samples.map((sample) => ({
      ...sample,
      steps: normalizeLegacySteps(sample.steps),
    })),
  ])
);

function functional(sample: FixtureSample): string[] {
  return [...detectLOOPFromSteps(sample.steps).components].map(String).sort();
}

function engineClass(sample: FixtureSample): string[] {
  const r = loopDetectorClass.detectLOOPType(sample.steps);
  if (!r.spec?.left) return [];
  return [...r.spec.left.components.keys()].map(String).sort();
}

function classLoopType(sample: FixtureSample): string | null {
  return loopDetectorClass.detectLOOPType(sample.steps).loopType;
}

/** Types where every committed sample must recover exactly, both detectors. */
const EXACT_RECOVERY: Record<string, string[]> = {
  rotated: ["rotated"],
  mirrored: ["mirrored"],
  flipped: ["flipped"],
  swapped: ["swapped"],
  inverted: ["inverted"],
  swapped_inverted: ["inverted", "swapped"],
  rotated_inverted: ["inverted", "rotated"],
  mirrored_swapped: ["mirrored", "swapped"],
  mirrored_inverted: ["inverted", "mirrored"],
  mirrored_rotated: ["mirrored", "rotated"],
  mirrored_inverted_rotated: ["inverted", "mirrored", "rotated"],
  rewound: ["rewound"],
};

describe("real-loop component recovery (functional + class)", () => {
  for (const [type, expected] of Object.entries(EXACT_RECOVERY)) {
    it(`${type}: every sample recovers exactly {${expected.join("+")}}`, () => {
      const samples = FIXTURES[type]!;
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples) {
        expect(functional(sample), `functional on ${sample.seedWord}`).toEqual(expected);
        expect(engineClass(sample), `class on ${sample.seedWord}`).toEqual(expected);
      }
    });
  }

  it("rotated_swapped: sample 0 recovers exactly; degraded samples never fabricate components", () => {
    const samples = FIXTURES["rotated_swapped"]!;
    expect(functional(samples[0]!)).toEqual(["rotated", "swapped"]);
    expect(engineClass(samples[0]!)).toEqual(["rotated", "swapped"]);

    // Samples 1-2 carry no uniform absolute relation (continuity-generator
    // drift with dash/static seeds). The detector must stay data-faithful:
    // anything it reports must be a subset of the labeled components — no
    // fabricated mirrored/inverted/flipped.
    for (const sample of samples.slice(1)) {
      for (const comps of [functional(sample), engineClass(sample)]) {
        for (const c of comps) {
          expect(["rotated", "swapped"]).toContain(c);
        }
      }
    }
  });

  it("mirrored_rotated_inverted_swapped: seam-valid samples recover all four", () => {
    const samples = FIXTURES["mirrored_rotated_inverted_swapped"]!;
    const expected = ["inverted", "mirrored", "rotated", "swapped"];
    expect(functional(samples[0]!)).toEqual(expected);
    expect(engineClass(samples[0]!)).toEqual(expected);
    expect(functional(samples[1]!)).toEqual(expected);
    expect(engineClass(samples[1]!)).toEqual(expected);
    // Sample 2 started on a seam where the composite resolves to the flipped
    // reading — the detector reports what the data shows.
    expect(functional(samples[2]!)).toEqual(["flipped", "inverted", "rotated", "swapped"]);
  });

  it("class detector resolves the named LOOPType for canonical types", () => {
    expect(classLoopType(FIXTURES["flipped"]![0]!)).toBe(LOOPType.FLIPPED);
    expect(classLoopType(FIXTURES["rewound"]![0]!)).toBe(LOOPType.REWOUND);
    expect(classLoopType(FIXTURES["swapped_inverted"]![0]!)).toBe(LOOPType.SWAPPED_INVERTED);
    expect(classLoopType(FIXTURES["mirrored_inverted"]![0]!)).toBe(LOOPType.MIRRORED_INVERTED);
    expect(classLoopType(FIXTURES["mirrored_rotated"]![0]!)).toBe(LOOPType.MIRRORED_ROTATED);
    expect(classLoopType(FIXTURES["mirrored_swapped"]![0]!)).toBe(LOOPType.MIRRORED_SWAPPED);
  });

  // ---- Alias non-regressions (the audit's root-cause A/B) ----

  it("pure SWAPPED never reports inverted (motion-type alias is dead)", () => {
    for (const sample of FIXTURES["swapped"]!) {
      expect(functional(sample)).not.toContain("inverted");
      expect(engineClass(sample)).not.toContain("inverted");
    }
  });

  it("pure INVERTED never reports swapped (motion-type alias is dead)", () => {
    for (const sample of FIXTURES["inverted"]!) {
      expect(functional(sample)).not.toContain("swapped");
      expect(engineClass(sample)).not.toContain("swapped");
    }
  });

  it("pure MIRRORED / FLIPPED never report inverted", () => {
    for (const type of ["mirrored", "flipped"]) {
      for (const sample of FIXTURES[type]!) {
        expect(functional(sample)).not.toContain("inverted");
        expect(engineClass(sample)).not.toContain("inverted");
      }
    }
  });

  it("SWAPPED_INVERTED recovers BOTH components (swap∘invert no longer cancels)", () => {
    for (const sample of FIXTURES["swapped_inverted"]!) {
      const f = functional(sample);
      expect(f).toContain("swapped");
      expect(f).toContain("inverted");
    }
  });
});

/**
 * Round-trip loop-detection audit.
 *
 * EMPIRICAL, not analytical. For each LOOPType we drive the REAL generator
 * (executeLOOPSpec + loopSpecFromLegacy) to produce a full circular loop from a
 * hand-built partial, run BOTH detectors on the result, and compare the
 * recovered component set against the type's primitive decomposition.
 *
 * FIXTURE DESIGN (this is load-bearing — see the header notes in the report):
 *   - We use NON-AXIS (diagonal alpha) positions. On the axis orbit
 *     {alpha1,3,5,7} a vertical mirror coincides with a 180° rotation for some
 *     positions, so an axis fixture makes a pure mirror ALSO look rotated. The
 *     diagonal orbit {alpha2,4,6,8} separates the transforms.
 *   - Fuse types use a NON-ROTATING diagonal oscillation (a2<->a4). A partial
 *     that sweeps a full 360° injects a real rotation into the loop and
 *     confounds the audit; oscillation keeps net rotation at zero.
 *   - Both hands carry OPPOSITE motion types (left=pro, right=anti) so SWAP is
 *     observable to the motion-type swap detector and MIRROR/FLIP move positions.
 *   - Partials are >= 4 steps so the loop has >= 8 letter steps → the functional
 *     detector's floor(halfLength*0.75) threshold is a real threshold (3), not
 *     the degenerate 0 you get from a 1-step partial.
 *   - Positions are DERIVED from hand locations so labelled positions and motion
 *     locations never disagree (the two detectors read positions differently).
 *
 * Soft-collect: every mismatch is pushed into a table printed once at the end,
 * so one run surfaces ALL failures. This file NEVER modifies a detector or
 * executor — it only reads and drives them.
 */

import { describe, it, expect } from "vitest";
import { LOOPType } from "../../../src/loop/loop-types.js";
import { loopSpecFromLegacy } from "../../../src/loop/loop-spec.js";
import { executeLOOPSpec } from "../../../src/loop/execution/spec-executor.js";
import {
  detectLOOPFromSteps,
  loopDetectorClass,
  isSequenceCircular,
} from "../../../src/loop/detection/LOOPDetector.js";
import { gridPlacementDeriver } from "../../../src/core/placements/GridPlacementDeriver.js";
import type {
  SequenceStep,
  MotionData,
} from "../../../src/core/types/sequence-engine-types.js";

// Step / motion construction (mirrors spec-executor-parity.test.ts shape).

function makeMotion(o: Partial<MotionData> = {}): MotionData {
  return {
    motionType: "pro",
    startLocation: "n",
    endLocation: "e",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "clock",
    turns: 1,
    ...o,
  } as MotionData;
}

function makeStep(
  n: number,
  startPos: string,
  endPos: string,
  left: Partial<MotionData>,
  right: Partial<MotionData>,
  letter: string | null,
): SequenceStep {
  return {
    id: `step-${n}`,
    stepNumber: n,
    duration: 1,
    letter,
    startPlacement: startPos,
    endPlacement: endPos,
    motions: { left: makeMotion(left), right: makeMotion(right) },
  } as SequenceStep;
}

const derive = (leftLoc: string, rightLoc: string) =>
  gridPlacementDeriver.getGridPlacementFromLocations(leftLoc, rightLoc);

/** A step with positions DERIVED from hand locations (label/location consistent). */
function step(
  n: number,
  bs: string, be: string,
  rs: string, re: string,
  bt: string, rt: string,
  letter: string,
): SequenceStep {
  return makeStep(
    n,
    derive(bs, rs),
    derive(be, re),
    { startLocation: bs, endLocation: be, motionType: bt },
    { startLocation: rs, endLocation: re, motionType: rt },
    letter,
  );
}

/** Static start-placement marker (stepNumber 0). */
function startStep(bs: string, rs: string): SequenceStep {
  return makeStep(
    0,
    derive(bs, rs),
    derive(bs, rs),
    { startLocation: bs, endLocation: bs, motionType: "static" },
    { startLocation: rs, endLocation: rs, motionType: "static" },
    null,
  );
}

// ---------------------------------------------------------------------------
// Clean fixtures (see header). All are 4 steps, non-axis, left=pro / right=anti.
// ---------------------------------------------------------------------------

/** Non-rotating diagonal oscillation alpha2 <-> alpha4 (fuse types + rewound). */
function diagOsc(): SequenceStep[] {
  return [
    startStep("sw", "ne"),
    step(1, "sw", "nw", "ne", "se", "pro", "anti", "A"), // a2 -> a4
    step(2, "nw", "sw", "se", "ne", "pro", "anti", "A"), // a4 -> a2
    step(3, "sw", "nw", "ne", "se", "pro", "anti", "A"),
    step(4, "nw", "sw", "se", "ne", "pro", "anti", "A"),
  ];
}

/** Diagonal net-180 rotation a2->a4->a6->a8->a6 (ends alpha6 = HALF(alpha2)). */
function diagRot(): SequenceStep[] {
  return [
    startStep("sw", "ne"),
    step(1, "sw", "nw", "ne", "se", "pro", "anti", "A"), // a2 -> a4 cw
    step(2, "nw", "ne", "se", "sw", "pro", "anti", "A"), // a4 -> a6 cw
    step(3, "ne", "se", "sw", "nw", "pro", "anti", "A"), // a6 -> a8 cw
    step(4, "se", "ne", "nw", "sw", "pro", "anti", "A"), // a8 -> a6 ccw
  ];
}

/** Same-motion-type variant (left=right=pro): characterizes the swap/invert alias. */
function diagOscSameType(): SequenceStep[] {
  return [
    startStep("sw", "ne"),
    step(1, "sw", "nw", "ne", "se", "pro", "pro", "A"),
    step(2, "nw", "sw", "se", "ne", "pro", "pro", "A"),
    step(3, "sw", "nw", "ne", "se", "pro", "pro", "A"),
    step(4, "nw", "sw", "se", "ne", "pro", "pro", "A"),
  ];
}

/** Axis-orbit mirror (alpha1->a3->a5->a7->a1) — for the phase-fragility contrast. */
function axisSweep(): SequenceStep[] {
  return [
    startStep("s", "n"),
    step(1, "s", "w", "n", "e", "pro", "anti", "A"), // a1 -> a3
    step(2, "w", "n", "e", "s", "pro", "anti", "A"), // a3 -> a5
    step(3, "n", "e", "s", "w", "pro", "anti", "A"), // a5 -> a7
    step(4, "e", "s", "w", "n", "pro", "anti", "A"), // a7 -> a1
  ];
}

// ---------------------------------------------------------------------------
// Which fixture each type uses.
// ---------------------------------------------------------------------------

const ROTATION_FAMILY = new Set<LOOPType>([
  LOOPType.ROTATED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
]);

function fixtureFor(type: LOOPType): { name: string; steps: SequenceStep[] } {
  if (ROTATION_FAMILY.has(type)) return { name: "diagRot", steps: diagRot() };
  return { name: "diagOsc", steps: diagOsc() };
}

// ---------------------------------------------------------------------------
// Expected primitive decomposition (from the LOOPType name).
// "flipped"/"rewound" are listed where they belong even though NEITHER detector
// has a code path to emit them — that absence is itself a finding.
// ---------------------------------------------------------------------------

const EXPECTED: Record<LOOPType, string[]> = {
  [LOOPType.ROTATED]: ["rotated"],
  [LOOPType.MIRRORED]: ["mirrored"],
  [LOOPType.FLIPPED]: ["flipped"],
  [LOOPType.SWAPPED]: ["swapped"],
  [LOOPType.INVERTED]: ["inverted"],
  [LOOPType.SWAPPED_INVERTED]: ["inverted", "swapped"],
  [LOOPType.ROTATED_INVERTED]: ["inverted", "rotated"],
  [LOOPType.MIRRORED_SWAPPED]: ["mirrored", "swapped"],
  [LOOPType.MIRRORED_INVERTED]: ["inverted", "mirrored"],
  [LOOPType.ROTATED_SWAPPED]: ["rotated", "swapped"],
  [LOOPType.MIRRORED_ROTATED]: ["mirrored", "rotated"],
  [LOOPType.MIRRORED_INVERTED_ROTATED]: ["inverted", "mirrored", "rotated"],
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: ["inverted", "mirrored", "swapped"],
  [LOOPType.ROTATED_SWAPPED_INVERTED]: ["inverted", "rotated", "swapped"],
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: ["mirrored", "rotated", "swapped"],
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: ["inverted", "mirrored", "rotated", "swapped"],
  [LOOPType.REWOUND]: ["rewound"],
};

const AUDIT_TYPES: LOOPType[] = [
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.FLIPPED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.REWOUND,
];

// ---------------------------------------------------------------------------
// Detector adapters
// ---------------------------------------------------------------------------

function funcComponents(steps: SequenceStep[]): string[] {
  return [...detectLOOPFromSteps(steps).components].map(String).sort();
}

function classComponents(steps: SequenceStep[]): string[] {
  const r = loopDetectorClass.detectLOOPType(steps);
  if (!r.spec || !r.spec.left) return [];
  return [...r.spec.left.components.keys()].map(String).sort();
}

function classLoopType(steps: SequenceStep[]): string {
  return String(loopDetectorClass.detectLOOPType(steps).loopType);
}

const setEq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface GenResult {
  steps: SequenceStep[] | null;
  fixture: string;
  richness: "rich" | "degenerate" | "gen-fail";
  note: string;
  letterStepCount: number;
  circular: boolean;
}

function generate(type: LOOPType): GenResult {
  const fx = fixtureFor(type);
  try {
    const full = executeLOOPSpec(fx.steps, loopSpecFromLegacy(type, 2));
    const letterSteps = full.filter((s) => (s.stepNumber ?? 0) > 0).length;
    const circular = isSequenceCircular(full);
    const rich = circular && letterSteps >= 8;
    return {
      steps: full,
      fixture: fx.name,
      richness: rich ? "rich" : "degenerate",
      note: rich ? "" : `letterSteps=${letterSteps}, circular=${circular}`,
      letterStepCount: letterSteps,
      circular,
    };
  } catch (e) {
    return {
      steps: null,
      fixture: fx.name,
      richness: "gen-fail",
      note: (e as Error).message.slice(0, 90),
      letterStepCount: 0,
      circular: false,
    };
  }
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

interface Row {
  type: string;
  detector: "functional" | "class";
  expected: string;
  actual: string;
  pass: boolean;
  richness: string;
  extra: string;
}

describe("loop-detection round-trip audit", () => {
  it("drives real executors + detectors and prints the recovery table", () => {
    const rows: Row[] = [];
    const genNotes: string[] = [];

    for (const type of AUDIT_TYPES) {
      const gen = generate(type);
      const expected = EXPECTED[type].slice().sort();
      genNotes.push(
        `${type.padEnd(34)} fixture=${gen.fixture.padEnd(8)} richness=${gen.richness.padEnd(10)} letterSteps=${String(gen.letterStepCount).padStart(3)} circular=${gen.circular}${gen.note ? "  (" + gen.note + ")" : ""}`,
      );

      if (!gen.steps) {
        for (const d of ["functional", "class"] as const) {
          rows.push({ type, detector: d, expected: expected.join("+"), actual: "GEN-FAIL", pass: false, richness: gen.richness, extra: gen.note });
        }
        continue;
      }

      const fc = funcComponents(gen.steps);
      const cc = classComponents(gen.steps);

      rows.push({
        type, detector: "functional",
        expected: expected.join("+"),
        actual: fc.join("+") || "(none)",
        pass: setEq(fc, expected),
        richness: gen.richness,
        extra: "",
      });
      rows.push({
        type, detector: "class",
        expected: expected.join("+"),
        actual: cc.join("+") || "(none)",
        pass: setEq(cc, expected),
        richness: gen.richness,
        extra: `loopType=${classLoopType(gen.steps)}`,
      });
    }

    /* eslint-disable no-console */
    console.log("\n================ GENERATION SUMMARY ================");
    for (const n of genNotes) console.log(n);

    console.log("\n================ DETECTOR RECOVERY TABLE (clean non-axis fixtures) ================");
    const header = `${"LOOPType".padEnd(34)} ${"detector".padEnd(11)} ${"richness".padEnd(9)} ${"expected".padEnd(26)} ${"actual".padEnd(26)} result`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const r of rows) {
      console.log(
        `${r.type.padEnd(34)} ${r.detector.padEnd(11)} ${r.richness.padEnd(9)} ${r.expected.padEnd(26)} ${r.actual.padEnd(26)} ${r.pass ? "PASS" : "FAIL"}${r.extra ? "  " + r.extra : ""}`,
      );
    }

    const fails = rows.filter((r) => !r.pass);
    const confirmed = fails.filter((r) => r.richness === "rich");
    const inconclusive = fails.filter((r) => r.richness !== "rich");
    console.log("\n================ FAILURE CLASSIFICATION ================");
    console.log(`${fails.length}/${rows.length} (type × detector) cells FAILED.`);
    console.log(`  CONFIRMED  (rich fixture): ${confirmed.length}`);
    console.log(`  INCONCLUSIVE (degenerate/gen-fail): ${inconclusive.length}`);
    console.log("\n-- CONFIRMED failures (rich fixture — empirically solid) --");
    for (const r of confirmed) console.log(`  ${r.type} [${r.detector}] expected {${r.expected}} got {${r.actual}} ${r.extra}`);
    if (inconclusive.length) {
      console.log("\n-- INCONCLUSIVE failures --");
      for (const r of inconclusive) console.log(`  ${r.type} [${r.detector}] (${r.richness}) expected {${r.expected}} got {${r.actual}} ${r.extra}`);
    }

    // ---- Characterization: same-motion-type hands (isolates the swap/invert alias) ----
    console.log("\n================ CHARACTERIZATION: opposite-type vs same-type hands ================");
    for (const t of [LOOPType.SWAPPED, LOOPType.INVERTED]) {
      const opp = executeLOOPSpec(diagOsc(), loopSpecFromLegacy(t, 2));
      const same = executeLOOPSpec(diagOscSameType(), loopSpecFromLegacy(t, 2));
      console.log(`${t} opposite-type(pro/anti): FUNC=[${funcComponents(opp).join("+") || "-"}] CLASS=[${classComponents(opp).join("+") || "-"}]`);
      console.log(`${t} same-type(pro/pro)     : FUNC=[${funcComponents(same).join("+") || "-"}] CLASS=[${classComponents(same).join("+") || "-"}]`);
    }

    // ---- Contrast: mirror on the AXIS orbit (phase-fragility of mirror detection) ----
    console.log("\n================ CONTRAST: pure MIRRORED, axis orbit vs diagonal orbit ================");
    const axisM = executeLOOPSpec(axisSweep(), loopSpecFromLegacy(LOOPType.MIRRORED, 2));
    const diagM = executeLOOPSpec(diagOsc(), loopSpecFromLegacy(LOOPType.MIRRORED, 2));
    console.log(`MIRRORED axis-orbit    : FUNC=[${funcComponents(axisM).join("+") || "-"}] CLASS=[${classComponents(axisM).join("+") || "-"}] loopType=${classLoopType(axisM)}`);
    console.log(`MIRRORED diagonal-orbit: FUNC=[${funcComponents(diagM).join("+") || "-"}] CLASS=[${classComponents(diagM).join("+") || "-"}] loopType=${classLoopType(diagM)}`);
    /* eslint-enable no-console */

    expect(rows.length).toBe(AUDIT_TYPES.length * 2);
  });

  // -----------------------------------------------------------------------
  // NON-REGRESSION GUARDS (hard assertions).
  // -----------------------------------------------------------------------

  it("pure MIRRORED must NOT report inverted", () => {
    const full = executeLOOPSpec(diagOsc(), loopSpecFromLegacy(LOOPType.MIRRORED, 2));
    expect(isSequenceCircular(full)).toBe(true);
    expect(funcComponents(full)).not.toContain("inverted");
    expect(classComponents(full)).not.toContain("inverted");
  });

  it("pure FLIPPED must NOT report inverted", () => {
    const full = executeLOOPSpec(diagOsc(), loopSpecFromLegacy(LOOPType.FLIPPED, 2));
    expect(isSequenceCircular(full)).toBe(true);
    expect(funcComponents(full)).not.toContain("inverted");
    expect(classComponents(full)).not.toContain("inverted");
  });

  it("pure INVERTED must report inverted in both detectors", () => {
    const full = executeLOOPSpec(diagOsc(), loopSpecFromLegacy(LOOPType.INVERTED, 2));
    expect(isSequenceCircular(full)).toBe(true);
    expect(funcComponents(full)).toContain("inverted");
    expect(classComponents(full)).toContain("inverted");
  });
});

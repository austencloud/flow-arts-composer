import { beforeAll, describe, expect, it } from "vitest";

import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";
import { deriveSequenceLetters } from "$lib/shared/create/services/sequence-transforms";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  updateSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
import { deriveMotionType } from "$lib/shared/render/core/calculations/orientation";

import { getAllLetterVariants } from "../../helpers/real-pictograph-loader";
import {
  AAAA_CCW,
  ALL_FIXTURE_LOOPS,
  ALL_FIXTURE_STEPS,
  FALG,
  GGGG_CW,
  GHGH,
  HHHH_CCW,
  HHHH_CW,
  PHI_PSI_LOOP,
  PHI_STEP,
  PSI_STEP,
  seamsOf,
} from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

const COLORS = [HandSide.LEFT, HandSide.RIGHT] as const;

function assertClosedLoop(seq: SequenceData): void {
  for (let i = 1; i < seq.steps.length; i++) {
    expect(seq.steps[i]!.startPlacement).toBe(seq.steps[i - 1]!.endPlacement);
  }
  expect(seq.steps.at(-1)!.endPlacement).toBe(seq.steps[0]!.startPlacement);
}

/**
 * A dataframe row reduced to the fields a fixture is allowed to assert on.
 * Orientations are deliberately absent — the CSV carries none; the parser
 * derives them from an assumed IN start.
 */
function rowKey(
  letter: Letter | null,
  startPlacement: string | null,
  endPlacement: string | null,
  left: MotionData,
  right: MotionData
): string {
  const hand = (m: MotionData) =>
    [m.motionType, m.rotationDirection, m.startLocation, m.endLocation].join("/");
  return [letter, startPlacement, endPlacement, hand(left), hand(right)].join(" | ");
}

describe("combination fixtures", () => {
  it("GGGG is a closed 4-step loop with placement continuity", () => {
    const seams = seamsOf(GGGG_CW);
    for (let i = 0; i < GGGG_CW.steps.length; i++) {
      expect(GGGG_CW.steps[i]!.startPlacement).toBe(seams[i]);
    }
    assertClosedLoop(GGGG_CW);
  });

  it("HHHH (ccw) is a closed 4-step loop", () => {
    assertClosedLoop(HHHH_CCW);
  });

  it("HHHH (cw) is a closed 4-step loop and is GGGG's rotation-faithful twin", () => {
    assertClosedLoop(HHHH_CW);
    // Same prop rotation as GGGG throughout, opposite motion type. That is the
    // entire content of "rotation-faithful": the prop keeps spinning cw.
    for (const step of HHHH_CW.steps) {
      for (const color of COLORS) {
        expect(step.motions[color].rotationDirection).toBe("cw");
        expect(step.motions[color].motionType).toBe("anti");
      }
    }
    for (const step of GGGG_CW.steps) {
      for (const color of COLORS) {
        expect(step.motions[color].rotationDirection).toBe("cw");
        expect(step.motions[color].motionType).toBe("pro");
      }
    }
    // Both cover the same four beta seams, in opposite order around the grid.
    expect([...seamsOf(HHHH_CW)].sort()).toEqual([...seamsOf(GGGG_CW)].sort());
  });

  it("AAAA is a closed 4-step loop", () => {
    assertClosedLoop(AAAA_CCW);
  });

  it("GHGH (Austen's fused example) is closed and alternates letters", () => {
    expect(GHGH.steps.map((s) => s.letter)).toEqual(["G", "H", "G", "H"]);
    for (let i = 1; i < GHGH.steps.length; i++) {
      expect(GHGH.steps[i]!.startPlacement).toBe(GHGH.steps[i - 1]!.endPlacement);
    }
    expect(GHGH.steps.at(-1)!.endPlacement).toBe(GHGH.steps[0]!.startPlacement);
  });

  it("FALG is Austen's closed 8-step card and crosses alpha/beta four times", () => {
    expect(FALG.steps.map((s) => s.letter)).toEqual([
      "F",
      "A",
      "L",
      "G",
      "F",
      "A",
      "L",
      "G",
    ]);
    assertClosedLoop(FALG);
    const seams = seamsOf(FALG);
    expect(seams.filter((p) => p.startsWith("alpha")).length).toBe(4);
    expect(seams.filter((p) => p.startsWith("beta")).length).toBe(4);
  });

  it("ΦΨΦΨ is a closed bridge loop touching both worlds on every step", () => {
    expect(PHI_PSI_LOOP.steps.map((s) => s.letter)).toEqual([
      "Φ",
      "Ψ",
      "Φ",
      "Ψ",
    ]);
    assertClosedLoop(PHI_PSI_LOOP);
    for (const step of PHI_PSI_LOOP.steps) {
      expect(step.startPlacement!.replace(/\d+$/, "")).not.toBe(
        step.endPlacement!.replace(/\d+$/, "")
      );
    }
  });

  it("every fixture's placements agree with getGridPlacementFromLocations", () => {
    // The mapper is canon. A fixture's transcribed placement label is correct
    // only if it equals the placement computed from that step's own motion
    // locations — otherwise the label is the bug, not the function.
    expect(ALL_FIXTURE_STEPS.length).toBe(32);
    for (const { name, step } of ALL_FIXTURE_STEPS) {
      const { left, right } = step.motions;
      expect(`${name} start=${step.startPlacement}`).toBe(
        `${name} start=${getGridPlacementFromLocations(
          left.startLocation,
          right.startLocation
        )}`
      );
      expect(`${name} end=${step.endPlacement}`).toBe(
        `${name} end=${getGridPlacementFromLocations(
          left.endLocation,
          right.endLocation
        )}`
      );
    }
  });

  it("every fixture motion's motionType is derivable from its own fields", () => {
    // motionType is a FUNCTION of (hand path, rotation direction, turns).
    // Without this check, corrupting a pro→anti or a cw→ccw still ships green.
    for (const { name, step } of ALL_FIXTURE_STEPS) {
      for (const color of COLORS) {
        const m = step.motions[color];
        expect(`${name} ${color}=${m.motionType}`).toBe(
          `${name} ${color}=${deriveMotionType(
            m.startLocation,
            m.endLocation,
            m.rotationDirection,
            m.turns
          )}`
        );
      }
    }
  });

  it("every fixture sequence's start placement matches its first step's seam", () => {
    for (const [name, seq] of ALL_FIXTURE_LOOPS) {
      const first = seq.steps[0]!;
      expect(seq.startPlacement?.startPlacement, name).toBe(first.startPlacement);
      expect(seq.startPlacement?.endPlacement, name).toBe(first.startPlacement);
      expect(seq.startPlacement?.gridPlacement, name).toBe(first.startPlacement);
      // Static both-hands hold: nothing moves, nothing rotates.
      for (const color of COLORS) {
        const hold = seq.startPlacement!.motions[color]!;
        const live = first.motions[color];
        expect(hold.motionType).toBe("static");
        expect(hold.rotationDirection).toBe("noRotation");
        expect(hold.startLocation).toBe(live.startLocation);
        expect(hold.endLocation).toBe(live.startLocation);
        expect(hold.startOrientation).toBe(live.startOrientation);
        expect(hold.endOrientation).toBe(live.startOrientation);
      }
    }
  });

  it("every loop fixture is a fixpoint of recalculateAllOrientations", () => {
    // The Task-9 contract: splicing these blocks must never need to rewrite an
    // orientation, because each loop's chain already closes on itself.
    const chainOf = (seq: SequenceData) =>
      seq.steps.map((s) =>
        COLORS.map(
          (c) =>
            `${s.motions[c].startOrientation}>${s.motions[c].endOrientation}`
        ).join(",")
      );
    for (const [name, seq] of ALL_FIXTURE_LOOPS) {
      expect(chainOf(recalculateAllOrientations(seq)), `${name}`).toEqual(
        chainOf(seq)
      );
    }
  });

  it("canonical arrow locations are applied, including the dash special cases", () => {
    // A dash's arrow location depends on the OTHER hand, so a per-motion
    // calculation gets it wrong. These are the values production's
    // ArrowLocationCalculator produces.
    expect(PSI_STEP.motions.left.arrowLocation).toBe("n"); // static -> start
    expect(PSI_STEP.motions.right.arrowLocation).toBe("w"); // dash s->n
    expect(PHI_STEP.motions.left.arrowLocation).toBe("w"); // dash s->n
    expect(PHI_STEP.motions.right.arrowLocation).toBe("s"); // static -> start
    // Shifts land on the intercardinal between their endpoints.
    expect(GGGG_CW.steps[0]!.motions.left.arrowLocation).toBe("ne"); // n->e
    expect(FALG.steps[0]!.motions.left.arrowLocation).toBe("sw"); // s->w
    for (const { name, step } of ALL_FIXTURE_STEPS) {
      for (const color of COLORS) {
        expect(
          step.motions[color].arrowLocation,
          `${name} ${color}`
        ).toBeTruthy();
      }
    }
  });

  it("Ψ and Φ steps carry dash/static motions", () => {
    expect(PSI_STEP.letter).toBe("Ψ");
    expect(PHI_STEP.letter).toBe("Φ");
    expect(PSI_STEP.motions.left.motionType).toBe("static");
    expect(PSI_STEP.motions.right.motionType).toBe("dash");
    expect(PHI_STEP.motions.left.motionType).toBe("dash");
    expect(PHI_STEP.motions.right.motionType).toBe("static");
  });

  it("Ψ and Φ bridge the alpha and beta worlds the fixtures live in", () => {
    // The engine's impossibility story (AAAA + GGGG needs an ambient bridge)
    // depends on these two steps actually touching both families.
    expect(PSI_STEP.startPlacement).toBe("alpha5");
    expect(PSI_STEP.endPlacement).toBe("beta1");
    expect(PHI_STEP.startPlacement).toBe("beta5");
    expect(PHI_STEP.endPlacement).toBe("alpha5");
    expect(seamsOf(AAAA_CCW)).toContain(PSI_STEP.startPlacement);
    expect(seamsOf(GGGG_CW)).toContain(PSI_STEP.endPlacement);
    expect(seamsOf(GGGG_CW)).toContain(PHI_STEP.startPlacement);
    // AAAA and GGGG genuinely share no seam — the premise of the ambient tests.
    const alpha = new Set<string>(seamsOf(AAAA_CCW));
    expect(seamsOf(GGGG_CW).some((p) => alpha.has(p))).toBe(false);
  });
});

describe("combination fixtures vs the diamond dataframe", () => {
  const rowsByLetter = new Map<Letter, Set<string>>();

  beforeAll(async () => {
    await loadPictographDatasetForTests();
    const letters = new Set(
      ALL_FIXTURE_STEPS.map(({ step }) => step.letter).filter(
        (l): l is Letter => l !== null
      )
    );
    for (const letter of letters) {
      const variants = await getAllLetterVariants(letter, GridMode.DIAMOND);
      rowsByLetter.set(
        letter,
        new Set(
          variants.map((v) =>
            rowKey(
              v.letter ?? null,
              v.startPlacement ?? null,
              v.endPlacement ?? null,
              v.motions.left!,
              v.motions.right!
            )
          )
        )
      );
    }
  });

  it("the dataset bootstrap really hydrates the production pipeline", async () => {
    // Exercises the bootstrap for real: motionQueryHandler answers ONLY if
    // loadPictographDatasetForTests injected the CSVs (getAllLetterVariants
    // does its own disk read and would stay green without it).
    await loadPictographDatasetForTests();
    const first = GGGG_CW.steps[0]!;
    expect(
      await motionQueryHandler.findLetterByMotionConfiguration(
        first.motions.left,
        first.motions.right,
        GridMode.DIAMOND
      )
    ).toBe("G");

    expect(rowsByLetter.size).toBe(7); // G H A F L Φ Ψ
    for (const [letter, rows] of rowsByLetter) {
      expect(rows.size, `${letter} variants`).toBeGreaterThan(0);
    }
  });

  it("FALG round-trips through deriveSequenceLetters", async () => {
    // Every FALG step re-derives its own letter from its motions alone, through
    // the same handler the create module uses. Letters are BLANKED first —
    // deriveSequenceLetters keeps the existing letter when a lookup fails, so
    // deriving from the authored copy would pass even with a dead handler.
    await loadPictographDatasetForTests();
    const blanked = updateSequenceData(FALG, {
      steps: FALG.steps.map((step) => ({ ...step, letter: null })),
    });
    expect(blanked.steps.every((s) => s.letter === null)).toBe(true);
    const derived = await deriveSequenceLetters(blanked, motionQueryHandler);
    expect(derived.steps.map((s) => s.letter)).toEqual([
      "F",
      "A",
      "L",
      "G",
      "F",
      "A",
      "L",
      "G",
    ]);
  });

  it("every fixture step is a real row of DiamondPictographDataframe.csv", () => {
    for (const { name, step } of ALL_FIXTURE_STEPS) {
      const key = rowKey(
        step.letter,
        step.startPlacement,
        step.endPlacement,
        step.motions.left,
        step.motions.right
      );
      const rows = rowsByLetter.get(step.letter as Letter);
      expect(
        rows,
        `${name}: letter ${step.letter} missing from dataframe`
      ).toBeDefined();
      expect(
        rows!.has(key)
          ? key
          : `${key}\n  NOT FOUND AMONG:\n  ${[...rows!].join("\n  ")}`,
        `${name} is not a dataframe row`
      ).toBe(key);
    }
  });

  it("the standalone Ψ/Φ steps are dataframe rows too", () => {
    for (const step of [PSI_STEP, PHI_STEP] as StepData[]) {
      const rows = rowsByLetter.get(step.letter as Letter)!;
      expect(
        rows.has(
          rowKey(
            step.letter,
            step.startPlacement,
            step.endPlacement,
            step.motions.left,
            step.motions.right
          )
        ),
        `${step.letter} ${step.startPlacement}>${step.endPlacement}`
      ).toBe(true);
    }
  });
});

// tests/generation/prop-relationship-build.test.ts
/**
 * The prop relationship option survives the whole build: allocation forcing,
 * candidate filtering, spin forcing on dash and static, start orientation
 * derivation, and the post-build report. Production dataframes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import { SequenceBuilder } from "../../src/generation/index.js";
import type { BuildResult } from "../../src/generation/builder/SequenceBuilder.js";
import { ConstraintType } from "../../src/generation/constraints/constraint-types.js";
import {
  classifyPropRelationship,
  reportPropRelationship,
} from "../../src/generation/prop-relationship.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const diamond = () =>
  new SequenceBuilder(new CsvVariationProvider(loadDiamondVariations()));
const box = () =>
  new SequenceBuilder(new CsvVariationProvider(loadBoxVariations()));
const builderFor = (gridMode: "diamond" | "box") =>
  gridMode === "box" ? box() : diamond();

function propDetail(result: BuildResult) {
  return result.constraintReport.details.find(
    (d) => d.constraint === ConstraintType.PROP_RELATIONSHIP
  );
}

function dataset(m: MotionData): MotionData {
  const withPrefloat = m as MotionData & {
    prefloatMotionType?: string;
    prefloatRotationDirection?: string;
  };
  return {
    ...m,
    motionType: (withPrefloat.prefloatMotionType ??
      m.motionType) as MotionData["motionType"],
    rotationDirection: (withPrefloat.prefloatRotationDirection ??
      m.rotationDirection) as MotionData["rotationDirection"],
  };
}

function expectHands(result: BuildResult, options: HandRelationshipOptions) {
  for (const step of result.sequence.slice(1)) {
    expect(
      handRelationshipHolds(
        dataset(step.motions.left as unknown as MotionData),
        dataset(step.motions.right as unknown as MotionData),
        options
      ),
      `step ${step.stepNumber} (${step.letter})`
    ).toBe(true);
  }
}

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../static/data/learn/letter-mappings.json",
            import.meta.url
          ),
          "utf8"
        )
      ),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

describe("allocation under a prop timing", () => {
  it("gives both hands equal, non-float turns at level 3", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 3,
        constraintOptions: {
          propRelationship: { direction: "same", timing: "tog" },
        },
      });
      expect(result.turnAllocation.left).toEqual(result.turnAllocation.right);
      expect(result.turnAllocation.left).not.toContain("fl");
      for (const step of result.sequence.slice(1)) {
        expect(step.motions.left.turns).toBe(step.motions.right.turns);
      }
    }
  });

  it("leaves turns independent with a direction alone", () => {
    let differed = false;
    for (let i = 0; i < 10 && !differed; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        constraintOptions: { propRelationship: { direction: "opp" } },
      });
      differed = result.turnAllocation.left.some(
        (t, idx) => t !== result.turnAllocation.right[idx]
      );
    }
    expect(differed).toBe(true);
  });
});

describe("spin forcing without a hand relationship", () => {
  it("makes every turned dash or static spin opposite its partner", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        constraintOptions: {
          propRelationship: { direction: "opp" },
          dashPreference: "maximize",
        },
      });
      for (const step of result.sequence.slice(1)) {
        const reading = classifyPropRelationship(
          step.motions.left,
          step.motions.right
        );
        if (reading.kind === "float") continue;
        expect(
          reading.direction,
          `step ${step.stepNumber} (${step.letter})`
        ).toBe("opp");
      }
    }
  });
});

describe("start orientation under a prop timing", () => {
  it("derives the left start from the right one", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 2,
      rightStartOrientation: "in",
      constraintOptions: {
        propRelationship: { direction: "same", timing: "split" },
      },
    });
    const start = result.sequence[0]!;
    expect(start.motions.right.startOrientation).toBe("in");
    expect(
      classifyPropRelationship(
        { ...start.motions.left, rotationDirection: "cw", motionType: "pro" },
        { ...start.motions.right, rotationDirection: "cw", motionType: "pro" }
      )
    ).toEqual({ kind: "full", direction: "same", timing: "split" });
    expect(propDetail(result)?.score).toBe(1);
  });

  it("derives the right start from the left one", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 2,
      leftStartOrientation: "in",
      constraintOptions: {
        propRelationship: { direction: "same", timing: "split" },
      },
    });
    const start = result.sequence[0]!;
    expect(start.motions.left.startOrientation).toBe("in");
    expect(
      classifyPropRelationship(
        { ...start.motions.left, rotationDirection: "cw", motionType: "pro" },
        { ...start.motions.right, rotationDirection: "cw", motionType: "pro" }
      )
    ).toEqual({ kind: "full", direction: "same", timing: "split" });
    expect(propDetail(result)?.score).toBe(1);
  });

  it("keeps a contradicting caller pair and reports it instead of throwing", () => {
    // alpha1 starts left at s and right at n; both "in" already sits at
    // Split under Same (see the derivation test above), so pinning both and
    // asking for Together is the genuine contradiction here.
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 2,
      leftStartOrientation: "in",
      rightStartOrientation: "in",
      startPlacement: "alpha1",
      constraintOptions: {
        propRelationship: { direction: "same", timing: "tog" },
      },
    });
    expect(result.sequence[0]!.motions.left.startOrientation).toBe("in");
    expect(result.sequence[0]!.motions.right.startOrientation).toBe("in");
    const detail = propDetail(result);
    expect(detail).toBeDefined();
    expect(detail!.score).toBeLessThan(1);
    expect(detail!.description).toMatch(/first miss at step 1/);
    expect(result.constraintReport.satisfied).toBe(false);
  });
});

describe("the One-or-both table", () => {
  const TO: HandRelationshipOptions = { map: "reflect-north-south" };
  for (const gridMode of ["diamond", "box"] as const) {
    for (const level of [2, 3] as const) {
      it(`${gridMode} L${level} hands only: relationship holds, no prop report`, () => {
        const result = builderFor(gridMode).build({
          length: 6,
          gridMode,
          level,
          constraintOptions: { handRelationship: TO },
        });
        expectHands(result, TO);
        expect(propDetail(result)).toBeUndefined();
      });

      it(`${gridMode} L${level} props only: Split Same holds on every spinning beat`, () => {
        for (let i = 0; i < 3; i++) {
          const result = builderFor(gridMode).build({
            length: 6,
            gridMode,
            level,
            constraintOptions: {
              propRelationship: { direction: "same", timing: "split" },
            },
          });
          const report = reportPropRelationship(result.sequence, {
            direction: "same",
            timing: "split",
          });
          expect(report.offending, JSON.stringify(report)).toBe(0);
          expect(propDetail(result)?.score).toBe(1);
        }
      });

      it(`${gridMode} L${level} both: hands TO and props Split Same`, () => {
        for (let i = 0; i < 3; i++) {
          // Reflection flips the spin; Same props want it flipped back.
          const hands = { map: TO.map, inverted: true } as const;
          const result = builderFor(gridMode).build({
            length: 6,
            gridMode,
            level,
            constraintOptions: {
              handRelationship: hands,
              propRelationship: { direction: "same", timing: "split" },
            },
          });
          expectHands(result, hands);
          expect(
            reportPropRelationship(result.sequence, {
              direction: "same",
              timing: "split",
            }).offending
          ).toBe(0);
        }
      });
    }
  }

  it("diamond L2 both: hands TO natural and props Together Opposite", () => {
    for (let i = 0; i < 3; i++) {
      const result = diamond().build({
        length: 6,
        gridMode: "diamond",
        level: 2,
        constraintOptions: {
          handRelationship: TO,
          propRelationship: { direction: "opp", timing: "tog" },
        },
      });
      expectHands(result, TO);
      expect(
        reportPropRelationship(result.sequence, {
          direction: "opp",
          timing: "tog",
        }).offending
      ).toBe(0);
    }
  });
});

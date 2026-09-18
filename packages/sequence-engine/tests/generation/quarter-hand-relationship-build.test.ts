// tests/generation/quarter-hand-relationship-build.test.ts
/**
 * The four Quarter maps prune candidates the same way the original four do.
 * A quarter turn or a diagonal reflection is compatible with fewer letters,
 * so lengths stay short and the builder gets several rolls.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import { SequenceBuilder } from "../../src/generation/index.js";
import {
  handRelationshipHolds,
  type HandRelationshipMap,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const QUARTER_MAPS: HandRelationshipMap[] = [
  "rotate-90-cw",
  "rotate-90-ccw",
  "reflect-northeast-southwest",
  "reflect-northwest-southeast",
];

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

describe("SequenceBuilder with a Quarter hand relationship", () => {
  for (const gridMode of ["diamond", "box"] as const) {
    const provider = new CsvVariationProvider(
      gridMode === "box" ? loadBoxVariations() : loadDiamondVariations()
    );
    for (const map of QUARTER_MAPS) {
      for (const inverted of [false, true]) {
        it(`${gridMode} ${map} inverted=${inverted}: every step relates`, () => {
          const options = { map, inverted };
          const result = new SequenceBuilder(provider).build({
            length: 6,
            gridMode,
            level: 2,
            constraintOptions: { handRelationship: options },
          });
          expect(result.sequence.length).toBe(7);
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
        });
      }
    }
  }
});

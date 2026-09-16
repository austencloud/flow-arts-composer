import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateEndOrientation } from "@tka/sequence-engine/core";
import { Plane } from "@austencloud/scene-3d";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
  extractStepPairings,
} from "$lib/shared/foundation/services/sequence-decomposer";
import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { gridLocationToPosition3D } from "$lib/shared/3d/services/plane-coordinate-mapper";
import { isSeamlesslyLoopable3D } from "$lib/shared/3d/services/sequence-loopability-3d";
import {
  lookupLetter,
  parseCsvEdges,
} from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import {
  computeHash,
  HASH_VERSION_V2,
  HASH_VERSION_V3,
} from "$lib/shared/library/services/sequence-content-hasher";
import { MotionDataSchema } from "$lib/shared/pictograph/shared/domain/schemas/pictograph-schemas";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { isSeamlesslyLoopable3D } from "$lib/shared/3d/services/sequence-loopability-3d";

type CorpusMotion = {
  hand: "left" | "right";
  motionType: "anti";
  rotationDirection: "cw" | "ccw";
  startLocation: "n" | "e" | "s" | "w";
  endLocation: "n" | "e" | "s" | "w";
  turns: 1;
  startOrientation: "out";
  endOrientation: "out";
  plane: "wall" | "wheel" | "floor";
};

type CorpusStep = {
  stepNumber: number;
  letter: string;
  startPlacement: string;
  endPlacement: string;
  duration: 1;
  motions: { left: CorpusMotion; right: CorpusMotion };
};

type CorpusSequence = {
  word: string;
  displayName: string;
  metadata: {
    source: string;
    sourceReference: string;
    sourceCommit: string;
    attribution: { credit: string; note: string };
  };
  steps: CorpusStep[];
  [key: string]: unknown;
};

const corpus = JSON.parse(
  readFileSync(
    resolve("docs/research/spiroanim/qst-228-sequences.json"),
    "utf8"
  )
) as CorpusSequence[];
const edges = parseCsvEdges(
  readFileSync(
    resolve("static/data/pictographs/DiamondPictographDataframe.csv"),
    "utf8"
  )
);

const hands = ["left", "right"] as const;

function worldPosition(motion: CorpusMotion, boundary: "start" | "end") {
  return gridLocationToPosition3D(
    motion.plane as Plane,
    boundary === "start" ? motion.startLocation : motion.endLocation,
    1
  );
}

function asSequenceData(sequence: CorpusSequence): SequenceData {
  return {
    ...sequence,
    id: sequence.metadata.sourceReference,
    name: sequence.word,
    thumbnails: [],
    tags: [],
    isFavorite: false,
    isCircular: true,
    metadata: sequence.metadata,
  } as unknown as SequenceData;
}

describe("SpiroAnim Quarter Space Tech archive", () => {
  it("contains the complete finite catalog from the pinned source commit", () => {
    const counts = corpus.reduce<Record<string, number>>(
      (bySeries, sequence) => {
        const series = sequence.metadata.sourceReference.split("-", 1)[0]!;
        bySeries[series] = (bySeries[series] ?? 0) + 1;
        return bySeries;
      },
      {}
    );
    const lengthCounts = corpus.reduce<Record<number, number>>(
      (byLength, sequence) => {
        byLength[sequence.steps.length] =
          (byLength[sequence.steps.length] ?? 0) + 1;
        return byLength;
      },
      {}
    );

    expect(counts).toEqual({ breaks: 56, advanced: 64, beyond: 108 });
    expect(lengthCounts).toEqual({ 4: 32, 6: 8, 8: 188 });
    expect(
      corpus.reduce((sum, sequence) => sum + sequence.steps.length, 0)
    ).toBe(1680);
    expect(
      new Set(corpus.map((sequence) => sequence.metadata.sourceReference)).size
    ).toBe(228);
    expect(
      new Set(corpus.map((sequence) => sequence.metadata.sourceCommit))
    ).toEqual(new Set(["6bd56cde61c82bd9a047727ceff70d22428113d3"]));
  });

  it("resolves every source transition to a canonical letter and orientation", () => {
    let checkedMotions = 0;
    for (const sequence of corpus) {
      expect(sequence.word).toBe(
        sequence.steps.map(({ letter }) => letter).join("")
      );
      for (const step of sequence.steps) {
        expect(
          lookupLetter(edges, {
            startPlacement: step.startPlacement,
            endPlacement: step.endPlacement,
            left: step.motions.left,
            right: step.motions.right,
          })
        ).toBe(step.letter);

        for (const hand of hands) {
          const motion = step.motions[hand];
          expect(
            calculateEndOrientation({
              motionType: motion.motionType,
              turns: motion.turns,
              rotationDirection: motion.rotationDirection,
              startLocation: motion.startLocation,
              endLocation: motion.endLocation,
              startOrientation: motion.startOrientation,
            })
          ).toBe(motion.endOrientation);
          checkedMotions++;
        }
      }
    }
    expect(checkedMotions).toBe(3360);
  });

  it("is continuous and closed in world space across plane changes", () => {
    let localCoordinateReexpressions = 0;
    for (const sequence of corpus) {
      for (const hand of hands) {
        for (let index = 1; index < sequence.steps.length; index++) {
          const previous = sequence.steps[index - 1]!.motions[hand];
          const current = sequence.steps[index]!.motions[hand];
          if (previous.endLocation !== current.startLocation) {
            localCoordinateReexpressions++;
          }
          expect(
            worldPosition(previous, "end").distanceTo(
              worldPosition(current, "start")
            )
          ).toBeLessThan(1e-6);
        }

        const first = sequence.steps[0]!.motions[hand];
        const last = sequence.steps.at(-1)!.motions[hand];
        expect(
          worldPosition(last, "end").distanceTo(worldPosition(first, "start"))
        ).toBeLessThan(1e-6);
      }
    }
    expect(localCoordinateReexpressions).toBe(28);
  });

  it("keeps every pattern loopable when a seam changes local plane coordinates", () => {
    const sequences = corpus.map(asSequenceData);
    expect(
      sequences.filter((sequence) => isSeamlesslyLoopable(sequence))
    ).toHaveLength(224);
    expect(
      sequences.filter((sequence) => isSeamlesslyLoopable3D(sequence))
    ).toHaveLength(228);
  });

  it("preserves authored planes through schema and compositional round trips", () => {
    const source = corpus.find((sequence) =>
      sequence.steps.some(
        (step) =>
          step.motions.left.plane !== Plane.WALL ||
          step.motions.right.plane !== Plane.WALL
      )
    )!;
    const sequence = asSequenceData(source);
    const left = extractLeftSoloProp(sequence);
    const right = extractRightSoloProp(sequence);
    const derived = deriveSteps(left, right, extractStepPairings(sequence));

    expect(
      derived.map((step) => [
        step.motions.left?.plane,
        step.motions.right?.plane,
      ])
    ).toEqual(
      source.steps.map((step) => [
        step.motions.left.plane,
        step.motions.right.plane,
      ])
    );
    expect(MotionDataSchema.parse(source.steps[0]!.motions.left).plane).toBe(
      source.steps[0]!.motions.left.plane
    );
  });

  it("uses plane-aware V3 identity to keep all 228 sequences distinct", async () => {
    const v2 = new Set<string>();
    const v3 = new Set<string>();
    for (const sequence of corpus) {
      const data = asSequenceData(sequence);
      v2.add(await computeHash(data, HASH_VERSION_V2));
      v3.add(await computeHash(data, HASH_VERSION_V3));
    }

    expect(v2.size).toBe(198);
    expect(v3.size).toBe(228);
  });

  it("credits Mentive's documents and Alex Kurowski's underlying grid", () => {
    for (const sequence of corpus) {
      expect(sequence.metadata.attribution.credit).toBe(
        "Quarter Space Tech source documents by Mentive (@rbgirard), based on Alex Kurowski's grid"
      );
      expect(sequence.metadata.attribution.note).toBe(
        "These sequences translate Mentive's documented patterns from SpiroAnim into Flow Arts Composer."
      );
    }
  });
});

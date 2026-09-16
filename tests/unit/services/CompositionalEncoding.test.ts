import { describe, expect, it } from "vitest";
import { compressForQR, decompressFromQR } from "$lib/shared/navigation/services/sequence-codec";
import { encodeSequence, decodeSequence, encodeSequenceForQR, decodeSequenceFromQR, isInlineEncoded } from "$lib/shared/navigation/services/sequence-encoder";
import { CompositionalDecoder } from "$lib/shared/qr/services/compositional-decoder";
import { CompositionalEncoder } from "$lib/shared/qr/services/compositional-encoder";
import {
  RECIPE_PREFIX,
  LOOP_TYPE_TAGS,
  TAG_TO_LOOP_TYPE,
} from "$lib/shared/qr/services/types";
import { computeRecipeHash } from "$lib/shared/qr/services/compositional-utils";
import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
import { strictRotatedLOOPExecutor } from "$lib/features/create/generate/circular/services/strict-rotated-loop-executor";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function makeStep(
  stepNumber: number,
  left: Partial<Parameters<typeof createMotionData>[0]>,
  right: Partial<Parameters<typeof createMotionData>[0]>
): StepData {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({ ...left, hand: HandSide.LEFT }),
      right: createMotionData({ ...right, hand: HandSide.RIGHT }),
    },
  };
}

function makeStartPlacement(
  left: Partial<Parameters<typeof createMotionData>[0]>,
  right: Partial<Parameters<typeof createMotionData>[0]>
): StepData {
  return makeStep(0, left, right);
}

function buildTestSequence(steps: StepData[]): SequenceData {
  const startPos = steps.find((s) => s.stepNumber === 0);
  const actualSteps = steps.filter((s) => s.stepNumber > 0);

  return createSequenceData({
    word: "TEST",
    name: "Test Sequence",
    steps: actualSteps,
    ...(startPos && {
      startPlacement: {
        id: startPos.id,
        letter: startPos.letter,
        gridPlacement: startPos.startPlacement,
        startPlacement: startPos.startPlacement,
        endPlacement: startPos.endPlacement,
        motions: startPos.motions,
      },
    }),
  });
}

function buildSimple3StepSequence(): SequenceData {
  return buildTestSequence([
    makeStartPlacement(
      {
        motionType: MotionType.STATIC,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        turns: 0,
        propType: PropType.STAFF,
      },
      {
        motionType: MotionType.STATIC,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
        turns: 0,
        propType: PropType.STAFF,
      }
    ),
    makeStep(
      1,
      {
        motionType: MotionType.PRO,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.CLOCKWISE,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        turns: 1,
        propType: PropType.STAFF,
      },
      {
        motionType: MotionType.ANTI,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startOrientation: Orientation.CLOCK,
        endOrientation: Orientation.COUNTER,
        turns: 1,
        propType: PropType.STAFF,
      }
    ),
    makeStep(
      2,
      {
        motionType: MotionType.PRO,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.CLOCKWISE,
        turns: 1,
        propType: PropType.STAFF,
      },
      {
        motionType: MotionType.ANTI,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.NORTH,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turns: 1,
        propType: PropType.STAFF,
      }
    ),
    makeStep(
      3,
      {
        motionType: MotionType.STATIC,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        propType: PropType.STAFF,
      },
      {
        motionType: MotionType.STATIC,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        propType: PropType.STAFF,
      }
    ),
  ]);
}

describe("CompositionalEncoding", () => {

  describe("LOOP_TYPE_TAGS", () => {
    it("maps all single-transform LOOP types to compact tags", () => {
      expect(LOOP_TYPE_TAGS["rotated"]).toBe("sr");
      expect(LOOP_TYPE_TAGS["mirrored"]).toBe("sm");
      expect(LOOP_TYPE_TAGS["flipped"]).toBe("sf");
      expect(LOOP_TYPE_TAGS["swapped"]).toBe("ss");
      expect(LOOP_TYPE_TAGS["inverted"]).toBe("si");
      expect(LOOP_TYPE_TAGS["strict_rewound"]).toBe("rw");
    });

    it("does not include compound LOOP types", () => {
      expect(LOOP_TYPE_TAGS["swapped_inverted"]).toBeUndefined();
      expect(LOOP_TYPE_TAGS["rotated_inverted"]).toBeUndefined();
      expect(LOOP_TYPE_TAGS["mirrored_swapped"]).toBeUndefined();
    });

    it("has reverse lookup for every tag", () => {
      for (const [loopType, tag] of Object.entries(LOOP_TYPE_TAGS)) {
        expect(TAG_TO_LOOP_TYPE[tag]).toBe(loopType);
      }
    });
  });

  describe("RECIPE_PREFIX", () => {
    it("is 'r1:'", () => {
      expect(RECIPE_PREFIX).toBe("r1:");
    });
  });

  describe("encodeForQR/decodeFromQR: flat encoding still works", () => {
    it("non-LOOP sequences use flat encoding (s~q1: or s~d1: or s~raw: format)", async () => {
      const seq = buildSimple3StepSequence();
      const encoded = await encodeSequenceForQR(seq);

      expect(encoded.startsWith("s~")).toBe(true);
      expect(encoded.startsWith("s~r1:")).toBe(false);
      const payload = encoded.slice(2);
      expect(
        payload.startsWith("q1:") || payload.startsWith("d1:") || payload.startsWith("raw:")
      ).toBe(true);
    });

    it("round-trips non-LOOP sequences through encodeForQR/decodeFromQR", async () => {
      const seq = buildSimple3StepSequence();
      const encoded = await encodeSequenceForQR(seq);
      const decoded = await decodeSequenceFromQR(encoded);

      expect(decoded.steps).toHaveLength(3);

      expect(decoded.steps[0].motions.left!.motionType).toBe(MotionType.PRO);
      expect(decoded.steps[0].motions.right!.motionType).toBe(MotionType.ANTI);
      expect(decoded.steps[0].motions.left!.startLocation).toBe(
        GridLocation.NORTH
      );
      expect(decoded.steps[0].motions.left!.endLocation).toBe(
        GridLocation.EAST
      );
    });
  });

  describe("compositional duration encoding", () => {
    it("preserves a custom seed duration through the r1 recipe path", async () => {
      const startPlacement = {
        ...makeStartPlacement(
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            turns: 0,
          },
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
          }
        ),
        startPlacement: GridPlacement.ALPHA1,
        endPlacement: GridPlacement.ALPHA1,
      };
      const seed = {
        ...makeStep(
          1,
          {
            motionType: MotionType.PRO,
            rotationDirection: RotationDirection.CLOCKWISE,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.WEST,
            turns: 0,
          },
          {
            motionType: MotionType.PRO,
            rotationDirection: RotationDirection.CLOCKWISE,
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.EAST,
            turns: 0,
          }
        ),
        startPlacement: GridPlacement.ALPHA1,
        endPlacement: GridPlacement.ALPHA3,
        duration: 5,
      };
      const completed = strictRotatedLOOPExecutor.executeLOOP(
        [startPlacement, seed],
        Period.QUARTERED
      );
      const sequence = buildTestSequence(completed);

      registerLoopDetector({
        detectLOOPType: () => ({
          isCircular: true,
          loopType: "rotated",
          period: Period.QUARTERED,
          confidence: "strict",
        }),
      } as Parameters<typeof registerLoopDetector>[0]);

      const flatEncoded = encodeSequence(sequence);
      const encoder = new CompositionalEncoder(
        { encode: encodeSequence },
        { decode: decodeSequence },
        { compressString: compressForQR }
      );
      const recipe = await encoder.tryEncode(flatEncoded, sequence);

      expect(recipe?.startsWith("r1:")).toBe(true);
      const decoded = await decodeSequenceFromQR(`s~${recipe}`);
      expect(decoded.steps.map((step) => step.duration)).toEqual([5, 5, 5, 5]);
    });
  });

  describe("CompositionalDecoder", () => {
    it("isRecipeEncoded correctly identifies recipe strings", () => {
      const decoder = new CompositionalDecoder(
        { encode: (s) => encodeSequence(s) },
        { decode: (s) => decodeSequence(s) },
        {
          decompressString: (s) =>
            decompressFromQR(s),
        }
      );

      expect(decoder.isRecipeEncoded("r1:sr:abc12345:data")).toBe(true);
      expect(decoder.isRecipeEncoded("z:compressed")).toBe(false);
      expect(decoder.isRecipeEncoded("raw|data")).toBe(false);
    });

    it("rejects unknown LOOP type tags", async () => {
      const decoder = new CompositionalDecoder(
        { encode: (s) => encodeSequence(s) },
        { decode: (s) => decodeSequence(s) },
        {
          decompressString: () => null,
        }
      );

      await expect(
        decoder.decode("r1:xx:abc12345:data")
      ).rejects.toThrow('Unknown LOOP type tag: "xx"');
    });

    it("rejects malformed recipe strings", async () => {
      const decoder = new CompositionalDecoder(
        { encode: (s) => encodeSequence(s) },
        { decode: (s) => decodeSequence(s) },
        { decompressString: () => null }
      );

      await expect(decoder.decode("r1:sr")).rejects.toThrow(
        "Invalid recipe format"
      );
    });

    it("rejects strings without recipe prefix", async () => {
      const decoder = new CompositionalDecoder(
        { encode: (s) => encodeSequence(s) },
        { decode: (s) => decodeSequence(s) },
        { decompressString: () => null }
      );

      await expect(decoder.decode("z:compressed")).rejects.toThrow(
        "Not a recipe-encoded string"
      );
    });

    it("rejects decompression failures", async () => {
      const decoder = new CompositionalDecoder(
        { encode: (s) => encodeSequence(s) },
        { decode: (s) => decodeSequence(s) },
        { decompressString: () => null }
      );

      await expect(
        decoder.decode("r1:sr:abc12345:corruptdata")
      ).rejects.toThrow("Failed to decompress seed data");
    });
  });

  describe("computeRecipeHash", () => {
    it("produces an 8-character hex string", async () => {
      const hash = await computeRecipeHash("test data");
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it("produces different hashes for different inputs", async () => {
      const hash1 = await computeRecipeHash("sequence A");
      const hash2 = await computeRecipeHash("sequence B");
      expect(hash1).not.toBe(hash2);
    });

    it("produces consistent hashes for the same input", async () => {
      const hash1 = await computeRecipeHash("deterministic");
      const hash2 = await computeRecipeHash("deterministic");
      expect(hash1).toBe(hash2);
    });
  });

  describe("isInlineEncoded", () => {
    it("detects s~ prefix", () => {
      expect(isInlineEncoded("s~d1:compressed")).toBe(true);
      expect(isInlineEncoded("s~q1:compressed")).toBe(true);
      expect(isInlineEncoded("s~r1:sr:abc:data")).toBe(true);
    });

    it("rejects non-inline codes", () => {
      expect(isInlineEncoded("abc123")).toBe(false);
      expect(isInlineEncoded("r1:sr:abc:data")).toBe(false);
    });
  });
});

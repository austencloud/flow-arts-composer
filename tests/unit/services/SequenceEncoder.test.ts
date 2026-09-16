import { describe, expect, it, vi } from "vitest";
import {
  encodeSequence,
  decodeSequence,
  encodeSequenceForQR,
  decodeSequenceFromQR,
  encodeSequenceWithCompression,
  decodeSequenceWithCompression,
  parseSequenceRouteId,
  generateSequenceRoutePath,
} from "$lib/shared/navigation/services/sequence-encoder";
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

describe("SequenceEncoder", () => {

  describe("encode/decode round-trip", () => {
    it("preserves custom durations without changing legacy one-beat encoding", () => {
      const steps = [
        makeStep(1, {}, {}),
        makeStep(2, {}, {}),
        makeStep(3, {}, {}),
      ];
      steps[0]!.duration = 5;
      steps[1]!.duration = 1;
      steps[2]!.duration = 1.25;
      const sequence = buildTestSequence(steps);

      const encoded = encodeSequence(sequence);
      const decoded = decodeSequence(encoded);

      expect(decoded.steps.map((step) => step.duration)).toEqual([5, 1, 1.25]);
      expect(encoded).toContain(":d5");
      expect(encoded).toContain(":d1.25");

      const compressed = encodeSequenceWithCompression(sequence);
      expect(
        decodeSequenceWithCompression(compressed.encoded).steps.map(
          (step) => step.duration
        )
      ).toEqual([5, 1, 1.25]);

      const legacyEncoding = encodeSequence(
        buildTestSequence(steps.map((step) => ({ ...step, duration: 1 })))
      );
      expect(legacyEncoding).not.toContain(":d");
      expect(decodeSequence(legacyEncoding).steps.map((step) => step.duration)).toEqual([
        1,
        1,
        1,
      ]);
    });

    it("preserves custom durations through QR encoding", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const steps = [
        makeStep(1, {}, {}),
        makeStep(2, {}, {}),
        makeStep(3, {}, {}),
        makeStep(4, {}, {}),
      ];
      [5, 1, 5, 1].forEach((duration, index) => {
        steps[index]!.duration = duration;
      });
      const sequence = buildTestSequence(steps);

      const encoded = await encodeSequenceForQR(sequence);
      const decoded = await decodeSequenceFromQR(encoded);

      expect(encoded).toMatch(/^s~(?:q1:|raw:)/);
      expect(decoded.steps.map((step) => step.duration)).toEqual([5, 1, 5, 1]);
      expect(warn).toHaveBeenCalledWith(
        "[QR] Compositional encoding error:",
        expect.any(Error)
      );
      warn.mockRestore();
    });

    it("rejects corrupt encoded durations instead of discarding timing", () => {
      const sequence = buildTestSequence([makeStep(1, {}, {})]);
      const encoded = `${encodeSequence(sequence)}:d0`;

      expect(() => decodeSequence(encoded)).toThrow(
        "Invalid duration encoding at beat 1"
      );
    });

    it("preserves all motion fields through uncompressed round-trip", () => {
      // Derive-only codec: per-step orientations are NOT stored. Only the
      // start-placement seed (per hand) is encoded in the header; every step's
      // startOrientation is the running chained orientation and its
      // endOrientation is derived via the orientation algebra. So the fixture
      // chain must be physically consistent:
      //   blue seed IN -> STATIC start (preserves) -> step PRO 1 turn (odd =>
      //     switch) yields IN -> OUT.
      //   red seed CLOCK -> STATIC start (preserves) -> step ANTI 2 turns (even
      //     => switch) yields CLOCK -> COUNTER.
      // This still exercises round-trip fidelity of every motion field AND a
      // non-default (CLOCK) seed surviving the header round-trip.
      const step = makeStep(
        1,
        {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT,
          turns: 1,
          propType: PropType.STAFF,
        },
        {
          motionType: MotionType.ANTI,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.COUNTER,
          turns: 2,
          propType: PropType.FAN,
        }
      );

      const seq = buildTestSequence([
        makeStartPlacement(
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            startOrientation: Orientation.IN,
            endOrientation: Orientation.IN,
            turns: 0,
            propType: PropType.STAFF,
          },
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            startOrientation: Orientation.CLOCK,
            endOrientation: Orientation.CLOCK,
            turns: 0,
            propType: PropType.FAN,
          }
        ),
        step,
      ]);

      const encoded = encodeSequence(seq);
      const decoded = decodeSequence(encoded);

      expect(decoded.steps).toHaveLength(1);

      const leftMotion = decoded.steps[0].motions.left!;
      expect(leftMotion.motionType).toBe(MotionType.PRO);
      expect(leftMotion.rotationDirection).toBe(RotationDirection.CLOCKWISE);
      expect(leftMotion.startLocation).toBe(GridLocation.NORTH);
      expect(leftMotion.endLocation).toBe(GridLocation.EAST);
      // startOrientation comes from the chained seed (IN); endOrientation is
      // derived (PRO, 1 turn => switch) -> OUT.
      expect(leftMotion.startOrientation).toBe(Orientation.IN);
      expect(leftMotion.endOrientation).toBe(Orientation.OUT);
      expect(leftMotion.turns).toBe(1);
      expect(leftMotion.propType).toBe(PropType.STAFF);

      const rightMotion = decoded.steps[0].motions.right!;
      expect(rightMotion.motionType).toBe(MotionType.ANTI);
      expect(rightMotion.rotationDirection).toBe(
        RotationDirection.COUNTER_CLOCKWISE
      );
      expect(rightMotion.startLocation).toBe(GridLocation.SOUTH);
      expect(rightMotion.endLocation).toBe(GridLocation.WEST);
      // Non-default CLOCK seed survives the header round-trip and chains in as
      // the step start orientation; endOrientation derived (ANTI, 2 turns =>
      // switch) -> COUNTER.
      expect(rightMotion.startOrientation).toBe(Orientation.CLOCK);
      expect(rightMotion.endOrientation).toBe(Orientation.COUNTER);
      expect(rightMotion.turns).toBe(2);
      expect(rightMotion.propType).toBe(PropType.FAN);
    });

    it("preserves all motion fields through compressed round-trip", () => {
      const step = makeStep(
        1,
        {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTHEAST,
          endLocation: GridLocation.SOUTHWEST,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.COUNTER,
          turns: 3,
          propType: PropType.CLUB,
        },
        {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: GridLocation.SOUTHEAST,
          endLocation: GridLocation.SOUTHEAST,
          startOrientation: Orientation.OUT,
          endOrientation: Orientation.OUT,
          turns: 0,
          propType: PropType.CLUB,
        }
      );

      const seq = buildTestSequence([
        makeStartPlacement(
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.NORTHEAST,
            endLocation: GridLocation.NORTHEAST,
            turns: 0,
            propType: PropType.CLUB,
          },
          {
            motionType: MotionType.STATIC,
            startLocation: GridLocation.SOUTHEAST,
            endLocation: GridLocation.SOUTHEAST,
            turns: 0,
            propType: PropType.CLUB,
          }
        ),
        step,
      ]);

      const { encoded } = encodeSequenceWithCompression(seq);
      const decoded = decodeSequenceWithCompression(encoded);

      const leftMotion = decoded.steps[0].motions.left!;
      expect(leftMotion.motionType).toBe(MotionType.DASH);
      expect(leftMotion.startLocation).toBe(GridLocation.NORTHEAST);
      expect(leftMotion.endLocation).toBe(GridLocation.SOUTHWEST);
      expect(leftMotion.turns).toBe(3);
      expect(leftMotion.propType).toBe(PropType.CLUB);

      const rightMotion = decoded.steps[0].motions.right!;
      expect(rightMotion.motionType).toBe(MotionType.STATIC);
      expect(rightMotion.startLocation).toBe(GridLocation.SOUTHEAST);
      expect(rightMotion.endLocation).toBe(GridLocation.SOUTHEAST);
      expect(rightMotion.turns).toBe(0);
    });

    it("preserves multi-step sequences", () => {
      const steps = [
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
            turns: 1,
            propType: PropType.STAFF,
          },
          {
            motionType: MotionType.PRO,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.WEST,
            rotationDirection: RotationDirection.CLOCKWISE,
            turns: 1,
            propType: PropType.STAFF,
          }
        ),
        makeStep(
          2,
          {
            motionType: MotionType.ANTI,
            startLocation: GridLocation.EAST,
            endLocation: GridLocation.SOUTH,
            rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
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
      ];

      const seq = buildTestSequence(steps);
      const { encoded } = encodeSequenceWithCompression(seq);
      const decoded = decodeSequenceWithCompression(encoded);

      expect(decoded.steps).toHaveLength(3);

      expect(decoded.steps[0].motions.left!.motionType).toBe(MotionType.PRO);
      expect(decoded.steps[1].motions.left!.motionType).toBe(MotionType.ANTI);
      expect(decoded.steps[2].motions.left!.motionType).toBe(MotionType.STATIC);

      expect(decoded.steps[0].motions.left!.startLocation).toBe(
        GridLocation.NORTH
      );
      expect(decoded.steps[0].motions.left!.endLocation).toBe(
        GridLocation.EAST
      );
      expect(decoded.steps[1].motions.left!.startLocation).toBe(
        GridLocation.EAST
      );
      expect(decoded.steps[1].motions.left!.endLocation).toBe(
        GridLocation.SOUTH
      );
    });

    it("preserves float turns value", () => {
      const step = makeStep(
        1,
        {
          motionType: MotionType.FLOAT,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          turns: "fl" as unknown as number,
          propType: PropType.STAFF,
        },
        {
          motionType: MotionType.STATIC,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.SOUTH,
          turns: 0,
          propType: PropType.STAFF,
        }
      );

      const seq = buildTestSequence([
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
        step,
      ]);

      const encoded = encodeSequence(seq);
      const decoded = decodeSequence(encoded);

      expect(decoded.steps[0].motions.left!.turns).toBe("fl");
      expect(decoded.steps[0].motions.left!.motionType).toBe(MotionType.FLOAT);
    });

    it("preserves all 8 grid locations", () => {
      const locations = [
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
        GridLocation.WEST,
        GridLocation.NORTHEAST,
        GridLocation.SOUTHEAST,
        GridLocation.SOUTHWEST,
        GridLocation.NORTHWEST,
      ];

      for (const loc of locations) {
        const step = makeStep(
          1,
          {
            startLocation: loc,
            endLocation: GridLocation.NORTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType: PropType.STAFF,
          },
          {
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType: PropType.STAFF,
          }
        );

        const seq = buildTestSequence([
          makeStartPlacement(
            {
              startLocation: loc,
              endLocation: loc,
              turns: 0,
              propType: PropType.STAFF,
            },
            {
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              propType: PropType.STAFF,
            }
          ),
          step,
        ]);

        const encoded = encodeSequence(seq);
        const decoded = decodeSequence(encoded);

        expect(decoded.steps[0].motions.left!.startLocation).toBe(loc);
      }
    });

    it("preserves all orientation values as start-placement seeds", () => {
      // Derive-only codec: orientation is stored ONLY as the start-placement
      // seed in the header, not per step. To prove each of the four radial
      // orientations round-trips, set the seed (start-placement startOrientation)
      // to that value and chain it through a STATIC step. STATIC with 0 turns
      // preserves orientation, so the seed flows unchanged into the step's
      // derived start AND end orientation. Asserting both === seed verifies the
      // seed survived the header round-trip and the deriver reproduced it.
      const orientations = [
        Orientation.IN,
        Orientation.OUT,
        Orientation.CLOCK,
        Orientation.COUNTER,
      ];

      for (const orient of orientations) {
        const step = makeStep(
          1,
          {
            startOrientation: orient,
            endOrientation: orient,
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType: PropType.STAFF,
          },
          {
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType: PropType.STAFF,
          }
        );

        const seq = buildTestSequence([
          makeStartPlacement(
            {
              // Seed lives here, on the start position. This is the ONLY place
              // orientation is stored in the canonical format.
              startOrientation: orient,
              endOrientation: orient,
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
          step,
        ]);

        const encoded = encodeSequence(seq);
        const decoded = decodeSequence(encoded);

        // Seed round-trips onto the decoded start position.
        expect(decoded.startPlacement!.motions.left!.startOrientation).toBe(
          orient
        );
        // And chains (STATIC, 0 turns => preserve) into the step.
        expect(decoded.steps[0].motions.left!.startOrientation).toBe(orient);
        expect(decoded.steps[0].motions.left!.endOrientation).toBe(orient);
      }
    });

    it("preserves all prop types through round-trip", () => {
      const propTypes = [
        PropType.STAFF,
        PropType.CLUB,
        PropType.FAN,
        PropType.TRIAD,
        PropType.BUUGENG,
        PropType.HAND,
        PropType.POI,
      ];

      for (const propType of propTypes) {
        const step = makeStep(
          1,
          {
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType,
          },
          {
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            turns: 0,
            motionType: MotionType.STATIC,
            propType,
          }
        );

        const seq = buildTestSequence([
          makeStartPlacement(
            {
              startLocation: GridLocation.NORTH,
              endLocation: GridLocation.NORTH,
              turns: 0,
              propType,
            },
            {
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.SOUTH,
              turns: 0,
              propType,
            }
          ),
          step,
        ]);

        const encoded = encodeSequence(seq);
        const decoded = decodeSequence(encoded);

        expect(decoded.steps[0].motions.left!.propType).toBe(propType);
        expect(decoded.steps[0].motions.right!.propType).toBe(propType);
      }
    });
  });

  describe("parseSequenceRouteId", () => {
    it.each(["d1:CoCkBEjA2oBh", "raw:nosoiic0sS:sonoiic0sS"])(
      "detects current encoded sequence prefix: %s",
      (id) => {
        const result = parseSequenceRouteId(id);
        expect(result.encoded).toBe(id);
        expect(result.legacyId).toBeNull();
      }
    );

    it("detects compressed encoded sequences (z: prefix)", () => {
      const result = parseSequenceRouteId("z:CoCkBEjA2oBh");
      expect(result.encoded).toBe("z:CoCkBEjA2oBh");
      expect(result.legacyId).toBeNull();
    });

    it("detects URL-encoded z: prefix", () => {
      const result = parseSequenceRouteId("z%3ACoCkBEjA2oBh");
      expect(result.encoded).toBe("z:CoCkBEjA2oBh");
      expect(result.legacyId).toBeNull();
    });

    it("detects uncompressed pipe-delimited sequences", () => {
      const result = parseSequenceRouteId(
        "nosoiic0sS:sonoiic0sS|noeaioc1pS:soweioc1pS"
      );
      expect(result.encoded).not.toBeNull();
      expect(result.legacyId).toBeNull();
    });

    it("identifies legacy Firebase IDs", () => {
      const result = parseSequenceRouteId(
        "seq_1769720340144_pm6d0gz72"
      );
      expect(result.encoded).toBeNull();
      expect(result.legacyId).toBe("seq_1769720340144_pm6d0gz72");
    });

    it("identifies plain words as legacy IDs", () => {
      const result = parseSequenceRouteId("CAKE");
      expect(result.encoded).toBeNull();
      expect(result.legacyId).toBe("CAKE");
    });

    it("returns both null for empty input", () => {
      const result = parseSequenceRouteId("");
      expect(result.encoded).toBeNull();
      expect(result.legacyId).toBeNull();
    });
  });

  describe("generateSequenceRoutePath", () => {
    it("generates a path starting with /sequence/", () => {
      const seq = buildTestSequence([
        makeStartPlacement(
          {
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            propType: PropType.STAFF,
          },
          {
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
            turns: 1,
            propType: PropType.STAFF,
          },
          {
            motionType: MotionType.PRO,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.WEST,
            rotationDirection: RotationDirection.CLOCKWISE,
            turns: 1,
            propType: PropType.STAFF,
          }
        ),
      ]);

      const path = generateSequenceRoutePath(seq);

      expect(path).toMatch(/^\/sequence\//);
    });

    it("produces a path that round-trips through decodeSequenceWithCompression", () => {
      const seq = buildTestSequence([
        makeStartPlacement(
          {
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            propType: PropType.STAFF,
          },
          {
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
            turns: 1,
            propType: PropType.STAFF,
          },
          {
            motionType: MotionType.PRO,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.WEST,
            rotationDirection: RotationDirection.CLOCKWISE,
            turns: 1,
            propType: PropType.STAFF,
          }
        ),
      ]);

      const path = generateSequenceRoutePath(seq);

      // The path is URL-encoded; route parsing owns decoding it before the
      // sequence codec takes over.
      const id = path.replace("/sequence/", "");
      const parsed = parseSequenceRouteId(id);
      expect(parsed.encoded).not.toBeNull();
      expect(parsed.legacyId).toBeNull();

      const decoded = decodeSequenceWithCompression(parsed.encoded!);
      expect(decoded.steps).toHaveLength(1);
      expect(decoded.steps[0].motions.left!.motionType).toBe(MotionType.PRO);
      expect(decoded.steps[0].motions.left!.startLocation).toBe(
        GridLocation.NORTH
      );
      expect(decoded.steps[0].motions.left!.endLocation).toBe(
        GridLocation.EAST
      );
    });
  });

  describe("edge cases", () => {
    it("throws on empty input", () => {
      expect(() => decodeSequence("")).toThrow();
    });

    it("handles start position with no actual steps", () => {
      const seq = buildTestSequence([
        makeStartPlacement(
          {
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            propType: PropType.STAFF,
          },
          {
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.SOUTH,
            turns: 0,
            propType: PropType.STAFF,
          }
        ),
      ]);

      const encoded = encodeSequence(seq);
      const decoded = decodeSequence(encoded);

      expect(decoded.steps).toHaveLength(0);
      expect(decoded.startPlacement).toBeDefined();
    });

    it("compressed and uncompressed decode to identical motion data", () => {
      const seq = buildTestSequence([
        makeStartPlacement(
          {
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.NORTH,
            turns: 0,
            propType: PropType.STAFF,
          },
          {
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
            turns: 2,
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
            propType: PropType.FAN,
          }
        ),
      ]);

      const uncompressed = decodeSequence(encodeSequence(seq));
      const { encoded: compressedStr } = encodeSequenceWithCompression(seq);
      const compressed = decodeSequenceWithCompression(compressedStr);

      const uBlue = uncompressed.steps[0].motions.left!;
      const cBlue = compressed.steps[0].motions.left!;

      expect(cBlue.motionType).toBe(uBlue.motionType);
      expect(cBlue.rotationDirection).toBe(uBlue.rotationDirection);
      expect(cBlue.startLocation).toBe(uBlue.startLocation);
      expect(cBlue.endLocation).toBe(uBlue.endLocation);
      expect(cBlue.startOrientation).toBe(uBlue.startOrientation);
      expect(cBlue.endOrientation).toBe(uBlue.endOrientation);
      expect(cBlue.turns).toBe(uBlue.turns);
      expect(cBlue.propType).toBe(uBlue.propType);
    });
  });
});

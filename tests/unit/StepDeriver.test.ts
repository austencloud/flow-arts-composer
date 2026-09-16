import { describe, it, expect } from "vitest";
import { deriveSteps, deriveStartPlacement } from "$lib/shared/foundation/services/step-deriver";
import { GridLocation, GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  MotionType,
  RotationDirection,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";

function makeStep(
  startLocation: GridLocation,
  endLocation: GridLocation,
  overrides: Partial<SoloPropStepData> = {}
): SoloPropStepData {
  return {
    startLocation,
    endLocation,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 1,
    duration: 1,
    ...overrides,
  };
}

function makeSoloProp(
  steps: SoloPropStepData[],
  startLocation: GridLocation = GridLocation.NORTH,
  startOrientation: Orientation = Orientation.IN
): SoloPropData {
  return {
    id: crypto.randomUUID(),
    steps,
    startLocation,
    startOrientation,
    contentHash: "stub",
    handPath: {
      id: crypto.randomUUID(),
      locations: [startLocation, ...steps.map((s) => s.endLocation)],
      contentHash: "stub",
      startLocation,
      endLocation: steps[steps.length - 1]?.endLocation ?? startLocation,
      length: steps.length + 1,
      bigrams: [],
      uniqueLocations: [startLocation],
      impliedGridMode: GridMode.DIAMOND,
      isClosed: false,
    },
    length: steps.length,
    bigrams: [],
    impliedGridMode: GridMode.DIAMOND,
  };
}

function makePairing(overrides: Partial<StepPairingData> = {}): StepPairingData {
  return {
    letter: Letter.A,
    leftReversal: false,
    rightReversal: false,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.BETA1,
    ...overrides,
  };
}

describe("StepDeriver", () => {

  describe("deriveSteps — basic structure", () => {
    it("returns one StepData per pairing", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep, leftStep]);
      const right = makeSoloProp([rightStep, rightStep]);
      const pairings = [makePairing(), makePairing({ letter: Letter.B })];

      const steps = deriveSteps(left, right, pairings);

      expect(steps).toHaveLength(2);
    });

    it("assigns 1-indexed stepNumbers", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep, leftStep, leftStep]);
      const right = makeSoloProp([rightStep, rightStep, rightStep]);
      const pairings = [makePairing(), makePairing(), makePairing()];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.stepNumber).toBe(1);
      expect(steps[1]!.stepNumber).toBe(2);
      expect(steps[2]!.stepNumber).toBe(3);
    });

    it("transfers letter, startPlacement, endPlacement from pairing", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);
      const pairings = [
        makePairing({
          letter: Letter.C,
          startPlacement: GridPlacement.GAMMA1,
          endPlacement: GridPlacement.GAMMA5,
        }),
      ];

      const [step] = deriveSteps(left, right, pairings);

      expect(step!.letter).toBe(Letter.C);
      expect(step!.startPlacement).toBe(GridPlacement.GAMMA1);
      expect(step!.endPlacement).toBe(GridPlacement.GAMMA5);
    });

    it("transfers blueReversal and redReversal from pairing", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);
      const pairings = [makePairing({ leftReversal: true, rightReversal: false })];

      const [step] = deriveSteps(left, right, pairings);

      expect(step!.leftReversal).toBe(true);
      expect(step!.rightReversal).toBe(false);
    });

    it("sets isBlank to false", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.isBlank).toBe(false);
    });

    it("assigns a unique id per step", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep, leftStep]);
      const right = makeSoloProp([rightStep, rightStep]);
      const pairings = [makePairing(), makePairing()];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.id).not.toBe(steps[1]!.id);
    });
  });

  describe("deriveSteps — duration", () => {
    it("uses blue duration, ignoring red when they differ", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST, { duration: 3 });
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST, { duration: 7 });

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.duration).toBe(3);
    });

    it("preserves blue duration when both agree", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST, { duration: 2 });
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST, { duration: 2 });

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.duration).toBe(2);
    });
  });

  describe("deriveSteps — motion rehydration", () => {
    it("produces blue and red motions with correct colors", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.motions.left?.hand).toBe(HandSide.LEFT);
      expect(step!.motions.right?.hand).toBe(HandSide.RIGHT);
    });

    it("copies startLocation / endLocation from each solo prop step", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.motions.left?.startLocation).toBe(GridLocation.NORTH);
      expect(step!.motions.left?.endLocation).toBe(GridLocation.EAST);
      expect(step!.motions.right?.startLocation).toBe(GridLocation.SOUTH);
      expect(step!.motions.right?.endLocation).toBe(GridLocation.WEST);
    });

    it("applies viewerPrefs propType to both motions", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()], {
        leftPropType: PropType.FAN,
        rightPropType: PropType.FAN,
        catDogMode: false,
      });

      expect(step!.motions.left?.propType).toBe(PropType.FAN);
      expect(step!.motions.right?.propType).toBe(PropType.FAN);
    });

    it("defaults propType to STAFF when viewerPrefs not provided", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.motions.left?.propType).toBe(PropType.STAFF);
      expect(step!.motions.right?.propType).toBe(PropType.STAFF);
    });

    it("sets isVisible true on both motions", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.motions.left?.isVisible).toBe(true);
      expect(step!.motions.right?.isVisible).toBe(true);
    });
  });

  describe("deriveSteps — grid mode derivation", () => {
    it("derives DIAMOND when all four locations are cardinal", () => {
      // N, E, S, W are all cardinal
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.gridMode).toBe(GridMode.DIAMOND);
      expect(step!.motions.left?.gridMode).toBe(GridMode.DIAMOND);
      expect(step!.motions.right?.gridMode).toBe(GridMode.DIAMOND);
    });

    it("derives BOX when all four locations are intercardinal", () => {
      // NE, SE, SW, NW are all intercardinal
      const leftStep = makeStep(GridLocation.NORTHEAST, GridLocation.SOUTHEAST);
      const rightStep = makeStep(GridLocation.SOUTHWEST, GridLocation.NORTHWEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.gridMode).toBe(GridMode.BOX);
    });

    it("derives SKEWED when locations are a mix of cardinal and intercardinal", () => {
      // N (cardinal) + NE (intercardinal) → SKEWED
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.NORTHEAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.SOUTHWEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.gridMode).toBe(GridMode.SKEWED);
    });

    it("derives CENTRIC when any location is CENTER", () => {
      const leftStep = makeStep(GridLocation.CENTER, GridLocation.NORTH);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.gridMode).toBe(GridMode.CENTRIC);
    });

    it("applies the same gridMode to both motions in a step", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.NORTHEAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.SOUTHWEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);

      const [step] = deriveSteps(left, right, [makePairing()]);

      expect(step!.motions.left?.gridMode).toBe(step!.gridMode);
      expect(step!.motions.right?.gridMode).toBe(step!.gridMode);
    });
  });

  describe("deriveSteps — length mismatch guard", () => {
    it("throws when blue steps count does not match pairings count", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep, leftStep]);
      const right = makeSoloProp([rightStep]);
      const pairings = [makePairing()];

      expect(() => deriveSteps(left, right, pairings)).toThrow();
    });
  });

  describe("deriveStartPlacement", () => {
    it("returns an object with isStartPlacement true", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.IN);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.OUT);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.isStartPlacement).toBe(true);
    });

    it("produces STATIC motions for both colors", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.IN);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.OUT);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.motions.left?.motionType).toBe(MotionType.STATIC);
      expect(startPos.motions.right?.motionType).toBe(MotionType.STATIC);
    });

    it("uses solo prop startLocation for both start and end of each motion", () => {
      const left = makeSoloProp([], GridLocation.EAST, Orientation.IN);
      const right = makeSoloProp([], GridLocation.WEST, Orientation.OUT);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.motions.left?.startLocation).toBe(GridLocation.EAST);
      expect(startPos.motions.left?.endLocation).toBe(GridLocation.EAST);
      expect(startPos.motions.right?.startLocation).toBe(GridLocation.WEST);
      expect(startPos.motions.right?.endLocation).toBe(GridLocation.WEST);
    });

    it("carries the solo prop startOrientation onto the motion", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.CLOCK);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.COUNTER);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.motions.left?.startOrientation).toBe(Orientation.CLOCK);
      expect(startPos.motions.right?.startOrientation).toBe(Orientation.COUNTER);
    });

    it("derives DIAMOND gridMode when both start locations are cardinal", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.IN);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.OUT);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.gridMode).toBe(GridMode.DIAMOND);
    });

    it("assigns a unique id each call", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.IN);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.OUT);

      const sp1 = deriveStartPlacement(left, right);
      const sp2 = deriveStartPlacement(left, right);

      expect(sp1.id).not.toBe(sp2.id);
    });

    it("sets gridPlacement to null (position-lookup is out of scope)", () => {
      const left = makeSoloProp([], GridLocation.NORTH, Orientation.IN);
      const right = makeSoloProp([], GridLocation.SOUTH, Orientation.OUT);

      const startPos = deriveStartPlacement(left, right);

      expect(startPos.gridPlacement).toBeNull();
    });
  });

  describe("deriveSteps — float prefloat preservation", () => {
    it("preserves prefloatMotionType on a float blue motion", () => {
      const blueFloat = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.FLOAT,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: "fl",
        prefloatMotionType: MotionType.PRO,
      });
      const redAnti = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        turns: 0.5,
      });

      const left = makeSoloProp([blueFloat]);
      const right = makeSoloProp([redAnti]);
      const pairings = [makePairing({ letter: Letter.I })];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.motions.left.prefloatMotionType).toBe(MotionType.PRO);
    });

    it("derives prefloatRotationDirection from prefloat type + handpath (pro on s→e = ccw)", () => {
      const blueFloat = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.FLOAT,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: "fl",
        prefloatMotionType: MotionType.PRO,
      });
      const redAnti = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        turns: 0.5,
      });

      const left = makeSoloProp([blueFloat]);
      const right = makeSoloProp([redAnti]);
      const pairings = [makePairing({ letter: Letter.I })];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.motions.left.prefloatRotationDirection).toBe(
        RotationDirection.COUNTER_CLOCKWISE
      );
    });

    it("derives prefloatRotationDirection as cw when prefloat is anti on a ccw handpath", () => {
      const blueFloat = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.FLOAT,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: "fl",
        prefloatMotionType: MotionType.ANTI,
      });
      const redPro = makeStep(GridLocation.SOUTH, GridLocation.EAST, {
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turns: 1,
      });

      const left = makeSoloProp([blueFloat]);
      const right = makeSoloProp([redPro]);
      const pairings = [makePairing({ letter: Letter.I })];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.motions.left.prefloatRotationDirection).toBe(
        RotationDirection.CLOCKWISE
      );
    });

    it("leaves prefloat fields undefined when motionType is not float", () => {
      const leftStep = makeStep(GridLocation.NORTH, GridLocation.EAST);
      const rightStep = makeStep(GridLocation.SOUTH, GridLocation.WEST);

      const left = makeSoloProp([leftStep]);
      const right = makeSoloProp([rightStep]);
      const pairings = [makePairing()];

      const steps = deriveSteps(left, right, pairings);

      expect(steps[0]!.motions.left.prefloatMotionType).toBeUndefined();
      expect(steps[0]!.motions.left.prefloatRotationDirection).toBeUndefined();
    });
  });
});

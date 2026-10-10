import { beforeEach, describe, expect, it } from "vitest";
import { MotionSignatureGenerator } from "#lib/shared/comparison/services/motion-signature-generator.js";
import { createMotionData } from "../../../src/lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation, GridMode } from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
  HandPath,
} from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "../../../src/lib/shared/pictograph/prop/domain/enums/prop-type";

describe("MotionSignatureGenerator", () => {
  let generator: MotionSignatureGenerator;

  beforeEach(() => {
    generator = new MotionSignatureGenerator();
  });

  describe("generateSignature", () => {
    it("should generate signature with correct motion type", () => {
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const signature = generator.generateSignature(motion);

      expect(signature.motionType).toBe(MotionType.PRO);
      expect(signature.rotationDirection).toBe(RotationDirection.CLOCKWISE);
      expect(signature.turns).toBe(1);
    });

    it("should capture orientation transition", () => {
      const motion = createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 0.5,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.CLOCK,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const signature = generator.generateSignature(motion);

      expect(signature.orientationTransition.from).toBe(Orientation.OUT);
      expect(signature.orientationTransition.to).toBe(Orientation.CLOCK);
    });

    it("should calculate location delta for shift motion (90° movement)", () => {
      // North to East is 2 steps clockwise (90°)
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const signature = generator.generateSignature(motion);

      expect(signature.locationDelta.steps).toBe(2);
      expect(signature.locationDelta.direction).toBe(HandPath.CLOCKWISE);
    });

    it("should calculate location delta for dash motion (180° movement)", () => {
      // North to South is 4 steps (180°) - dash
      const motion = createMotionData({
        motionType: MotionType.DASH,
        rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.SOUTH,
        turns: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const signature = generator.generateSignature(motion);

      expect(signature.locationDelta.steps).toBe(4);
      expect(signature.locationDelta.direction).toBe(HandPath.DASH);
    });

    it("should calculate location delta for static motion (no movement)", () => {
      const motion = createMotionData({
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        turns: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const signature = generator.generateSignature(motion);

      expect(signature.locationDelta.steps).toBe(0);
      expect(signature.locationDelta.direction).toBe(HandPath.STATIC);
    });
  });

  describe("signaturesMatch", () => {
    it("should return true for identical signatures", () => {
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sig1 = generator.generateSignature(motion);
      const sig2 = generator.generateSignature(motion);

      expect(generator.signaturesMatch(sig1, sig2)).toBe(true);
    });

    it("should return true for geometrically equivalent motions at different grid positions", () => {
      // PRO motion north->east (clockwise shift)
      const motionA = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      // PRO motion south->west (also clockwise shift, same geometric pattern)
      const motionB = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigA = generator.generateSignature(motionA);
      const sigB = generator.generateSignature(motionB);

      expect(generator.signaturesMatch(sigA, sigB)).toBe(true);
    });

    it("should return false for different motion types", () => {
      const motionPro = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const motionAnti = createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigPro = generator.generateSignature(motionPro);
      const sigAnti = generator.generateSignature(motionAnti);

      expect(generator.signaturesMatch(sigPro, sigAnti)).toBe(false);
    });

    it("should return false for different rotation directions", () => {
      const motionCW = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const motionCCW = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.WEST, // CCW from north goes west
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigCW = generator.generateSignature(motionCW);
      const sigCCW = generator.generateSignature(motionCCW);

      expect(generator.signaturesMatch(sigCW, sigCCW)).toBe(false);
    });
  });

  describe("compareSignatures", () => {
    it("should return similarity 1.0 for identical signatures", () => {
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sig = generator.generateSignature(motion);
      const result = generator.compareSignatures(sig, sig);

      expect(result.isExactMatch).toBe(true);
      expect(result.similarity).toBe(1);
    });

    it("should return partial similarity for motions differing only in turns", () => {
      const motion1Turn = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const motion2Turns = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 2,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sig1 = generator.generateSignature(motion1Turn);
      const sig2 = generator.generateSignature(motion2Turns);
      const result = generator.compareSignatures(sig1, sig2);

      expect(result.isExactMatch).toBe(false);
      // Should have high similarity since only turns differ
      expect(result.similarity).toBeGreaterThan(0.7);
      expect(result.similarity).toBeLessThan(1);
      expect(result.breakdown.turnsMatch).toBe(false);
      expect(result.breakdown.motionTypeMatch).toBe(true);
    });

    it("should return 0 similarity for completely different motions", () => {
      const proCW = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const staticNoRot = createMotionData({
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
        turns: 0,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.CLOCK,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigPro = generator.generateSignature(proCW);
      const sigStatic = generator.generateSignature(staticNoRot);
      const result = generator.compareSignatures(sigPro, sigStatic);

      expect(result.isExactMatch).toBe(false);
      // Very low similarity - almost nothing matches
      expect(result.similarity).toBeLessThan(0.5);
    });
  });

  describe("hashSignature", () => {
    it("should generate same hash for identical signatures", () => {
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sig1 = generator.generateSignature(motion);
      const sig2 = generator.generateSignature(motion);

      expect(generator.hashSignature(sig1)).toBe(generator.hashSignature(sig2));
    });

    it("should generate same hash for geometrically equivalent motions", () => {
      // Same motion pattern at different grid positions
      const motionNorth = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const motionSouth = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigNorth = generator.generateSignature(motionNorth);
      const sigSouth = generator.generateSignature(motionSouth);

      expect(generator.hashSignature(sigNorth)).toBe(generator.hashSignature(sigSouth));
    });

    it("should generate different hashes for different motion types", () => {
      const motionPro = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const motionAnti = createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
      });

      const sigPro = generator.generateSignature(motionPro);
      const sigAnti = generator.generateSignature(motionAnti);

      expect(generator.hashSignature(sigPro)).not.toBe(generator.hashSignature(sigAnti));
    });
  });
});

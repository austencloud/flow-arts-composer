import { describe, expect, it } from "vitest";

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  decodeSequenceFromQR,
  __test__ as sequenceEncoderTest,
} from "../sequence-encoder";
import {
  decodeLegacySequence,
  detectLegacySequenceFormat,
  encodeLegacySequence,
  type LegacySequenceFormat,
} from "../legacy-sequence-codec";

const PRODUCTION_FLAT_QR =
  "s~q1:9O5/166CQPYL*25*4NKYPGQG:RDJMKRIPXMFQ56W257R5YNI*O4AYS/*COVM1VC9S3:T9J*4HQ13H0";

const PRODUCTION_RECIPE_QR =
  "s~r1:sr:c2039feb:q1:9O5/166CQPYL*2512NXY9:Z9K56LPHVVPOP6PQI0J11NKO.CQILLI9XZ9HKD+ICP6A+J9B A5KD3:FP0G/B8336";

const PRODUCTION_NUMERIC_FLOAT_QR =
  "s~q1:A 9396V$GYO1%4AOAOC.V4DR6N0:UU.OQIU23K0WDW.J0MJLU/JEMNG1NE.4TKF7UJ.7797LIPD02SC6IS7GKBM::2SB82BKA+H4Q2FF9HG4/NM0+44*P940ERE/ISIIGY13BTKJ9A4ZU%*J$S755V$%2E/B8.BVMM+4AWYT2Z8Z84%FBY8L.Q8/.T70";

describe("legacy QR payload compatibility", () => {
  it.each([
    {
      code: "s8g62i",
      payload: PRODUCTION_FLAT_QR,
      stepCount: 4,
      firstMotionType: MotionType.STATIC,
      firstTurns: 0.5,
    },
    {
      code: "rSgNf0",
      payload: PRODUCTION_RECIPE_QR,
      stepCount: 8,
      firstMotionType: MotionType.PRO,
      firstTurns: 1,
    },
  ])(
    "decodes the embedded payload from shortcode $code",
    async ({ payload, stepCount, firstMotionType, firstTurns }) => {
      const sequence = await decodeSequenceFromQR(payload);

      expect(sequence.steps).toHaveLength(stepCount);
      expect(sequence.startPlacement?.motions.left?.propType).toBe(
        PropType.STAFF
      );
      expect(sequence.startPlacement?.motions.right?.propType).toBe(
        PropType.STAFF
      );
      expect(sequence.steps[0]?.motions.left.motionType).toBe(firstMotionType);
      expect(sequence.steps[0]?.motions.left.turns).toBe(firstTurns);
    }
  );

  it.each<LegacySequenceFormat>([1, 2, 3])(
    "round-trips every historical flat format without changing its wire form (v%s)",
    async (format) => {
      const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
      const encoded = encodeLegacySequence(source, format);

      expect(detectLegacySequenceFormat(encoded)).toBe(format);

      const decoded = decodeLegacySequence(encoded);
      expect(decoded.steps).toHaveLength(source.steps.length);
      expect(decoded.startPlacement?.motions.left?.propType).toBe(
        PropType.STAFF
      );
      expect(decoded.startPlacement?.motions.right?.propType).toBe(PropType.STAFF);
      expect(encodeLegacySequence(decoded, format)).toBe(encoded);
    }
  );

  it("preserves the old step-number-only sequence shape", async () => {
    const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const [, ...beats] = encodeLegacySequence(source, 1).split("|");
    const decoded = decodeLegacySequence(`17|${beats.join("|")}`);

    expect(decoded.startPlacement).toBeUndefined();
    expect(decoded.steps.map((step) => step.stepNumber)).toEqual(
      beats.map((_, index) => 17 + index)
    );
  });

  it("preserves an absent hand as an invisible placeholder", async () => {
    const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const parts = encodeLegacySequence(source, 1).split("|");
    const [, right] = parts[1]!.split(":");
    parts[1] = `:${right}`;

    const decoded = decodeLegacySequence(parts.join("|"));
    expect(decoded.steps[0]?.motions.left.isVisible).toBe(false);
    expect(decoded.steps[0]?.motions.right.isVisible).toBe(true);
  });

  it("normalizes the numeric float encoding from production shortcode 9XAK", async () => {
    const sequence = await decodeSequenceFromQR(PRODUCTION_NUMERIC_FLOAT_QR);

    expect(sequence.steps).toHaveLength(16);
    expect(sequence.startPlacement?.motions.left?.propType).toBe(PropType.STAFF);
    expect(sequence.startPlacement?.motions.right?.propType).toBe(PropType.STAFF);

    const numericFloat = sequence.steps[0]?.motions.right;
    expect(numericFloat?.motionType).toBe(MotionType.FLOAT);
    expect(numericFloat?.turns).toBe("fl");
    expect(numericFloat?.rotationDirection).toBe(RotationDirection.NO_ROTATION);
    expect(numericFloat?.prefloatRotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
  });

  it.each(["+0.5", "-0.5junk", "Infinity", "NaN"])(
    "rejects malformed numeric turn token %s instead of decoding plausible garbage",
    (turns) => {
      expect(() =>
        sequenceEncoderTest.decodeMotion(
          `wenoc${turns}`,
          HandSide.RIGHT,
          Orientation.IN,
          PropType.STAFF
        )
      ).toThrow("Invalid motion encoding");
    }
  );
});

describe("legacy float decode: prefloat is data, never fabricated", () => {
  // Pre-prefloat-era blobs wrote the float's own rotation — NO_ROTATION —
  // into the wire slot, so they carry no prefloat information at all. The
  // decoder used to MANUFACTURE a prefloatMotionType from that empty slot
  // (deriveMotionType over "noRotation" → an arbitrary same-family type),
  // which produced confident wrong letters downstream (parity-repair spec,
  // root-caused 2026-07-27 against embedded mint-time witnesses). Unknown
  // must decode as ABSENT.
  async function floatSequence(prefloat: {
    prefloatMotionType?: MotionType;
    prefloatRotationDirection?: RotationDirection;
  }) {
    const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const mutated = JSON.parse(JSON.stringify(source)) as typeof source;
    const left = mutated.steps[0]!.motions.left;
    Object.assign(left, {
      motionType: MotionType.FLOAT,
      turns: "fl",
      rotationDirection: RotationDirection.NO_ROTATION,
      prefloatMotionType: undefined,
      prefloatRotationDirection: undefined,
      ...prefloat,
    });
    return mutated;
  }

  it("decodes a prefloat-less float with NO prefloat fields (nothing manufactured)", async () => {
    const mutated = await floatSequence({});
    const decoded = decodeLegacySequence(encodeLegacySequence(mutated, 2));
    const left = decoded.steps[0]!.motions.left;
    expect(left.motionType).toBe(MotionType.FLOAT);
    expect(left.prefloatMotionType).toBeUndefined();
    expect(left.prefloatRotationDirection).toBeUndefined();
  });

  it("round-trips a REAL prefloat rotation through the wire slot", async () => {
    const mutated = await floatSequence({
      prefloatMotionType: MotionType.PRO,
      prefloatRotationDirection: RotationDirection.CLOCKWISE,
    });
    const decoded = decodeLegacySequence(encodeLegacySequence(mutated, 2));
    const left = decoded.steps[0]!.motions.left;
    expect(left.motionType).toBe(MotionType.FLOAT);
    expect(left.prefloatRotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(left.prefloatMotionType).toBeDefined();
  });
});

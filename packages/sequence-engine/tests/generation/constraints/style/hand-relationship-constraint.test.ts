import { describe, it, expect } from "vitest";
import {
  HandRelationshipConstraint,
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../../../src/generation/constraints/style/hand-relationship-constraint.js";
import { ConstraintType } from "../../../../src/generation/constraints/constraint-types.js";
import type {
  ConstraintContext,
  MotionData,
  PictographData,
} from "../../../../src/generation/constraints/types.js";
import {
  loadBoxVariations,
  loadDiamondVariations,
} from "../../../helpers/csv-variations.js";

function motion(
  motionType: string,
  rotationDirection: string,
  start: string,
  end: string
): MotionData {
  return {
    motionType,
    rotationDirection,
    startLocation: start,
    endLocation: end,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as unknown as MotionData;
}

function candidate(left: MotionData, right: MotionData): PictographData {
  return {
    letter: "?",
    startPosition: "?",
    endPosition: "?",
    timing: "split",
    direction: "opp",
    leftMotion: left,
    rightMotion: right,
  };
}

function context(c: PictographData): ConstraintContext {
  return {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    letter: c.letter,
    candidate: c,
  };
}

describe("handRelationshipHolds", () => {
  // Right hand E to N is a counter-clockwise arc; pro follows the hand, so ccw.
  const right = motion("pro", "ccw", "e", "n");

  it("mirrored: left is the north-south reflection with the same motion type", () => {
    expect(
      handRelationshipHolds(motion("pro", "cw", "w", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(true);
  });

  it("mirrored rejects an identical left path (that is unison, not a mirror)", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "e", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("mirrored rejects the other motion type unless inverted", () => {
    const left = motion("anti", "ccw", "w", "n");
    expect(
      handRelationshipHolds(left, right, { map: "reflect-north-south" })
    ).toBe(false);
    expect(
      handRelationshipHolds(left, right, {
        map: "reflect-north-south",
        inverted: true,
      })
    ).toBe(true);
  });

  it("flipped: left is the east-west reflection", () => {
    expect(
      handRelationshipHolds(motion("pro", "cw", "e", "s"), right, {
        map: "reflect-east-west",
      })
    ).toBe(true);
  });

  it("unison: the same motion on both hands", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "e", "n"), right, {
        map: "identity",
      })
    ).toBe(true);
  });

  it("opposite: rotated 180 with the same spin", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "w", "s"), right, {
        map: "rotate-180",
      })
    ).toBe(true);
  });

  it("rejects a mirror whose spin contradicts the reflection", () => {
    // A reflected pro path must spin the other way. Same spin means the data
    // row is not a true mirror, whatever its locations say.
    expect(
      handRelationshipHolds(motion("pro", "ccw", "w", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("dash against dash qualifies; dash against a shift does not", () => {
    const rightDash = motion("dash", "noRotation", "e", "w");
    expect(
      handRelationshipHolds(motion("dash", "noRotation", "w", "e"), rightDash, {
        map: "reflect-north-south",
      })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "cw", "w", "e"), rightDash, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("inverted leaves dash and static alone: they still have to match each other", () => {
    const rightDash = motion("dash", "noRotation", "e", "w");
    expect(
      handRelationshipHolds(motion("dash", "noRotation", "w", "e"), rightDash, {
        map: "reflect-north-south",
        inverted: true,
      })
    ).toBe(true);
  });
});

describe("HandRelationshipConstraint", () => {
  it("is a hard constraint with its own type", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    expect(constraint.mode).toBe("hard");
    expect(constraint.type).toBe(ConstraintType.HAND_RELATIONSHIP);
  });

  it("scores 1 and satisfied for a mirrored pair, 0 otherwise", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const good = candidate(
      motion("pro", "cw", "w", "n"),
      motion("pro", "ccw", "e", "n")
    );
    const bad = candidate(
      motion("pro", "ccw", "e", "n"),
      motion("pro", "ccw", "e", "n")
    );
    expect(constraint.evaluate(context(good))).toMatchObject({
      score: 1,
      satisfied: true,
    });
    expect(constraint.evaluate(context(bad))).toMatchObject({
      score: 0,
      satisfied: false,
    });
    expect(constraint.couldSatisfy(good)).toBe(true);
    expect(constraint.couldSatisfy(bad)).toBe(false);
  });
});

describe("against the production dataframes", () => {
  type Case = [
    string,
    () => PictographData[],
    HandRelationshipOptions,
    number,
    string[],
  ];
  // Inverted keeps the dash and static rows: pro/anti swap has nothing to act
  // on there, and an inverted sequence still needs them as vocabulary.
  const cases: Case[] = [
    ["diamond mirrored", loadDiamondVariations, { map: "reflect-north-south" }, 24, ["D", "E", "J", "K", "Φ-", "Ψ-", "α", "β"]],
    ["diamond mirrored inverted", loadDiamondVariations, { map: "reflect-north-south", inverted: true }, 24, ["F", "L", "Φ-", "Ψ-", "α", "β"]],
    ["diamond flipped", loadDiamondVariations, { map: "reflect-east-west" }, 24, ["D", "E", "J", "K", "Φ-", "Ψ-", "α", "β"]],
    ["diamond flipped inverted", loadDiamondVariations, { map: "reflect-east-west", inverted: true }, 24, ["F", "L", "Φ-", "Ψ-", "α", "β"]],
    ["diamond unison", loadDiamondVariations, { map: "identity" }, 24, ["G", "H", "Ψ-", "β"]],
    ["diamond unison inverted", loadDiamondVariations, { map: "identity", inverted: true }, 24, ["I", "Ψ-", "β"]],
    ["diamond opposite", loadDiamondVariations, { map: "rotate-180" }, 24, ["A", "B", "Φ-", "α"]],
    ["diamond opposite inverted", loadDiamondVariations, { map: "rotate-180", inverted: true }, 24, ["C", "Φ-", "α"]],
    ["box mirrored", loadBoxVariations, { map: "reflect-north-south" }, 24, ["M", "N", "P", "Q", "Λ-", "γ"]],
    ["box mirrored inverted", loadBoxVariations, { map: "reflect-north-south", inverted: true }, 24, ["O", "R", "Λ-", "γ"]],
    ["box flipped", loadBoxVariations, { map: "reflect-east-west" }, 24, ["M", "N", "P", "Q", "Λ-", "γ"]],
    ["box unison", loadBoxVariations, { map: "identity" }, 24, ["G", "H", "Ψ-", "β"]],
    ["box opposite", loadBoxVariations, { map: "rotate-180" }, 24, ["A", "B", "Φ-", "α"]],
  ];

  it.each(cases)(
    "%s selects exactly the expected rows",
    (_name, load, options, count, letters) => {
      const constraint = new HandRelationshipConstraint(options);
      const hits = load().filter((p) => constraint.couldSatisfy(p));
      expect(hits).toHaveLength(count);
      expect([...new Set(hits.map((p) => p.letter))].sort()).toEqual(
        [...letters].sort()
      );
    }
  );

  it("diamond mirrored rows start only at the north-south symmetric positions", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const starts = new Set(
      loadDiamondVariations()
        .filter((p) => constraint.couldSatisfy(p))
        .map((p) => p.startPosition)
    );
    expect([...starts].sort()).toEqual(["alpha3", "alpha7", "beta1", "beta5"]);
  });

  it("box mirrored rows start only on the reflected gamma positions", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const starts = new Set(
      loadBoxVariations()
        .filter((p) => constraint.couldSatisfy(p))
        .map((p) => p.startPosition)
    );
    expect([...starts].sort()).toEqual(["gamma12", "gamma16", "gamma2", "gamma6"]);
  });
});

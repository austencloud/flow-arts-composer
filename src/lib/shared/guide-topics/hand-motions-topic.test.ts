import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";
import {
  HAND_COMBINATIONS,
  HAND_MOTIONS_TOPIC_UNITS,
  MOTION_MAP_HOME,
  MOTION_MAP_MOVES,
  classifyHandMove,
  combinationFor,
  combinationNameSegments,
  combinationPictographData,
  handMotionsTopicText,
  handMoveDirection,
  motionMapArrowData,
  motionMapTargets,
  plainTopicText,
  type HandMove,
} from "./hand-motions-topic";

const english = en as Record<string, string>;
const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

describe("Hand Motions topic record", () => {
  it("resolves every unit to an English message", () => {
    for (const [unit, key] of Object.entries(HAND_MOTIONS_TOPIC_UNITS)) {
      expect(english[key], `${unit} -> ${key}`).toBeTruthy();
    }
  });

  it("uses Austen's chosen Static caption", () => {
    expect(handMotionsTopicText("staticCaption")).toBe(
      "Remain at the same point"
    );
  });

  it("carries the approved motion map prompt", () => {
    expect(handMotionsTopicText("mapPrompt")).toBe("Drag the hand to a point.");
  });

  it("lists the three moves in the book's order", () => {
    expect(MOTION_MAP_MOVES.map((move) => move.id)).toEqual([
      "shift",
      "dash",
      "static",
    ]);
  });
});

describe("classifyHandMove", () => {
  it.each([
    [W, N, "shift"],
    [W, S, "shift"],
    [W, E, "dash"],
    [W, W, "static"],
    [N, E, "shift"],
    [N, S, "dash"],
  ] as const)("%s to %s is a %s", (from, to, move) => {
    expect(classifyHandMove(from, to)).toBe(move);
  });

  it("names no move for a 45-degree step", () => {
    expect(classifyHandMove(W, GridLocation.NORTHWEST)).toBeNull();
  });
});

describe("motion map targets", () => {
  it("draws the book's map from West: shifts north and south, dash east", () => {
    expect(
      motionMapTargets(MOTION_MAP_HOME).map((target) => [
        target.slot,
        target.to,
      ])
    ).toEqual([
      ["shift-clockwise", N],
      ["shift-counterclockwise", S],
      ["dash", E],
    ]);
  });

  it("redraws around wherever the hand lands", () => {
    expect(motionMapTargets(N).map((target) => target.to)).toEqual([E, W, S]);
  });

  it("builds one blue arrow per target with the move's motion type", () => {
    const [shift, , dash] = motionMapTargets(W);
    expect(
      motionMapArrowData(W, shift!).motions[HandSide.LEFT]?.motionType
    ).toBe(MotionType.PRO);
    const dashData = motionMapArrowData(W, dash!);
    expect(dashData.motions[HandSide.LEFT]?.motionType).toBe(MotionType.DASH);
    expect(dashData.motions[HandSide.RIGHT]).toBeUndefined();
  });

  it("puts a red arrow on the right hand", () => {
    const [shift] = motionMapTargets(E);
    const data = motionMapArrowData(E, shift!, HandSide.RIGHT);
    expect(data.motions[HandSide.RIGHT]?.motionType).toBe(MotionType.PRO);
    expect(data.motions[HandSide.LEFT]).toBeUndefined();
  });
});

describe("handMoveDirection", () => {
  it("reads a quarter turn's way around the grid", () => {
    expect(handMoveDirection(W, N)).toBe("clockwise");
    expect(handMoveDirection(W, S)).toBe("counterclockwise");
    expect(handMoveDirection(N, E)).toBe("clockwise");
  });
});

describe("six combinations", () => {
  it("lists the Guide's six in book order, one per letter type", () => {
    expect(HAND_COMBINATIONS.map((combination) => combination.id)).toEqual([
      "dual-shift",
      "shift",
      "cross-shift",
      "dash",
      "dual-dash",
      "static",
    ]);
    expect(HAND_COMBINATIONS.map((c) => c.letterType)).toEqual([
      LetterType.TYPE1,
      LetterType.TYPE2,
      LetterType.TYPE3,
      LetterType.TYPE4,
      LetterType.TYPE5,
      LetterType.TYPE6,
    ]);
  });

  it("names each with the Guide's own words", () => {
    expect(
      HAND_COMBINATIONS.map((c) => [english[c.name], english[c.description]])
    ).toEqual([
      ["Dual-Shift", english.verified_level1_hand_motions_78],
      ["Shift", english.verified_level1_hand_motions_80],
      ["Cross-Shift", english.verified_level1_hand_motions_82],
      ["Dash", english.verified_level1_hand_motions_84],
      ["Dual-Dash", english.verified_level1_hand_motions_86],
      ["Static", english.verified_level1_hand_motions_87],
    ]);
  });

  it("gives every one of the nine hand pairs a combination, either way round", () => {
    const moves: HandMove[] = ["shift", "dash", "static"];
    const seen = new Set<string>();
    for (const blue of moves) {
      for (const red of moves) {
        const combination = combinationFor(blue, red);
        expect(combinationFor(red, blue)).toBe(combination);
        seen.add(combination.id);
      }
    }
    expect(seen.size).toBe(6);
    expect(combinationFor("shift", "dash").id).toBe("cross-shift");
    expect(combinationFor("static", "dash").id).toBe("dash");
  });

  it("colors a hyphenated name in two tones", () => {
    expect(combinationNameSegments("Dual-Shift", LetterType.TYPE1)).toEqual([
      { text: "Dual-", color: "#36c3ff" },
      { text: "Shift", color: "#6F2DA8" },
    ]);
    expect(combinationNameSegments("Shift", LetterType.TYPE2)).toEqual([
      { text: "Shift", color: "#6F2DA8" },
    ]);
  });

  it("draws the book's two-hand example for each", () => {
    const crossShift = HAND_COMBINATIONS.find((c) => c.id === "cross-shift")!;
    const data = combinationPictographData(crossShift);
    expect(data.motions[HandSide.LEFT]).toMatchObject({
      motionType: MotionType.PRO,
      startLocation: W,
      endLocation: N,
    });
    expect(data.motions[HandSide.RIGHT]).toMatchObject({
      motionType: MotionType.DASH,
      startLocation: E,
      endLocation: W,
    });
    const still = combinationPictographData(
      HAND_COMBINATIONS.find((c) => c.id === "static")!
    );
    expect(still.motions[HandSide.LEFT]?.motionType).toBe(MotionType.STATIC);
  });

  it("matches each example's moves to its combination", () => {
    for (const combination of HAND_COMBINATIONS) {
      const { left, right } = combination.demo;
      expect(classifyHandMove(left.from, left.to)).toBe(left.move);
      expect(classifyHandMove(right.from, right.to)).toBe(right.move);
      expect(combinationFor(left.move, right.move)).toBe(combination);
    }
  });

  it("reads a Guide line break as a space", () => {
    expect(plainTopicText("verified_level1_hand_motions_80")).toBe(
      "One hand travels to an adjacent point and the other hand remains static."
    );
  });
});

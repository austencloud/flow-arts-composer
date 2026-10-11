import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  HAND_MOTIONS_TOPIC_UNITS,
  MOTION_MAP_HOME,
  MOTION_MAP_MOVES,
  classifyHandMove,
  handMotionsTopicText,
  motionMapArrowData,
  motionMapTargets,
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
});

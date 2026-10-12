import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  goalPoints,
  isMirrorPair,
  placeHand,
  roundHands,
  roundPair,
  roundTravel,
  startRound,
} from "../../../src/lib/features/learn/components/interactive/motions/hand-pairs-round";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const { LEFT: BLUE, RIGHT: RED } = HandSide;

describe("a two-hand round", () => {
  it("waits for both hands", () => {
    const round = placeHand(startRound(W, E), BLUE, N);
    expect(roundPair(round)).toBeNull();
    expect(roundPair(placeHand(round, RED, W))).toEqual({
      blue: "shift",
      red: "dash",
    });
  });

  it("counts a hand put back on its own point as static", () => {
    const round = placeHand(placeHand(startRound(W, E), BLUE, W), RED, E);
    expect(roundPair(round)).toEqual({ blue: "static", red: "static" });
  });

  it("re-targets a hand moved twice from where the round began", () => {
    let round = placeHand(startRound(W, E), BLUE, N);
    round = placeHand(round, BLUE, E);
    expect(round.moves[BLUE]).toEqual({ to: E, move: "dash" });
    round = placeHand(round, BLUE, W);
    expect(round.moves[BLUE]).toEqual({ to: W, move: "static" });
  });

  it("starts the next round where the hands are", () => {
    const round = placeHand(placeHand(startRound(W, E), BLUE, N), RED, S);
    const next = startRound(round.moves[BLUE]!.to, round.moves[RED]!.to);
    expect(next.start).toEqual({ [BLUE]: N, [RED]: S });
    expect(next.moves).toEqual({});
  });

  it("ignores a 45-degree drop, which is no hand motion", () => {
    const round = startRound(W, E);
    expect(placeHand(round, BLUE, GridLocation.NORTHWEST)).toBe(round);
  });
});

describe("mirror pairs", () => {
  it("knows the same pair with the hands swapped", () => {
    expect(
      isMirrorPair(
        { blue: "shift", red: "static" },
        { blue: "static", red: "shift" }
      )
    ).toBe(true);
  });

  it("does not call a repeat or a symmetric pair a mirror", () => {
    expect(
      isMirrorPair(
        { blue: "shift", red: "static" },
        { blue: "shift", red: "static" }
      )
    ).toBe(false);
    expect(
      isMirrorPair({ blue: "dash", red: "dash" }, { blue: "dash", red: "dash" })
    ).toBe(false);
  });
});

describe("the fused picture", () => {
  it("draws both moves from where the round began", () => {
    let round = startRound(W, E);
    expect(roundHands(round)).toBeNull();
    round = placeHand(round, BLUE, N);
    round = placeHand(round, RED, W);
    expect(roundHands(round)).toEqual({
      left: { move: "shift", from: W, to: N },
      right: { move: "dash", from: E, to: W },
    });
  });

  it("plays both moves together, a dash straight and a shift around", () => {
    let round = startRound(W, E);
    round = placeHand(round, BLUE, N);
    round = placeHand(round, RED, W);
    expect(roundTravel(round, 3, 800)).toEqual({
      epoch: 3,
      color: BLUE,
      from: W,
      to: N,
      direction: "clockwise",
      path: "arc",
      durationMs: 800,
      partner: { from: E, to: W, direction: "clockwise", path: "dash" },
    });
  });

  it("plays only the hand that moves when the other is static", () => {
    let round = startRound(W, E);
    round = placeHand(round, BLUE, W);
    round = placeHand(round, RED, N);
    expect(roundTravel(round, 1, 800)).toEqual({
      epoch: 1,
      color: RED,
      from: E,
      to: N,
      direction: "counterclockwise",
      path: "arc",
      durationMs: 800,
      partner: undefined,
    });
  });

  it("has nothing to play until both have picked, or when both are static", () => {
    let round = placeHand(startRound(W, E), BLUE, N);
    expect(roundTravel(round, 1, 800)).toBeNull();
    round = placeHand(placeHand(startRound(W, E), BLUE, W), RED, E);
    expect(roundTravel(round, 1, 800)).toBeNull();
  });
});

describe("a goal's hint points", () => {
  const POINTS = [N, E, S, W];

  it("offers blue either of the goal's moves", () => {
    const round = startRound(W, E);
    expect(goalPoints(round, BLUE, "dual-shift", POINTS)).toEqual([N, S]);
    expect(goalPoints(round, BLUE, "dash", POINTS).sort()).toEqual(
      [E, W].sort()
    );
    expect(goalPoints(round, BLUE, "static", POINTS)).toEqual([W]);
  });

  it("offers red only the move that completes blue's", () => {
    const shifted = placeHand(startRound(W, E), BLUE, N);
    expect(goalPoints(shifted, RED, "cross-shift", POINTS)).toEqual([W]);
    expect(goalPoints(shifted, RED, "shift", POINTS)).toEqual([E]);
    const stayed = placeHand(startRound(W, E), BLUE, W);
    expect(goalPoints(stayed, RED, "shift", POINTS)).toEqual([N, S]);
  });

  it("offers red nothing once blue's move is not in the goal", () => {
    const dashed = placeHand(startRound(W, E), BLUE, E);
    expect(goalPoints(dashed, RED, "dual-shift", POINTS)).toEqual([]);
    expect(goalPoints(startRound(W, E), RED, "static", POINTS)).toEqual([]);
  });
});

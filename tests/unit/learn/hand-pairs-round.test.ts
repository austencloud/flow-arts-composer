import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  isMirrorPair,
  placeHand,
  roundHands,
  roundPair,
  roundReplay,
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

  it("replays both hands together, a dash straight and a shift around", () => {
    let round = startRound(W, E);
    round = placeHand(round, BLUE, N);
    round = placeHand(round, RED, W);
    expect(roundReplay(round, 3, 800)).toEqual({
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

  it("replays only the hand that moves when the other is static", () => {
    let round = startRound(W, E);
    round = placeHand(round, BLUE, W);
    round = placeHand(round, RED, N);
    expect(roundReplay(round, 1, 800)).toEqual({
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

  it("has nothing to replay when both hands are static", () => {
    let round = startRound(W, E);
    round = placeHand(round, BLUE, W);
    round = placeHand(round, RED, E);
    expect(roundReplay(round, 1, 800)).toBeNull();
  });
});

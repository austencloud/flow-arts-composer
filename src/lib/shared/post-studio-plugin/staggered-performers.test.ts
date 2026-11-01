import { describe, expect, it } from "vitest";
import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
import { staggeredFrames, type TkaSequenceFrame } from "./staggered-performers";

const MOVES = [1, 1, 1, 1, 1, 1, 1, 1];

function tapped(arrival: number, endArrival: number | null): TkaSequenceFrame {
  return Object.assign(sequenceFrameAt(arrival, MOVES, { endArrival }), {
    endArrival,
  });
}

describe("staggeredFrames", () => {
  // 20 taps cover a 4-beat stagger: each performer does 16 moves.
  it("holds the follower on the opening pose until its turn", () => {
    const { leader, followers } = staggeredFrames(tapped(2.5, 20), MOVES, [4]);
    expect(leader.arrival).toBe(2.5);
    expect(followers[0]!.arrival).toBe(0);
    expect(followers[0]!.enginePosition).toBe(1);
  });

  it("runs the follower the given beats behind on the same count", () => {
    const { leader, followers } = staggeredFrames(tapped(9.25, 20), MOVES, [4]);
    expect(leader.arrival).toBe(9.25);
    expect(followers[0]!.arrival).toBeCloseTo(5.25);
    expect(followers[0]!.move).toBe(6);
  });

  it("stops the leader early so both finish the same number of moves", () => {
    const late = staggeredFrames(tapped(18, 20), MOVES, [4]);
    expect(late.leader.arrival).toBe(16);
    expect(late.leader.phase).toBe("holding");
    expect(late.followers[0]!.arrival).toBe(14);

    const end = staggeredFrames(tapped(20, 20), MOVES, [4]);
    expect(end.leader.arrival).toBe(16);
    expect(end.followers[0]!.arrival).toBe(16);
  });

  it("lets everyone run on when the take has no last landing", () => {
    const { leader, followers } = staggeredFrames(tapped(30, null), MOVES, [4]);
    expect(leader.arrival).toBe(30);
    expect(followers[0]!.arrival).toBe(26);
  });
});

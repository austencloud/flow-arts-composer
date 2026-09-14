import { describe, expect, it } from "vitest";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HAND_TUNNEL_PRESETS, presetById } from "../hand-tunnel-presets";
import { cycleForSegment } from "../../services/build-hand-tunnel-sequence";
import { MAX_PERFORMERS } from "../hand-tunnel-types";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

describe("HAND_TUNNEL_PRESETS", () => {
  it("never exceeds the performer cap", () => {
    for (const preset of HAND_TUNNEL_PRESETS) {
      expect(preset.performers.length).toBeLessThanOrEqual(MAX_PERFORMERS);
    }
  });

  it("gives every performer a unique id and a single segment from beat 0", () => {
    for (const preset of HAND_TUNNEL_PRESETS) {
      const ids = new Set(preset.performers.map((p) => p.id));
      expect(ids.size).toBe(preset.performers.length);
      for (const performer of preset.performers) {
        expect(performer.segments).toHaveLength(1);
        expect(performer.segments[0]?.fromBeat).toBe(0);
      }
    }
  });

  it("Ryan's trio is a tog-opp between two mirrored split-opps", () => {
    const trio = presetById("ryan-trio");
    const [a, b, c] = trio.performers.map((p) =>
      cycleForSegment(p.segments[0]!)
    );
    expect(a).toEqual({ left: [S, W, N, E, S], right: [S, E, N, W, S] });
    expect(b).toEqual({ left: [W, S, E, N, W], right: [W, N, E, S, W] });
    expect(c).toEqual({ left: [E, N, W, S, E], right: [E, S, W, N, E] });
  });

  it("Ryan's quad puts tog-opp betas top and bottom and split-opp betas on the sides", () => {
    const quad = presetById("ryan-quad");
    const starts = quad.performers.map((p) => {
      const cycle = cycleForSegment(p.segments[0]!);
      return [cycle.left[0], cycle.right[0]];
    });
    expect(starts).toEqual([
      [N, N],
      [S, S],
      [W, W],
      [E, E],
    ]);
  });

  it("throws on an unknown preset id", () => {
    expect(() => presetById("nope")).toThrow();
  });
});

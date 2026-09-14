import { describe, expect, it } from "vitest";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  buildPerformerSequence,
  cycleForTnd,
  describeHands,
  flipCycle,
  mirrorCycle,
  phaseCycle,
  rotateCycle,
  transformCycle,
  type HandPathCycle,
} from "../build-hand-tunnel-sequence";
import type { Performer } from "../../domain/hand-tunnel-types";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

function performer(
  id: string,
  segment: Partial<Performer["segments"][number]> & {
    tnd: Performer["segments"][number]["tnd"];
  }
): Performer {
  return {
    id,
    label: id.toUpperCase(),
    segments: [
      {
        fromBeat: 0,
        rotation: 0,
        mirror: false,
        flip: false,
        phase: 0,
        ...segment,
      },
    ],
  };
}

describe("cycleForTnd", () => {
  it("returns the canonical closed 5-point hand paths for tog-opp", () => {
    expect(cycleForTnd("to")).toEqual<HandPathCycle>({
      left: [S, W, N, E, S],
      right: [S, E, N, W, S],
    });
  });

  it("returns the canonical closed 5-point hand paths for split-opp", () => {
    expect(cycleForTnd("so")).toEqual<HandPathCycle>({
      left: [W, N, E, S, W],
      right: [W, S, E, N, W],
    });
  });
});

describe("flipCycle", () => {
  it("swaps north and south without swapping hands", () => {
    expect(flipCycle(cycleForTnd("so"))).toEqual<HandPathCycle>({
      left: [W, S, E, N, W],
      right: [W, N, E, S, W],
    });
  });

  it("is an involution", () => {
    const cycle = cycleForTnd("to");
    expect(flipCycle(flipCycle(cycle))).toEqual(cycle);
  });
});

describe("mirrorCycle", () => {
  it("swaps east and west and swaps hands", () => {
    expect(mirrorCycle(cycleForTnd("so"))).toEqual<HandPathCycle>({
      left: [E, S, W, N, E],
      right: [E, N, W, S, E],
    });
  });

  it("is an involution", () => {
    const cycle = cycleForTnd("qs");
    expect(mirrorCycle(mirrorCycle(cycle))).toEqual(cycle);
  });
});

describe("rotateCycle", () => {
  it("advances every point one quarter clockwise per step", () => {
    expect(rotateCycle(cycleForTnd("to"), 1)).toEqual<HandPathCycle>({
      left: [W, N, E, S, W],
      right: [W, S, E, N, W],
    });
  });

  it("moves a tog-opp bottom beta to the top with a half turn", () => {
    expect(rotateCycle(cycleForTnd("to"), 2)).toEqual<HandPathCycle>({
      left: [N, E, S, W, N],
      right: [N, W, S, E, N],
    });
  });

  it("returns to identity after four quarter turns", () => {
    const cycle = cycleForTnd("ss");
    expect(rotateCycle(cycle, 4)).toEqual(cycle);
  });
});

describe("phaseCycle", () => {
  it("starts the loop one beat later so tog-opp opens at alpha", () => {
    expect(phaseCycle(cycleForTnd("to"), 1)).toEqual<HandPathCycle>({
      left: [W, N, E, S, W],
      right: [E, N, W, S, E],
    });
  });

  it("accepts negative offsets as steps backward", () => {
    const cycle = cycleForTnd("to");
    expect(phaseCycle(cycle, -1)).toEqual(phaseCycle(cycle, 3));
  });

  it("returns to identity after a full loop", () => {
    const cycle = cycleForTnd("qo");
    expect(phaseCycle(cycle, 4)).toEqual(cycle);
  });
});

describe("transformCycle", () => {
  it("applies flip, then mirror, then rotate, then phase", () => {
    const cycle = cycleForTnd("so");
    const expected = phaseCycle(
      rotateCycle(mirrorCycle(flipCycle(cycle)), 1),
      2
    );
    expect(
      transformCycle(cycle, { flip: true, mirror: true, rotation: 1, phase: 2 })
    ).toEqual(expected);
  });
});

describe("Ryan's trio", () => {
  it("performer A is tog-opp from the south beta, right over east", () => {
    const seq = buildPerformerSequence(performer("a", { tnd: "to" }));
    expect(handPath(seq, "left")).toEqual([S, W, N, E, S]);
    expect(handPath(seq, "right")).toEqual([S, E, N, W, S]);
  });

  it("performer B is split-opp from the west beta, right over the top", () => {
    const seq = buildPerformerSequence(
      performer("b", { tnd: "so", flip: true })
    );
    expect(handPath(seq, "left")).toEqual([W, S, E, N, W]);
    expect(handPath(seq, "right")).toEqual([W, N, E, S, W]);
  });

  it("performer C is B mirrored: east beta, left over the top", () => {
    const seq = buildPerformerSequence(
      performer("c", { tnd: "so", flip: true, mirror: true })
    );
    expect(handPath(seq, "left")).toEqual([E, N, W, S, E]);
    expect(handPath(seq, "right")).toEqual([E, S, W, N, E]);
  });
});

describe("buildPerformerSequence", () => {
  it("builds a circular four-step hand-path sequence on hand props", () => {
    const seq = buildPerformerSequence(performer("a", { tnd: "ts" }));
    expect(seq.sequenceKind).toBe("hand-path");
    expect(seq.isCircular).toBe(true);
    expect(seq.steps).toHaveLength(4);
    for (const step of seq.steps) {
      expect(step.motions.left.propType).toBe(PropType.HAND);
      expect(step.motions.right.propType).toBe(PropType.HAND);
    }
  });

  it("stamps the performer id into the sequence and step ids", () => {
    const seq = buildPerformerSequence(performer("zed", { tnd: "ts" }));
    expect(seq.id).toContain("zed");
    expect(seq.steps[0]?.id).toContain("zed");
  });

  it("derives the start position from the first waypoints", () => {
    const seq = buildPerformerSequence(performer("a", { tnd: "to" }));
    expect(seq.startPosition?.motions.left?.startLocation).toBe(S);
    expect(seq.startPosition?.motions.right?.startLocation).toBe(S);
    expect(seq.steps[0]?.startPosition).toBe("beta5");
  });
});

function handPath(
  seq: ReturnType<typeof buildPerformerSequence>,
  hand: "left" | "right"
): GridLocation[] {
  const first = seq.steps[0]?.motions[hand];
  if (!first) throw new Error("missing first step");
  return [
    first.startLocation,
    ...seq.steps.map((step) => step.motions[hand].endLocation),
  ];
}

describe("describeHands", () => {
  it("names a beta by its point", () => {
    expect(describeHands(S, S)).toBe("β S");
  });

  it("names an alpha by both points", () => {
    expect(describeHands(W, E)).toBe("α W·E");
  });

  it("names a gamma by both points", () => {
    expect(describeHands(N, E)).toBe("γ N·E");
  });
});

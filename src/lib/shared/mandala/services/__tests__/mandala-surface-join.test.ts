// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import { MANDALA_GRID_RADIUS } from "../../domain/mandala-constants";
import { engineAlignScale } from "../engine-align";
import {
  deriveFrameMath,
  renderMandalaFrameSVG,
  type MandalaFrameSpec,
} from "../mandala-frame-renderer";
import {
  mandalaGridJoinOffsets,
  mandalaJoinReach,
  sequenceMandalaHandOffsets,
} from "../mandala-grid-join";

const EAST_ONE: GridJoin = { toward: "e", steps: 1 };

describe("sequenceMandalaHandOffsets", () => {
  it("is null for an unjoined sequence", () => {
    expect(sequenceMandalaHandOffsets(null)).toBeNull();
    expect(sequenceMandalaHandOffsets({})).toBeNull();
    expect(
      sequenceMandalaHandOffsets({ conjoined: { toward: "x", steps: 9 } })
    ).toBeNull();
  });

  it("reads the join the sequence carries, lined up with its grid", () => {
    const sequence = { conjoined: EAST_ONE, gridMode: "diamond" };
    expect(sequenceMandalaHandOffsets(sequence)).toEqual(
      mandalaGridJoinOffsets(EAST_ONE, "diamond")
    );
    const offsets = sequenceMandalaHandOffsets(sequence)!;
    expect(offsets.left.x).toBeCloseTo(-MANDALA_GRID_RADIUS / 2, 9);
    expect(offsets.right.x).toBeCloseTo(MANDALA_GRID_RADIUS / 2, 9);
  });

  it("tolerates a missing grid mode", () => {
    expect(sequenceMandalaHandOffsets({ conjoined: EAST_ONE })).toEqual(
      mandalaGridJoinOffsets(EAST_ONE, null)
    );
  });
});

describe("engineAlignScale with a joined pair", () => {
  it("is unchanged for one grid", () => {
    expect(engineAlignScale(126.4, 0)).toBe(engineAlignScale(126.4));
  });

  it("undoes the extra reach the mandala fits itself to", () => {
    const reach = mandalaJoinReach(sequenceMandalaHandOffsets({ conjoined: EAST_ONE }));
    expect(reach).toBeGreaterThan(0);
    // The renderer fits a bigger extent, so its hand circle is smaller in the
    // box and the alignment has to enlarge it by more.
    expect(engineAlignScale(126.4, reach)).toBeGreaterThan(engineAlignScale(126.4));
  });
});

describe("mandala MP4 export frames on joined grids", () => {
  const step = {
    beat: 1,
    letter: "A",
    motions: {
      left: {
        motionType: "pro",
        turns: 0,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "in",
        endOrientation: "in",
      },
      right: {
        motionType: "pro",
        turns: 0,
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        startOrientation: "in",
        endOrientation: "in",
      },
    },
  };
  const baseSpec: MandalaFrameSpec = {
    steps: [step, { ...step, beat: 2 }],
    leftPropType: "staff",
    rightPropType: "staff",
    show: "both",
    pathShape: "arc",
    lineWeight: 2.5,
    bgColor: "#000000",
    resolution: 400,
    period: 1,
    reps: 1,
    fps: 4,
    rangeMax: 120,
    rotation: 0,
    morphColors: null,
    solidPair: ["#4cc9f0", "#f72585"],
  };

  it("draws one grid exactly as before when the spec carries no join", () => {
    const math = deriveFrameMath(baseSpec);
    const plain = renderMandalaFrameSVG(baseSpec, math, 1).svg;
    const none = renderMandalaFrameSVG({ ...baseSpec, handOffsets: null }, math, 1).svg;
    expect(none.replace(/\d+/g, "#")).toBe(plain.replace(/\d+/g, "#"));
    expect(plain).not.toContain("translate(-40.00, 0.00)");
  });

  it("draws each hand on its own grid when the spec carries the join", () => {
    const spec = {
      ...baseSpec,
      handOffsets: sequenceMandalaHandOffsets({ conjoined: EAST_ONE }),
    };
    const svg = renderMandalaFrameSVG(spec, deriveFrameMath(spec), 1).svg;
    expect(svg).toContain('<g transform="translate(-40.00, 0.00)">');
    expect(svg).toContain('<g transform="translate(40.00, 0.00)">');
  });

  it("keeps the join plain enough to cross to the export worker", () => {
    const offsets = sequenceMandalaHandOffsets({ conjoined: EAST_ONE });
    expect(structuredClone({ ...baseSpec, handOffsets: offsets }).handOffsets).toEqual(
      offsets
    );
  });
});

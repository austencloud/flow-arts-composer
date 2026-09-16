import { describe, it, expect } from "vitest";
import twin from "../../../scripts/twin-transform.cjs";

const { buildLocationToPositionMap, twinSequence, isSelfTwin } = twin;

// Fake vertical mirror (e<->w; n/s/c fixed) — same shape the engine map has.
const mirrorLocationMap: Record<string, string> = {
  n: "n",
  s: "s",
  e: "w",
  w: "e",
  c: "c",
};
const mirrorRotation = (d: string) =>
  d === "cw" ? "ccw" : d === "ccw" ? "cw" : d;

// Minimal edges covering the two location pairs we assert on. An "edge" is one
// CSV pictograph row: a (leftStartLoc,rightStartLoc)->startPos and
// (leftEndLoc,rightEndLoc)->endPos fact.
const edges = [
  {
    leftStartLoc: "w",
    rightStartLoc: "s",
    startPos: "gamma13",
    leftEndLoc: "w",
    rightEndLoc: "s",
    endPos: "gamma13",
  },
  {
    leftStartLoc: "s",
    rightStartLoc: "e",
    startPos: "gamma11",
    leftEndLoc: "s",
    rightEndLoc: "e",
    endPos: "gamma11",
  },
];

function startStep(over: any = {}) {
  // One static start step: left@w right@s == gamma13 (mirrors the reference base).
  return {
    id: "start-x",
    letter: "γ",
    startPlacement: "gamma13",
    endPlacement: "gamma13",
    beatIndex: 0,
    stepNumber: 0,
    duration: 1,
    motions: {
      left: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "w",
        endLocation: "w",
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
        hand: "left",
      },
      right: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "s",
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
        hand: "right",
      },
    },
    ...over,
  };
}

const deps = { mirrorLocationMap, mirrorRotation };

describe("buildLocationToPositionMap", () => {
  it("keys positions by `${leftLoc}|${rightLoc}` from edge start and end", () => {
    const map = buildLocationToPositionMap(edges);
    expect(map["w|s"]).toBe("gamma13");
    expect(map["s|e"]).toBe("gamma11");
  });
});

describe("twinSequence", () => {
  it("swaps hands, mirrors locations + rotation, and derives the position", () => {
    const locToPos = buildLocationToPositionMap(edges);
    const out = twinSequence([startStep()], { ...deps, locToPos });
    const t = out[0];
    // The left hand now carries the old right path, and the right carries the
    // old left path. The vertical mirror then maps w->e on the right hand.
    expect(t.motions.left.startLocation).toBe("s");
    expect(t.motions.right.startLocation).toBe("e");
    expect(t.motions.left.hand).toBe("left");
    expect(t.motions.right.hand).toBe("right");
    // derived from (left s | right e) -> gamma11, not the position-name map
    // (which would give gamma5).
    expect(t.startPlacement).toBe("gamma11");
    expect(t.endPlacement).toBe("gamma11");
  });

  it("flips rotation direction on a moving beat (cw<->ccw)", () => {
    const locToPos = buildLocationToPositionMap(edges);
    const beat = startStep({
      motions: {
        left: {
          motionType: "anti",
          rotationDirection: "cw",
          startLocation: "w",
          endLocation: "w",
          turns: 0,
          startOrientation: "in",
          endOrientation: "out",
          hand: "left",
        },
        right: {
          motionType: "pro",
          rotationDirection: "cw",
          startLocation: "s",
          endLocation: "e",
          turns: 0,
          startOrientation: "in",
          endOrientation: "out",
          hand: "right",
        },
      },
    });
    const t = twinSequence([beat], { ...deps, locToPos })[0];
    // old right (pro, cw) -> left, mirrored cw->ccw
    expect(t.motions.left.motionType).toBe("pro");
    expect(t.motions.left.rotationDirection).toBe("ccw");
    // old left (anti, cw) -> right, mirrored cw->ccw
    expect(t.motions.right.motionType).toBe("anti");
    expect(t.motions.right.rotationDirection).toBe("ccw");
  });

  it("returns null position when the mirrored pair is absent from the map", () => {
    const locToPos = buildLocationToPositionMap(edges);
    const beat = startStep({
      motions: {
        left: {
          motionType: "static",
          rotationDirection: "noRotation",
          startLocation: "n",
          endLocation: "n",
          turns: 0,
          startOrientation: "in",
          endOrientation: "in",
          hand: "left",
        },
        right: {
          motionType: "static",
          rotationDirection: "noRotation",
          startLocation: "n",
          endLocation: "n",
          turns: 0,
          startOrientation: "in",
          endOrientation: "in",
          hand: "right",
        },
      },
    });
    const t = twinSequence([beat], { ...deps, locToPos })[0];
    expect(t.startPlacement).toBeNull();
  });
});

describe("isSelfTwin", () => {
  it("is false when locations differ after transform", () => {
    const locToPos = buildLocationToPositionMap(edges);
    const orig = [startStep()];
    const tw = twinSequence(orig, { ...deps, locToPos });
    expect(isSelfTwin(orig, tw)).toBe(false);
  });

  it("is true when a step equals its own twin geometry", () => {
    // A symmetric step: left@n right@n, mirror and hand swap keep n|n.
    const sym = startStep({
      startPlacement: "betaX",
      endPlacement: "betaX",
      motions: {
        left: {
          motionType: "static",
          rotationDirection: "noRotation",
          startLocation: "n",
          endLocation: "n",
          turns: 0,
          startOrientation: "in",
          endOrientation: "in",
          hand: "left",
        },
        right: {
          motionType: "static",
          rotationDirection: "noRotation",
          startLocation: "n",
          endLocation: "n",
          turns: 0,
          startOrientation: "in",
          endOrientation: "in",
          hand: "right",
        },
      },
    });
    const locToPos = { "n|n": "betaX" };
    const tw = twinSequence([sym], { ...deps, locToPos });
    expect(isSelfTwin([sym], tw)).toBe(true);
  });
});

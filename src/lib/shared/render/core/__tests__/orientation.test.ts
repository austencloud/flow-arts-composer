import { describe, it, expect } from "vitest";
import {
  calculateEndOrientation,
  calculateOrientations,
  switchOrientation,
  getHandpathDirection,
} from "#lib/shared/render/core/calculations/orientation.js";
import type { Orientation } from "#lib/shared/render/core/types.js";

/**
 * Orientation algebra is the foundation of valid pictograph generation: every
 * downstream prop angle, beta offset, and reversal flows from the end
 * orientation. A wrong end orientation renders a plausible-looking but
 * incorrect pictograph — the classic silent bug. These expectations are grounded
 * in the canonical TKA orientation algebra (Flow Arts Knowledge MCP,
 * get_domain_topic("orientation-algebra")), NOT re-derived from the implementation:
 *
 *   Whole-turn parity:
 *     Pro/Static  -> even turns preserve, odd turns reverse
 *     Anti/Dash   -> even turns reverse, odd turns preserve
 *   "Reverse" means in<->out, clock<->counter, clockIn<->counterOut, clockOut<->counterIn.
 *
 *   Fractional turns use the 8-point radial cycle (each quarter = 1 step / 45 deg):
 *     in -> clockIn -> clock -> clockOut -> out -> counterOut -> counter -> counterIn
 *     Anti/Dash retain their zero-turn reverse, then every motion adds the
 *     prop's physical quarter-turn rotation.
 */

const RADIAL_ORIENTATIONS: Orientation[] = [
  "in",
  "clockIn",
  "clock",
  "clockOut",
  "out",
  "counterOut",
  "counter",
  "counterIn",
];

const CARDINAL_ORIENTATIONS: Orientation[] = ["in", "out", "clock", "counter"];

describe("switchOrientation", () => {
  it("maps each canonical reverse pair (MCP orientation-algebra)", () => {
    expect(switchOrientation("in")).toBe("out");
    expect(switchOrientation("out")).toBe("in");
    expect(switchOrientation("clock")).toBe("counter");
    expect(switchOrientation("counter")).toBe("clock");
    // Interradial (L4) pairs
    expect(switchOrientation("clockIn")).toBe("counterOut");
    expect(switchOrientation("counterOut")).toBe("clockIn");
    expect(switchOrientation("clockOut")).toBe("counterIn");
    expect(switchOrientation("counterIn")).toBe("clockOut");
  });

  it("is an involution: switch(switch(x)) === x for every orientation", () => {
    const all: Orientation[] = [
      ...RADIAL_ORIENTATIONS,
      "centerN",
      "centerNE",
      "centerE",
      "centerSE",
      "centerS",
      "centerSW",
      "centerW",
      "centerNW",
    ];
    for (const ori of all) {
      expect(switchOrientation(switchOrientation(ori))).toBe(ori);
    }
  });

  it("maps center orientations to their compass opposite", () => {
    expect(switchOrientation("centerN")).toBe("centerS");
    expect(switchOrientation("centerE")).toBe("centerW");
    expect(switchOrientation("centerNE")).toBe("centerSW");
    expect(switchOrientation("centerSE")).toBe("centerNW");
  });
});

describe("calculateEndOrientation — whole-turn parity", () => {
  // Pro/Static: even preserve, odd reverse. Anti/Dash: even reverse, odd preserve.
  const cases: Array<{
    type: string;
    even: "preserve" | "reverse";
    odd: "preserve" | "reverse";
  }> = [
    { type: "pro", even: "preserve", odd: "reverse" },
    { type: "static", even: "preserve", odd: "reverse" },
    { type: "anti", even: "reverse", odd: "preserve" },
    { type: "dash", even: "reverse", odd: "preserve" },
  ];

  for (const { type, even, odd } of cases) {
    for (const start of CARDINAL_ORIENTATIONS) {
      it(`${type} from ${start}: even turns ${even}, odd turns ${odd}`, () => {
        const expectEven = even === "preserve" ? start : switchOrientation(start);
        const expectOdd = odd === "preserve" ? start : switchOrientation(start);

        for (const turns of [0, 2, 4]) {
          expect(
            calculateEndOrientation({
              motionType: type,
              turns,
              rotationDirection: "cw",
              startLocation: "n",
              endLocation: "n",
              startOrientation: start,
            })
          ).toBe(expectEven);
        }
        for (const turns of [1, 3]) {
          expect(
            calculateEndOrientation({
              motionType: type,
              turns,
              rotationDirection: "cw",
              startLocation: "n",
              endLocation: "n",
              startOrientation: start,
            })
          ).toBe(expectOdd);
        }
      });
    }
  }
});

describe("calculateEndOrientation — fractional radial cycle", () => {
  // Hand-derived by combining both MCP rules (NOT the implementation):
  //   Anti/Dash have a four-step zero-turn reverse; Pro/Static preserve.
  //   Each quarter turn then adds one 45deg physical prop-rotation step.
  const expectations: Array<{
    type: string;
    dir: string;
    turns: number;
    start: Orientation;
    end: Orientation;
  }> = [
    // Pro = opposite to rotation. cw => step backward in CW cycle.
    { type: "pro", dir: "cw", turns: 0.25, start: "in", end: "counterIn" },
    { type: "pro", dir: "cw", turns: 0.5, start: "in", end: "counter" },
    { type: "pro", dir: "ccw", turns: 0.25, start: "in", end: "clockIn" },
    // Anti starts reversed at out, then cw steps toward clockOut.
    { type: "anti", dir: "cw", turns: 0.25, start: "in", end: "clockOut" },
    { type: "anti", dir: "cw", turns: 0.5, start: "in", end: "clock" },
    { type: "anti", dir: "ccw", turns: 0.25, start: "in", end: "counterOut" },
    // Dash carries the same zero-turn reverse.
    { type: "dash", dir: "cw", turns: 0.25, start: "in", end: "clockOut" },
  ];

  for (const { type, dir, turns, start, end } of expectations) {
    it(`${type} ${dir} ${turns} from ${start} -> ${end}`, () => {
      expect(
        calculateEndOrientation({
          motionType: type,
          turns,
          rotationDirection: dir,
          startLocation: "n",
          endLocation: "n",
          startOrientation: start,
        })
      ).toBe(end);
    });
  }

  it("a single quarter turn from any cardinal start lands on a radial orientation", () => {
    for (const start of CARDINAL_ORIENTATIONS) {
      for (const turns of [0.25, 0.5, 0.75, 1.25]) {
        const end = calculateEndOrientation({
          motionType: "anti",
          turns,
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "n",
          startOrientation: start,
        });
        expect(RADIAL_ORIENTATIONS).toContain(end);
      }
    }
  });

  it("approaches whole-turn parity continuously for anti/dash motions", () => {
    for (const type of ["anti", "dash"]) {
      expect(
        calculateEndOrientation({
          motionType: type,
          turns: 0.75,
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "e",
          startOrientation: "in",
        })
      ).toBe("clockIn");
      expect(
        calculateEndOrientation({
          motionType: type,
          turns: 1,
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "e",
          startOrientation: "in",
        })
      ).toBe("in");
    }
  });

  // Regression spec for the case-normalization bug (see "KNOWN BUG" block
  // below): four chained quarter turns SHOULD equal one whole turn. This
  // requires the intermediate interradial orientation produced by each
  // fractional step to normalize correctly on the next call, which
  // canonicalOrientation now guarantees.
  it("four chained 0.25 steps SHOULD equal one whole turn", () => {
    let ori: Orientation = "in";
    for (let i = 0; i < 4; i++) {
      ori = calculateEndOrientation({
        motionType: "pro",
        turns: 0.25,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: ori,
      });
    }
    expect(ori).toBe("out");
  });
});

/**
 * FIXED — interradial (L4) and center (L6) start orientations.
 *
 * calculateEndOrientation used to normalize the start orientation with a
 * blanket `startOrientation.toLowerCase()`, but switchOrientation's map and
 * the radial / center cycles are keyed with camelCase (`clockIn`, `counterOut`,
 * `centerN`...). A lowercased `"clockin"` missed every lookup and the
 * orientation was returned UNCHANGED instead of being switched / advanced.
 * Only the four cardinal radial orientations (in/out/clock/counter), which are
 * already lowercase, behaved correctly through calculateEndOrientation.
 *
 * Impact (before the fix): Level 6 (center) and Level 4 (interradial)
 * orientation propagation was silently wrong. switchOrientation itself was
 * always fine when called with the canonical camelCase — the defect was
 * purely the internal lowercasing in calculateEndOrientation.
 *
 * Fix: `canonicalOrientation()` (in orientation.ts) maps any-case input back
 * to its canonical camelCase form via a lowercase-keyed lookup table built
 * from RADIAL_CW_CYCLE + CENTER_CW_CYCLE, instead of blanket-lowercasing.
 */
describe("FIXED: interradial/center orientations now normalized in calculateEndOrientation", () => {
  it("switchOrientation is correct with canonical camelCase (control)", () => {
    expect(switchOrientation("clockIn")).toBe("counterOut");
    expect(switchOrientation("centerN")).toBe("centerS");
  });

  it("pro 1 turn from clockIn SHOULD reverse to counterOut", () => {
    expect(
      calculateEndOrientation({
        motionType: "pro",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: "clockIn",
      })
    ).toBe("counterOut");
  });

  it("static 1 turn from centerN SHOULD reverse to centerS", () => {
    expect(
      calculateEndOrientation({
        motionType: "static",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "c",
        endLocation: "c",
        startOrientation: "centerN",
      })
    ).toBe("centerS");
  });

  it("normalizes mixed-case interradial input to the canonical orientation", () => {
    expect(
      calculateEndOrientation({
        motionType: "pro",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: "CLOCKIN",
      })
    ).toBe("counterOut");
  });
});

describe("calculateEndOrientation — float", () => {
  // Float only changes orientation for cw/ccw hand paths; dash/static preserve.
  it("preserves orientation for a dash (opposite-point) hand path", () => {
    // n -> s is a dash hand path.
    expect(
      calculateEndOrientation({
        motionType: "float",
        turns: "fl",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "s",
        startOrientation: "in",
      })
    ).toBe("in");
  });

  it("preserves orientation for a static hand path", () => {
    expect(
      calculateEndOrientation({
        motionType: "float",
        turns: "fl",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
        startOrientation: "clock",
      })
    ).toBe("clock");
  });

  it("cw and ccw arcs from the same start yield switch-pair results", () => {
    // n->e is a cw hand path; n->w is a ccw hand path. Float magnitude is
    // symmetric, so the two results must be reverses of each other and differ
    // from the start.
    const cwArc = calculateEndOrientation({
      motionType: "float",
      turns: "fl",
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "e",
      startOrientation: "in",
    });
    const ccwArc = calculateEndOrientation({
      motionType: "float",
      turns: "fl",
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "w",
      startOrientation: "in",
    });
    expect(cwArc).not.toBe("in");
    expect(ccwArc).not.toBe("in");
    expect(cwArc).toBe(switchOrientation(ccwArc));
  });
});

describe("calculateEndOrientation — input normalization", () => {
  it("defaults start orientation to 'in'", () => {
    // pro, 1 turn, no startOrientation -> reverse of default 'in' = 'out'
    expect(
      calculateEndOrientation({
        motionType: "pro",
        turns: 1,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "n",
      })
    ).toBe("out");
  });

  it("is case-insensitive on motion type and orientation", () => {
    expect(
      calculateEndOrientation({
        motionType: "PRO",
        turns: 1,
        rotationDirection: "CW",
        startLocation: "N",
        endLocation: "N",
        startOrientation: "IN",
      })
    ).toBe("out");
  });

  it("treats no-rotation variants as a valid (cw-equivalent) direction", () => {
    // Whole turns ignore rotation direction, so this is well-defined.
    for (const dir of ["no_rot", "noRotation", "none"]) {
      expect(
        calculateEndOrientation({
          motionType: "static",
          turns: 2,
          rotationDirection: dir,
          startLocation: "n",
          endLocation: "n",
          startOrientation: "clock",
        })
      ).toBe("clock");
    }
  });
});

describe("calculateOrientations", () => {
  it("returns the supplied start and the computed end", () => {
    const result = calculateOrientations({
      motionType: "anti",
      turns: 1,
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "n",
      startOrientation: "clock",
    });
    // Anti, odd turn -> preserve.
    expect(result.startOrientation).toBe("clock");
    expect(result.endOrientation).toBe("clock");
  });

  it("defaults the start orientation to 'in'", () => {
    const result = calculateOrientations({
      motionType: "static",
      turns: 0,
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "n",
    });
    expect(result.startOrientation).toBe("in");
    expect(result.endOrientation).toBe("in");
  });
});

describe("getHandpathDirection", () => {
  it("classifies the clockwise compass progression as cw", () => {
    expect(getHandpathDirection("n", "e")).toBe("cw");
    expect(getHandpathDirection("e", "s")).toBe("cw");
    expect(getHandpathDirection("s", "w")).toBe("cw");
    expect(getHandpathDirection("w", "n")).toBe("cw");
  });

  it("classifies the counter-clockwise progression as ccw", () => {
    expect(getHandpathDirection("e", "n")).toBe("ccw");
    expect(getHandpathDirection("n", "w")).toBe("ccw");
    expect(getHandpathDirection("w", "s")).toBe("ccw");
    expect(getHandpathDirection("s", "e")).toBe("ccw");
  });

  it("classifies opposite points as a dash", () => {
    expect(getHandpathDirection("n", "s")).toBe("dash");
    expect(getHandpathDirection("e", "w")).toBe("dash");
    expect(getHandpathDirection("ne", "sw")).toBe("dash");
    expect(getHandpathDirection("se", "nw")).toBe("dash");
  });

  it("classifies same-point as static", () => {
    for (const loc of ["n", "e", "s", "w", "ne", "se", "sw", "nw", "c"]) {
      expect(getHandpathDirection(loc, loc)).toBe("static");
    }
  });

  it("classifies center<->perimeter as hashIn / hashOut", () => {
    expect(getHandpathDirection("c", "n")).toBe("hashOut");
    expect(getHandpathDirection("c", "ne")).toBe("hashOut");
    expect(getHandpathDirection("n", "c")).toBe("hashIn");
    expect(getHandpathDirection("sw", "c")).toBe("hashIn");
  });

  it("reversing a cw arc yields a ccw arc (and vice versa)", () => {
    const cwPairs: Array<[string, string]> = [
      ["n", "e"],
      ["e", "s"],
      ["s", "w"],
      ["w", "n"],
      ["ne", "se"],
      ["se", "sw"],
      ["sw", "nw"],
      ["nw", "ne"],
    ];
    for (const [a, b] of cwPairs) {
      expect(getHandpathDirection(a, b)).toBe("cw");
      expect(getHandpathDirection(b, a)).toBe("ccw");
    }
  });

  it("is case-insensitive", () => {
    expect(getHandpathDirection("N", "E")).toBe("cw");
    expect(getHandpathDirection("E", "W")).toBe("dash");
  });
});

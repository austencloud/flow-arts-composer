// The silent bug on this page is a picture that contradicts its line: a twin
// that is not the change its row names. These run Create's real transforms on
// the showcase step and read each result back with the engine's pair algebra.
import { beforeAll, describe, expect, it } from "vitest";
import { reflectLocation } from "@tka/sequence-engine/loop";
import { REFLECTION_AXES, TYPE_ORDER } from "./loop-kinds";
import { SHOWCASE_STEP, oneStepSequence } from "./showcase-step";
import {
  buildShowcaseTwins,
  isQuarterTurnOf,
  isTwinOf,
  reflectionLineOf,
  wrongTwins,
  type ShowcaseTwins,
} from "./showcase-twins";
import { passesOf, tourPasses } from "./tour";

const base = oneStepSequence(SHOWCASE_STEP, "loop-words-step");
const step = base.steps[0]!;
let built: ShowcaseTwins;

beforeAll(async () => {
  built = await buildShowcaseTwins(base);
});

describe("loop-words showcase twins", () => {
  it.each(TYPE_ORDER)("the %s twin is the step under that change", (kind) => {
    expect(isTwinOf(kind, step, built.types[kind].steps[0]!)).toBe(true);
  });

  it.each(REFLECTION_AXES)("the %s twin reflects across that line", (axis) => {
    expect(reflectionLineOf(step, built.lines[axis].steps[0]!)).toBe(axis);
  });

  it("the quarter-turn twin is a quarter turn, not a half", () => {
    expect(isQuarterTurnOf(step, built.quarter.steps[0]!)).toBe(true);
    expect(isTwinOf("rotated", step, built.quarter.steps[0]!)).toBe(false);
  });

  it("the page's own check finds nothing wrong", () => {
    expect(wrongTwins(step, built)).toEqual([]);
  });

  // The player reloads only when a sequence id changes.
  it("every twin has its own id", () => {
    const ids = [
      base.id,
      ...Object.values(built.types).map((s) => s.id),
      ...Object.values(built.lines).map((s) => s.id),
      built.quarter.id,
    ];
    // Reflected's twin is the left-right line's, shown under both names.
    expect(new Set(ids).size).toBe(ids.length - 1);
  });

  it("the step spins both props, one pro and one anti", () => {
    const left = SHOWCASE_STEP.motions.left?.motionType;
    const right = SHOWCASE_STEP.motions.right?.motionType;
    expect(new Set([left, right])).toEqual(new Set(["pro", "anti"]));
  });

  // A step that is its own reflection would look the same twice.
  it.each(REFLECTION_AXES)("the step changes when reflected across %s", (axis) => {
    const moved = (["left", "right"] as const).some((hand) => {
      const m = SHOWCASE_STEP.motions[hand]!;
      return (
        reflectLocation(String(m.startLocation), axis) !== String(m.startLocation) ||
        reflectLocation(String(m.endLocation), axis) !== String(m.endLocation)
      );
    });
    expect(moved).toBe(true);
  });
});

describe("loop-words tour", () => {
  it("plays each type twice, Reflected once per line, in the page's order", () => {
    const tour = tourPasses(true);
    expect(tour.map((p) => p.kind)).toEqual([
      "rotated",
      "rotated",
      "reflected",
      "reflected",
      "reflected",
      "reflected",
      "swapped",
      "swapped",
      "inverted",
      "inverted",
      "rewound",
      "rewound",
    ]);
    expect(passesOf("reflected", true).map((p) => p.twin)).toEqual([
      ...REFLECTION_AXES,
    ]);
  });

  it("Rotated turns a half, then a quarter, or a half twice without one", () => {
    expect(passesOf("rotated", true).map((p) => p.twin)).toEqual([
      "half-turn",
      "quarter-turn",
    ]);
    expect(passesOf("rotated", false).map((p) => p.twin)).toEqual([
      "half-turn",
      "half-turn",
    ]);
  });
});

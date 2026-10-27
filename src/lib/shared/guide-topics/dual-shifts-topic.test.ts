import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  DUAL_SHIFT_KEY,
  DUAL_SHIFT_MODE_GUIDES,
  DUAL_SHIFT_MODES,
  DUAL_SHIFT_MODES_BY_PAIR,
  DUAL_SHIFT_TIMINGS,
  DUAL_SHIFT_DIRECTIONS,
  DUAL_SHIFTS_TOPIC_UNITS,
  DUAL_SHIFTS_WEB_COPY,
  dualShiftElement,
  dualShiftModeAt,
  dualShiftSteps,
  dualShiftSwitchingSteps,
  plainLine,
} from "./dual-shifts-topic";
import { TIMING_DIRECTION_ARTICLE_SLUGS } from "../../../routes/(public)/timing-and-direction/_data/timing-direction-articles";

const english = en as Record<string, string>;
const german = de as Record<string, string>;

const motions = (step: StepData) =>
  step.motions as Record<
    "left" | "right",
    { motionType: MotionType; startLocation: string; endLocation: string }
  >;

/** "alpha1" → "alpha": the placement family a box starts or ends in. */
const family = (placement: unknown) => String(placement).replace(/\d+$/, "");

describe("Type 1 Dual-Shifts topic record", () => {
  it("resolves every unit in English and German", () => {
    const keyLines = Object.values(DUAL_SHIFT_KEY).flatMap((axis) =>
      Object.values(axis).flatMap((entry) => [entry.name, entry.says])
    );
    for (const key of [
      ...Object.values(DUAL_SHIFTS_TOPIC_UNITS),
      ...Object.values(DUAL_SHIFTS_WEB_COPY),
      ...keyLines,
    ]) {
      expect(english[key], key).toBeTruthy();
      expect(german[key], key).toBeTruthy();
    }
  });

  it("links each mode to a Timing and Direction mode guide that exists", () => {
    for (const mode of DUAL_SHIFT_MODES) {
      const href = DUAL_SHIFT_MODE_GUIDES[mode.id];
      const slug = href.replace("/timing-and-direction/", "");
      expect(TIMING_DIRECTION_ARTICLE_SLUGS, href).toContain(slug);
    }
  });

  it("places each mode at one timing and direction with its element", () => {
    expect(dualShiftModeAt("split", "same").id).toBe("split-same");
    expect(dualShiftModeAt("tog", "same").id).toBe("tog-same");
    expect(dualShiftModeAt("split", "opp").id).toBe("split-opp");
    expect(dualShiftModeAt("tog", "opp").id).toBe("tog-opp");
    expect(dualShiftModeAt("quarter", "opp").id).toBe("quarter-opp");
    expect(dualShiftModeAt("quarter", "same").id).toBe("quarter-same");
    // The 3 x 2 key covers every mode exactly once.
    const cells = DUAL_SHIFT_TIMINGS.flatMap((timing) =>
      DUAL_SHIFT_DIRECTIONS.map((dir) => dualShiftModeAt(timing, dir).id)
    );
    expect(new Set(cells).size).toBe(DUAL_SHIFT_MODES.length);
    expect(
      DUAL_SHIFT_MODES.map((mode) => dualShiftElement(mode).element)
    ).toEqual(["water", "earth", "fire", "air", "moon", "sun"]);
    for (const mode of DUAL_SHIFT_MODES) {
      expect(dualShiftElement(mode).accentColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("opens with three sentences, the first a one-line lede", () => {
    for (const catalog of [english, german]) {
      const lines = catalog
        .verified_level1_hm_type1_106!.split(/<br\s*\/?>/i)
        .map((line) => line.trim());
      expect(lines).toHaveLength(3);
      expect(plainLine(lines[0]!)).toMatch(/\.$/);
      expect(plainLine(lines[0]!)).not.toMatch(/<|>/);
    }
  });

  it("names the six modes in the page's order", () => {
    expect(DUAL_SHIFT_MODES.map((mode) => mode.id)).toEqual([
      "split-same",
      "tog-same",
      "split-opp",
      "tog-opp",
      "quarter-opp",
      "quarter-same",
    ]);
    expect(DUAL_SHIFT_MODES.map((mode) => english[mode.name])).toEqual([
      "Split-Same",
      "Tog-Same",
      "Split-Opp",
      "Tog-Opp",
      "Quarter-Opp",
      "Quarter-Same",
    ]);
    expect(DUAL_SHIFT_MODES_BY_PAIR.same.map((mode) => mode.travel)).toEqual([
      "α→α",
      "β→β",
      "γ→γ",
    ]);
    expect(DUAL_SHIFT_MODES_BY_PAIR.opp.map((mode) => mode.travel)).toEqual([
      "α↔β",
      "α↔β",
      "γ→γ",
    ]);
  });

  it("keeps the Gamma page's words verbatim in every catalog", () => {
    const keys = [
      DUAL_SHIFTS_WEB_COPY.quarterOpp,
      DUAL_SHIFTS_WEB_COPY.quarterSame,
      DUAL_SHIFTS_WEB_COPY.quarterOppLead,
      DUAL_SHIFTS_WEB_COPY.quarterSameLead,
      DUAL_SHIFTS_WEB_COPY.switchingLead,
      DUAL_SHIFTS_WEB_COPY.continuous,
      DUAL_SHIFTS_WEB_COPY.gammaPractice,
    ];
    for (const key of keys) expect(german[key], key).toBe(english[key]);
    expect(english[DUAL_SHIFTS_WEB_COPY.modesLead]).toContain("six modes");
  });

  it("gives each mode and the switching sequence a static start box and a closed loop", () => {
    const loops = [
      ...DUAL_SHIFT_MODES.map((mode) => dualShiftSteps(mode)),
      dualShiftSwitchingSteps(),
    ];
    expect(loops.map((steps) => steps.length)).toEqual([5, 5, 5, 5, 5, 5, 9]);
    for (const steps of loops) {
      const start = motions(steps[0]!);
      expect(start.left.motionType).toBe(MotionType.STATIC);
      expect(start.right.motionType).toBe(MotionType.STATIC);
      expect(steps[0]!.letter).toBeNull();
      // Each count begins where the one before ended, and count 4 returns
      // to the start box.
      for (let n = 1; n < steps.length; n++) {
        const prev = motions(steps[n - 1]!);
        const next = motions(steps[n]!);
        expect(next.left.startLocation).toBe(prev.left.endLocation);
        expect(next.right.startLocation).toBe(prev.right.endLocation);
        expect(next.left.motionType).toBe(MotionType.PRO);
        expect(next.right.motionType).toBe(MotionType.PRO);
      }
      const last = motions(steps.at(-1)!);
      expect(last.left.endLocation).toBe(start.left.startLocation);
      expect(last.right.endLocation).toBe(start.right.startLocation);
    }
  });

  it("keeps Same modes in one placement and sends Opp modes between α and β", () => {
    const placement = { "α→α": "alpha", "β→β": "beta", "γ→γ": "gamma" };
    for (const mode of DUAL_SHIFT_MODES_BY_PAIR.same) {
      const expected = placement[mode.travel as keyof typeof placement];
      for (const step of dualShiftSteps(mode).slice(1)) {
        expect(family(step.startPlacement)).toBe(expected);
        expect(family(step.endPlacement)).toBe(expected);
      }
    }
    for (const mode of DUAL_SHIFT_MODES_BY_PAIR.opp.filter(
      (m) => m.timing !== "quarter"
    )) {
      const steps = dualShiftSteps(mode).slice(1);
      expect(steps.map((step) => family(step.startPlacement))).toEqual([
        "beta",
        "alpha",
        "beta",
        "alpha",
      ]);
      expect(steps.map((step) => family(step.endPlacement))).toEqual([
        "alpha",
        "beta",
        "alpha",
        "beta",
      ]);
      expect(steps.map((step) => step.letter)).toEqual([
        Letter.D,
        Letter.J,
        Letter.D,
        Letter.J,
      ]);
    }
  });

  it("keeps the Quarter modes and the switching sequence in γ", () => {
    for (const steps of [
      ...DUAL_SHIFT_MODES.filter((m) => m.timing === "quarter").map((m) =>
        dualShiftSteps(m)
      ),
      dualShiftSwitchingSteps(),
    ]) {
      for (const step of steps) {
        expect(family(step.startPlacement)).toBe("gamma");
        expect(family(step.endPlacement)).toBe("gamma");
      }
    }
  });

  it("letters P only on Quarter-Opp's same-edge counts", () => {
    const quarterOpp = DUAL_SHIFT_MODES.find((m) => m.id === "quarter-opp")!;
    const sameEdge = (step: StepData) => {
      const { left, right } = motions(step);
      return (
        left.startLocation === right.endLocation &&
        left.endLocation === right.startLocation
      );
    };
    const steps = dualShiftSteps(quarterOpp);
    expect(steps.map((step) => step.letter)).toEqual([
      null,
      null,
      Letter.P,
      null,
      Letter.P,
    ]);
    expect(steps.slice(1).map(sameEdge)).toEqual([false, true, false, true]);
    // No other loop puts both hands on one edge, so none needs a letter.
    const quarterSame = DUAL_SHIFT_MODES.find((m) => m.id === "quarter-same")!;
    for (const step of [
      ...dualShiftSteps(quarterSame),
      ...dualShiftSwitchingSteps(),
    ]) {
      expect(sameEdge(step)).toBe(false);
      expect(step.letter).toBeNull();
    }
  });
});

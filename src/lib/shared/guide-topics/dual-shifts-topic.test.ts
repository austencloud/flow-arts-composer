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
  DUAL_SHIFTS_TOPIC_UNITS,
  DUAL_SHIFTS_WEB_COPY,
  dualShiftElement,
  dualShiftModeAt,
  dualShiftSteps,
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
    expect(
      DUAL_SHIFT_MODES.map((mode) => dualShiftElement(mode).element)
    ).toEqual(["water", "earth", "fire", "air"]);
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

  it("names two Same modes and two Opp modes, in the book's order", () => {
    expect(DUAL_SHIFT_MODES.map((mode) => mode.id)).toEqual([
      "split-same",
      "tog-same",
      "split-opp",
      "tog-opp",
    ]);
    expect(DUAL_SHIFT_MODES_BY_PAIR.same.map((mode) => mode.travel)).toEqual([
      "α→α",
      "β→β",
    ]);
    expect(DUAL_SHIFT_MODES_BY_PAIR.opp.map((mode) => mode.travel)).toEqual([
      "α↔β",
      "α↔β",
    ]);
  });

  it("gives each mode a static start box and a closed four-count loop", () => {
    for (const mode of DUAL_SHIFT_MODES) {
      const steps = dualShiftSteps(mode);
      expect(steps).toHaveLength(5);
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
      const last = motions(steps[4]!);
      expect(last.left.endLocation).toBe(start.left.startLocation);
      expect(last.right.endLocation).toBe(start.right.startLocation);
    }
  });

  it("keeps Same modes in one placement and sends Opp modes between α and β", () => {
    for (const mode of DUAL_SHIFT_MODES_BY_PAIR.same) {
      const expected = mode.travel === "α→α" ? "alpha" : "beta";
      for (const step of dualShiftSteps(mode).slice(1)) {
        expect(family(step.startPlacement)).toBe(expected);
        expect(family(step.endPlacement)).toBe(expected);
      }
    }
    for (const mode of DUAL_SHIFT_MODES_BY_PAIR.opp) {
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
});

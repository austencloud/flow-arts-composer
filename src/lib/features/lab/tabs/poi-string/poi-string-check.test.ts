import { describe, expect, it } from "vitest";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  CAPS,
  CAP_HAND_PATHS,
  capOnPath,
  capStrip,
  type Cap,
} from "#lib/shared/guide-topics/caps-topic.js";
import {
  checkPoiString,
  DEFAULT_POI_STRING_OPTIONS,
} from "./poi-string-check.js";

const noGravity = { ...DEFAULT_POI_STRING_OPTIONS, gravity: false };
const hand = (steps: StepData[], side: "left" | "right") =>
  steps.slice(1).map((step) => step.motions[side]!);
const both = (cap: Cap, options = noGravity) => {
  const steps = capStrip(cap);
  return [hand(steps, "left"), hand(steps, "right")].map(
    (motions) => checkPoiString(motions, options).verdict
  );
};

describe("checkPoiString", () => {
  it("pulls an extension circle straight along the string", () => {
    const cap = CAPS.find((c) => c.id === "1-EE")!;
    const result = checkPoiString(hand(capStrip(cap), "right"), noGravity);
    expect(result.verdict).toBe("clean");
    expect(Math.max(...result.beats.map((b) => b.maxLean))).toBeLessThan(1);
  });

  // Extension and antispin hand off without the poi changing speed; a
  // prospin beat spins faster than its neighbours, so the hand must steer.
  it("passes every chart CAP without prospin, and strains the rest", () => {
    for (const cap of CAPS) {
      const hasProspin = /I/.test(cap.id.split("-")[1]!);
      const verdicts = both(cap);
      expect(verdicts).not.toContain("slack");
      if (!hasProspin) expect(verdicts, cap.id).toEqual(["clean", "clean"]);
      else expect(verdicts, cap.id).toContain("strain");
    }
  });

  // Turning round while the poi points sideways jerks the string along its
  // length. At low turns that leaves it slack; a faster spin keeps it taut,
  // so the hand only has to steer hard.
  it("goes slack on antispin with no turns and on a slow turnaround off the out point", () => {
    const path = CAP_HAND_PATHS[0]!;
    const right = { motion: "anti", turns: 1 } as const;
    const left = (turns: 0 | 0.25 | 0.5 | 1.5) =>
      checkPoiString(
        hand(
          capStrip(capOnPath(path, { motion: "anti", turns }, right)),
          "left"
        ),
        noGravity
      ).verdict;
    for (const turns of [0, 0.25, 0.5] as const)
      expect(left(turns), String(turns)).toBe("slack");
    expect(left(1.5)).toBe("strain");
  });

  it("lets gravity take over at a slow tempo", () => {
    const cap = CAPS.find((c) => c.id === "1-AA")!;
    const left = hand(capStrip(cap), "left");
    const at = (bpm: number) =>
      checkPoiString(left, { ...DEFAULT_POI_STRING_OPTIONS, bpm }).verdict;
    expect(at(60)).toBe("slack");
    expect(at(180)).not.toBe("slack");
  });
});

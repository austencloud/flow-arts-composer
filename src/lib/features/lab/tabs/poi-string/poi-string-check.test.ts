import { describe, expect, it } from "vitest";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { CAPS, capStrip } from "#lib/shared/guide-topics/caps-topic.js";
import {
  DEFAULT_POI_STRING_OPTIONS,
  LOOSE_TENSION,
  solvePoiHand,
} from "./poi-string-check.js";

const noGravity = { ...DEFAULT_POI_STRING_OPTIONS, gravity: false };
const hand = (steps: StepData[], side: "left" | "right") =>
  steps.slice(1).map((step) => step.motions[side]!);
const capHand = (id: string, side: "left" | "right") =>
  hand(capStrip(CAPS.find((c) => c.id === id)!), side);

describe("solvePoiHand", () => {
  it("leaves the hand on the drawn circle for a plain extension", () => {
    const result = solvePoiHand(capHand("1-EE", "right"), noGravity);
    expect(result.maxStray).toBeLessThan(0.01);
    expect(result.effort).toBe("close");
  });

  // Austen: every one of Gage's 72 works on real poi. The solver agrees when
  // no hand has to go slack or cross to the far side of its head.
  it("finds a hand path for every chart CAP at the default settings", () => {
    const L = DEFAULT_POI_STRING_OPTIONS.stringLength;
    for (const cap of CAPS) {
      const steps = capStrip(cap);
      for (const side of ["left", "right"] as const) {
        const result = solvePoiHand(hand(steps, side));
        expect(result.minTension, `${cap.id} ${side}`).toBeGreaterThan(
          LOOSE_TENSION
        );
        expect(result.maxStray, `${cap.id} ${side}`).toBeLessThan(L);
      }
    }
  });

  it("keeps the hand one string length from the head on every frame", () => {
    const L = DEFAULT_POI_STRING_OPTIONS.stringLength;
    for (const s of solvePoiHand(capHand("1-IA", "left")).samples)
      expect(Math.hypot(s.head.x - s.hand.x, s.head.y - s.hand.y)).toBeCloseTo(
        L,
        6
      );
  });

  // A prospin beat meets a slower spin at the beat line. Spreading that
  // change of speed over part of a beat, as a real poi does, asks less of
  // the hand than making it in an instant.
  it("asks less of the hand when the poi eases into a new speed", () => {
    const motions = capHand("1-IA", "left");
    const at = (speedBlendBeats: number) =>
      solvePoiHand(motions, { ...noGravity, speedBlendBeats }).maxStray;
    expect(at(0.25)).toBeLessThan(at(0.02));
  });

  // Too slow for the spin to hold the poi out, so at the top of the circle
  // the hand has to come round above the head and hold it up.
  it("puts the hand above the poi at the top of a slow wall-plane circle", () => {
    const L = DEFAULT_POI_STRING_OPTIONS.stringLength;
    const motions = capHand("1-EE", "right");
    const at = (bpm: number) =>
      solvePoiHand(motions, { ...DEFAULT_POI_STRING_OPTIONS, bpm }).maxStray;
    expect(at(60)).toBeGreaterThan(L);
    expect(at(180)).toBeLessThan(L / 2);
  });
});

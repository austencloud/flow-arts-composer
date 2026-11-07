import { describe, expect, it } from "vitest";
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import {
  mandalaPublicPayloadFromArtifact,
  mandalaPublicTitle,
} from "../mandala-public-revision";

const motion = (startLocation: string, endLocation: string) => ({
  motionType: "pro",
  rotationDirection: "cw",
  startLocation,
  endLocation,
  turns: 0,
  startOrientation: "in",
  endOrientation: "in",
  propType: "fan",
});

const legacyPayload = {
  sourceWord: "ΩORZ",
  variant: "blue",
  pathShape: "arc",
  bluePropType: "fan",
  redPropType: "hand",
  steps: [
    {
      id: "step-1",
      letter: "A",
      stepNumber: 1,
      duration: 1,
      isBlank: false,
      startPosition: "alpha1",
      endPosition: "alpha3",
      blueReversal: false,
      redReversal: false,
      motions: { blue: motion("n", "e"), red: motion("s", "w") },
    },
  ],
};

describe("mandalaPublicTitle", () => {
  it("shortens a repeated word to the word itself", () => {
    expect(mandalaPublicTitle("FΨFΨFΨFΨ")).toBe("FΨ");
  });

  it("leaves a word with no repeat alone", () => {
    expect(mandalaPublicTitle("ΩORZ")).toBe("ΩORZ");
  });

  it("leaves a typed name alone, even one that repeats", () => {
    expect(mandalaPublicTitle("Sunrise")).toBe("Sunrise");
    expect(mandalaPublicTitle("hahaha")).toBe("hahaha");
    expect(mandalaPublicTitle("Mandala Duo")).toBe("Mandala Duo");
  });
});

describe("mandalaPublicPayloadFromArtifact", () => {
  it("gives a mandala published with red and blue hands data the renderer can draw", () => {
    const payload = mandalaPublicPayloadFromArtifact(legacyPayload);
    if (!payload) throw new Error("the old mandala should still parse");

    expect(payload.variant).toBe("left");
    expect(payload.leftPropType).toBe("fan");
    expect(payload.rightPropType).toBe("hand");
    expect(payload.sourceWord).toBe("ΩORZ");
    const [step] = payload.steps;
    if (!step) throw new Error("the mandala lost its steps");
    expect(interpolatePropAngles(step, 0.5).isValid).toBe(true);
  });

  it("refuses a payload that is not a mandala", () => {
    expect(mandalaPublicPayloadFromArtifact({ steps: "nope" })).toBeNull();
    expect(mandalaPublicPayloadFromArtifact(null)).toBeNull();
  });
});

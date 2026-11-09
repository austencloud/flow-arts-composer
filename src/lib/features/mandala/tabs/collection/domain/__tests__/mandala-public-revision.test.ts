import { describe, expect, it } from "vitest";
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  createMandalaPublicRevision,
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

  it("carries the maker's colors through to the guest view", () => {
    const colors = { left: "#d4af37", right: "#b8722c" };
    const payload = mandalaPublicPayloadFromArtifact({
      ...legacyPayload,
      colors,
    });
    expect(payload?.colors).toEqual(colors);
  });

  // Published payloads are not inspected by the database rules and the colors
  // land inside SVG attributes in a guest's browser.
  it.each([
    { left: '"><script>alert(1)</script>', right: "#b8722c" },
    { left: "#d4af37", right: "url(javascript:alert(1))" },
    { left: "#d4af37" },
    "#d4af37",
  ])("drops colors that are not a pair of hex values, keeping the mandala", (colors) => {
    const payload = mandalaPublicPayloadFromArtifact({
      ...legacyPayload,
      colors,
    });
    expect(payload).not.toBeNull();
    expect(payload && "colors" in payload).toBe(false);
  });
});

describe("createMandalaPublicRevision", () => {
  const fixture = {
    id: "mandala-1",
    name: "Bloom",
    steps: [],
    variant: "both",
    leftPropType: "staff",
    rightPropType: "staff",
    createdAt: 123,
  } as const;

  // The 51 mandalas already public have no colors. If the absent field changed
  // their digest, every one would turn into a new revision on its next publish.
  it("does not change the content address of a mandala with no colors", async () => {
    const before = await canonicalDigest({
      steps: [],
      variant: "both",
      leftPropType: "staff",
      rightPropType: "staff",
    });
    const { contentDigest } = await createMandalaPublicRevision({
      ...fixture,
      steps: [],
    });
    expect(contentDigest).toBe(before);
  });

  it("makes a recolored mandala a new revision", async () => {
    const plain = await createMandalaPublicRevision({ ...fixture, steps: [] });
    const gilded = await createMandalaPublicRevision({
      ...fixture,
      steps: [],
      colors: { left: "#d4af37", right: "#b8722c" },
    });
    expect(gilded.revisionId).not.toBe(plain.revisionId);
  });
});

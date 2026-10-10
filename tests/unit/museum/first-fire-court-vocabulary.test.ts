import { describe, expect, it } from "vitest";
import {
  FIRST_FIRE_COURT_VOCABULARY,
  firstFireCourtEffectId,
  firstFireCourtLayers,
} from "../../../src/lib/features/museum/data/first-fire-court-vocabulary";

describe("First Fire court vocabulary", () => {
  it("adds one voice per court in walk order", () => {
    expect(FIRST_FIRE_COURT_VOCABULARY.map((entry) => entry.shrineId)).toEqual([
      "dj",
      "ek",
      "fl",
    ]);
    expect(FIRST_FIRE_COURT_VOCABULARY.map((entry) => entry.addsEffectId)).toEqual([
      "charcoal",
      "fire",
      "zap",
    ]);
  });

  it("accumulates rather than replaces", () => {
    expect(firstFireCourtLayers("dj")).toEqual(["charcoal"]);
    expect(firstFireCourtLayers("ek")).toEqual(["charcoal", "fire"]);
    expect(firstFireCourtLayers("fl")).toEqual(["charcoal", "fire", "zap"]);
  });

  it("gives each performer the voice its own court adds", () => {
    // The performer states the NEW voice; the accumulated layers burn at the
    // court perimeter. If the performer carried every layer, no mouth would be
    // legible and the room would read as one orange blur.
    expect(firstFireCourtEffectId("dj")).toBe("charcoal");
    expect(firstFireCourtEffectId("ek")).toBe("fire");
    expect(firstFireCourtEffectId("fl")).toBe("zap");
  });

  it("uses only ids that exist in the effect registry", async () => {
    const { EFFECTS } = await import(
      "#lib/shared/animation-engine/components/effects-panel/effect-registry.js"
    );
    const known = new Set(EFFECTS.map((effect) => effect.id));
    for (const entry of FIRST_FIRE_COURT_VOCABULARY) {
      expect(known.has(entry.addsEffectId)).toBe(true);
    }
  });
});

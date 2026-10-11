import { describe, it, expect } from "vitest";
import {
  generateSpecialOverrideKey,
  parseSpecialOverrideKey,
} from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";

/**
 * Regression: WASD-nudging one arrow's Special JSON override moved BOTH arrows.
 *
 * Root cause — the override key omitted the per-arrow discriminator. For any
 * letter whose two hands share a motion type (e.g. letter A: both Pro), the
 * blue and red arrows collapsed to an identical key, so an override written
 * for one was read back for both. The static special-placement JSON separates
 * the arrows by `attributeKey` (which is the color for non-hybrid letters);
 * the Firestore overlay key must carry that same discriminator so it is keyed
 * 1:1 with the static entry it shadows.
 */
describe("generateSpecialOverrideKey — per-arrow discriminator", () => {
  const shared = {
    placementFrame: "canonical",
    oriFolder: "from_layer1",
    letter: "A",
    turnsTuple: "(0, 1.5)",
    motionType: "pro",
    // propType is the mandatory 7th key segment (fan vs staff overrides must not bleed).
    // Canonical source: src/lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.ts:75 (added in commit 20f36c5def).
    propType: "staff",
  };

  it("produces DIFFERENT keys for the two arrows of a same-motion-type letter", () => {
    const leftKey = generateSpecialOverrideKey({
      ...shared,
      attributeKey: "blue",
    });
    const rightKey = generateSpecialOverrideKey({
      ...shared,
      attributeKey: "red",
    });
    expect(leftKey).not.toBe(rightKey);
  });

  it("round-trips through parseSpecialOverrideKey including attributeKey", () => {
    const key = generateSpecialOverrideKey({ ...shared, attributeKey: "red" });
    const parsed = parseSpecialOverrideKey(key);
    expect(parsed).toEqual({ ...shared, attributeKey: "red" });
  });

  it("keeps hybrid-letter keys distinct via their attribute keys", () => {
    const proKey = generateSpecialOverrideKey({
      placementFrame: "canonical",
      oriFolder: "from_layer1",
      letter: "C",
      turnsTuple: "(1, 1)",
      motionType: "pro",
      attributeKey: "pro_from_layer1",
    });
    const antiKey = generateSpecialOverrideKey({
      placementFrame: "canonical",
      oriFolder: "from_layer1",
      letter: "C",
      turnsTuple: "(1, 1)",
      motionType: "anti",
      attributeKey: "anti_from_layer1",
    });
    expect(proKey).not.toBe(antiKey);
  });
});

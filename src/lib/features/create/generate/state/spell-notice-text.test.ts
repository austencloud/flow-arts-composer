import { describe, expect, it } from "vitest";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  spellLoopNotAppliedText,
  spellRelaxedText,
} from "./generate-actions.svelte";

// The notices come from the catalogue, so a missing key would show the raw key.
describe("spell notices", () => {
  it("reads each relaxed-setting notice from the catalogue", () => {
    for (const relaxed of [
      "hands",
      "props",
      "handsAndProps",
      "matchHandTurns",
    ] as const) {
      const text = spellRelaxedText(relaxed);
      expect(text).not.toMatch(/^generator_/);
      expect(text).toMatch(/^This word can't keep/);
    }
  });

  it("names the picked LOOP in its card's own words", () => {
    const text = spellLoopNotAppliedText(LOOPType.ROTATED);
    expect(text).toContain("Rotated");
    expect(text).not.toContain("{name}");
  });
});

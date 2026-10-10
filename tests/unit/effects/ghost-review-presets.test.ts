import { describe, expect, it } from "vitest";
import { GHOST_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/ghost-presets.js";
import { EFFECT_CONTROLS } from "#lib/shared/effects/domain/effect-control-manifest.js";
import {
  GHOST_REVIEW_PRESETS,
  ghostReviewIntentMatches,
  parseGhostPresetVerdicts,
  resolveGhostReviewIntent,
  toggleGhostPresetVerdict,
} from "../../../src/routes/test/ghost-presets/ghost-review-presets";

describe("Ghost preset review candidates", () => {
  it("publishes no Ghost presets", () => {
    expect(GHOST_PRESETS).toEqual([]);
  });

  it("keeps four studies without publishing them as presets", () => {
    expect(GHOST_REVIEW_PRESETS).toHaveLength(4);
    expect(new Set(GHOST_REVIEW_PRESETS.map((preset) => preset.id)).size).toBe(
      4
    );
    expect(
      GHOST_REVIEW_PRESETS.filter((preset) => preset.source === "production")
    ).toHaveLength(0);
    expect(
      GHOST_REVIEW_PRESETS.filter((preset) => preset.source === "study")
    ).toHaveLength(4);
  });

  it("resolves every candidate to a complete, bounded Ghost intent", () => {
    for (const preset of GHOST_REVIEW_PRESETS) {
      const intent = resolveGhostReviewIntent(preset);
      expect(intent.intensity).toBeGreaterThanOrEqual(0);
      expect(intent.intensity).toBeLessThanOrEqual(1);
      expect(intent.decay).toBeGreaterThanOrEqual(1);
      expect(intent.decay).toBeLessThanOrEqual(10);
      expect(intent.interval).toBeGreaterThanOrEqual(0);
      expect(intent.interval).toBeLessThanOrEqual(1);
    }
  });

  it("offers no color control: ghosts take the prop's own colors", () => {
    expect(
      EFFECT_CONTROLS.ghost.some((control) => control.type === "colorPair")
    ).toBe(false);
  });

  it("detects when live tuning has moved off the selected preset", () => {
    const expected = resolveGhostReviewIntent(GHOST_REVIEW_PRESETS[0]!);
    expect(ghostReviewIntentMatches(expected, expected)).toBe(true);
    expect(
      ghostReviewIntentMatches(
        { ...expected, intensity: expected.intensity - 0.05 },
        expected
      )
    ).toBe(false);
  });
});

describe("Ghost preset verdicts", () => {
  it("toggles a verdict off when the same mark is pressed again", () => {
    expect(toggleGhostPresetVerdict(undefined, "favorite")).toBe("favorite");
    expect(toggleGhostPresetVerdict("favorite", "favorite")).toBeUndefined();
  });

  it("replaces one verdict with the other", () => {
    expect(toggleGhostPresetVerdict("favorite", "pass")).toBe("pass");
    expect(toggleGhostPresetVerdict("pass", "favorite")).toBe("favorite");
  });

  it("loads only known preset ids and valid verdicts", () => {
    const knownId = GHOST_REVIEW_PRESETS[0]!.id;
    expect(
      parseGhostPresetVerdicts(
        JSON.stringify({
          [knownId]: "favorite",
          unknown: "pass",
          [GHOST_REVIEW_PRESETS[1]!.id]: "maybe",
        })
      )
    ).toEqual({ [knownId]: "favorite" });
    expect(parseGhostPresetVerdicts("not-json")).toEqual({});
  });
});

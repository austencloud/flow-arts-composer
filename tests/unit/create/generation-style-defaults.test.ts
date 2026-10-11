import { describe, expect, it } from "vitest";
import { GENERATE_DEFAULT_CONFIG } from "#lib/features/create/generate/state/generate-config.svelte.js";
import { DEFAULT_SOLO_LOOP_RECIPE } from "#lib/features/fuse/services/solo-loop-generator.js";
import { DEFAULT_GENERATION_STYLE } from "#lib/shared/create/domain/generation-style.js";

describe("shared generation style defaults", () => {
  it("keeps Generate and Fuse on the same production policy", () => {
    expect({
      constraintPreset: GENERATE_DEFAULT_CONFIG.constraintPreset,
      handPathMode: GENERATE_DEFAULT_CONFIG.handPathMode,
      motionTypeFilter: GENERATE_DEFAULT_CONFIG.motionTypeFilter,
    }).toEqual(DEFAULT_GENERATION_STYLE);

    expect({
      constraintPreset: DEFAULT_SOLO_LOOP_RECIPE.constraintPreset,
      handPathMode: DEFAULT_SOLO_LOOP_RECIPE.handPathMode,
      motionTypeFilter: DEFAULT_SOLO_LOOP_RECIPE.motionTypeFilter,
    }).toEqual(DEFAULT_GENERATION_STYLE);
  });
});

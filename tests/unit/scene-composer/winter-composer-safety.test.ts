import { describe, expect, it } from "vitest";
import { validateWinterComposerPlacement } from "#lib/shared/3d/environments/scenes/winter/winter-composer-plugin.js";
import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";

function placementAt(x: number, z: number): ComposerPlacement {
  return {
    id: "test-tree",
    objectKey: "winter-pine-tall",
    position: [x, 0, z],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

describe("Winter composer safety", () => {
  it("rejects props moved into an authored settlement route", () => {
    expect(validateWinterComposerPlacement(placementAt(2, 18))).toBe(
      "Protected settlement route"
    );
  });

  it("accepts a point outside the protected routes", () => {
    expect(validateWinterComposerPlacement(placementAt(28, 30))).toBeNull();
  });
});

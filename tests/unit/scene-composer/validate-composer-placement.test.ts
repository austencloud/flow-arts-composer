import { describe, expect, it, vi } from "vitest";
import { validateComposerPlacement } from "#lib/shared/3d/scene-composer/validate-composer-placement.js";
import type {
  ComposerPlacement,
  PlacementConstraints,
} from "#lib/shared/3d/scene-composer/types.js";

function placement(
  id: string,
  position: [number, number, number],
  objectKey = "tree",
  visible = true
): ComposerPlacement {
  return {
    id,
    objectKey,
    position,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    visible,
  };
}

describe("validateComposerPlacement", () => {
  it("rejects exclusion zones before scene-specific validation", () => {
    const customValidate = vi.fn(() => "custom rejection");
    const constraints: PlacementConstraints = {
      exclusionZones: [
        { center: [0, 0, 0], radius: 3, reason: "Protected stage" },
      ],
      validate: customValidate,
    };

    expect(
      validateComposerPlacement(placement("draft", [1, 0, 1]), [], constraints)
    ).toBe("Protected stage");
    expect(customValidate).not.toHaveBeenCalled();
  });

  it("ignores the edited object and hidden peers for spacing", () => {
    const constraints: PlacementConstraints = { minSpacing: 2 };
    const existing = [
      placement("moving", [0, 0, 0]),
      placement("hidden", [0.5, 0, 0], "rock", false),
    ];

    expect(
      validateComposerPlacement(
        placement("moving", [0.5, 0, 0]),
        existing,
        constraints,
        { ignoreId: "moving" }
      )
    ).toBeNull();
  });

  it("enforces new-object limits without blocking existing transforms", () => {
    const constraints: PlacementConstraints = {
      maxObjects: 1,
      maxPerType: { tree: 1 },
    };
    const existing = [placement("existing", [5, 0, 5])];

    expect(
      validateComposerPlacement(
        placement("draft", [8, 0, 8]),
        existing,
        constraints,
        { isNew: true }
      )
    ).toBe("Scene limit: 1 objects");
    expect(
      validateComposerPlacement(
        placement("existing", [8, 0, 8]),
        existing,
        constraints,
        { ignoreId: "existing" }
      )
    ).toBeNull();
  });

  it("passes visible peers to the scene-specific validator", () => {
    const customValidate = vi.fn(() => null);
    const constraints: PlacementConstraints = { validate: customValidate };
    const peers = [placement("other", [4, 0, 4])];
    const candidate = placement("moving", [8, 0, 8]);

    expect(
      validateComposerPlacement(candidate, peers, constraints, {
        ignoreId: "moving",
      })
    ).toBeNull();
    expect(customValidate).toHaveBeenCalledWith(candidate, peers);
  });
});

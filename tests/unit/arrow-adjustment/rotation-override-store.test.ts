import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRotationOverrides,
  getStoredRotationOverride,
  loadRotationOverrides,
  ROTATION_OVERRIDE_STORAGE_KEY,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/rotation-override-store.js";
import { PlacementFrame } from "#lib/shared/pictograph/arrow/positioning/placement/domain/placement-frame.js";

const LEGACY_STORAGE_KEY = "tka_rotation_overrides";

describe("rotation override storage ownership", () => {
  beforeEach(() => localStorage.clear());

  it("migrates Diamond into canonical, preserves Skewed, and retires Box", () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        diamond: {
          from_layer1: { A: { "0,0": { dash_rot_angle_override: true } } },
        },
        box: {
          from_layer1: { A: { "0,0": { dash_rot_angle_override: false } } },
        },
        skewed: {
          from_layer2: { G: { "1,1": { static_rot_angle_override: true } } },
        },
      })
    );

    const migrated = loadRotationOverrides();
    expect(Object.keys(migrated).sort()).toEqual(["canonical", "skewed"]);
    expect(
      migrated.canonical.from_layer1.A["0,0"].dash_rot_angle_override
    ).toBe(true);
    expect(migrated.skewed.from_layer2.G["1,1"].static_rot_angle_override).toBe(
      true
    );
    expect(localStorage.getItem(ROTATION_OVERRIDE_STORAGE_KEY)).not.toBeNull();
  });

  it("reads explicit canonical false values without falling through", () => {
    localStorage.setItem(
      ROTATION_OVERRIDE_STORAGE_KEY,
      JSON.stringify({
        canonical: {
          from_layer1: { A: { "0,0": { dash_rot_angle_override: false } } },
        },
      })
    );

    expect(
      getStoredRotationOverride(
        PlacementFrame.CANONICAL,
        "from_layer1",
        "A",
        "0,0",
        "dash_rot_angle_override"
      )
    ).toBe(false);
  });

  it("clears both the current store and the retired legacy store", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "{}");
    localStorage.setItem(ROTATION_OVERRIDE_STORAGE_KEY, "{}");
    clearRotationOverrides();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ROTATION_OVERRIDE_STORAGE_KEY)).toBeNull();
  });
});

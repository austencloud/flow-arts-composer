import { describe, expect, it } from "vitest";
import { AmbientLight, DirectionalLight } from "three";
import {
  createViewerBaseLightingGroup,
  resolveViewerBaseLighting,
  VIEWER_KEY_LIGHT_POSITION,
} from "#lib/shared/3d/rendering/viewer-lighting-rig.js";

describe("viewer lighting rig", () => {
  it("keeps the production day, night, and no-environment profiles explicit", () => {
    expect(resolveViewerBaseLighting(true, false)).toEqual({
      ambientIntensity: 0.3,
      directionalIntensity: 0.6,
    });
    expect(resolveViewerBaseLighting(true, true)).toEqual({
      ambientIntensity: 0.2,
      directionalIntensity: 0.4,
    });
    expect(resolveViewerBaseLighting(false, false)).toEqual({
      ambientIntensity: 0.4,
      directionalIntensity: 0.8,
    });
  });

  it("builds the same base-pass lights for a worker-owned frame", () => {
    const root = createViewerBaseLightingGroup(
      resolveViewerBaseLighting(true, false)
    );
    const ambient = root.getObjectByName("viewer-base-ambient");
    const key = root.getObjectByName("viewer-base-key");

    expect(ambient).toBeInstanceOf(AmbientLight);
    expect((ambient as AmbientLight).intensity).toBe(0.3);
    expect(key).toBeInstanceOf(DirectionalLight);
    expect((key as DirectionalLight).intensity).toBe(0.6);
    expect(key?.position.toArray()).toEqual([...VIEWER_KEY_LIGHT_POSITION]);
  });
});

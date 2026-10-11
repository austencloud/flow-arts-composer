import { BackgroundType } from "@austencloud/backgrounds";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_ENVIRONMENT_ID,
  SCENE_ENVIRONMENTS,
  SceneEnvironmentId,
  getSceneEnvironmentRendererKey,
  normalizeSceneEnvironmentId,
  sceneEnvironmentIdForBackground,
} from "#lib/shared/3d/environments/domain/scene-environment.js";

describe("3D scene environment identity", () => {
  it("normalizes saved environment ids without consulting app settings", () => {
    expect(normalizeSceneEnvironmentId("ocean")).toBe(SceneEnvironmentId.OCEAN);
    expect(normalizeSceneEnvironmentId("future-unknown-scene")).toBe(
      DEFAULT_SCENE_ENVIRONMENT_ID
    );
  });

  it("uses the optional 2D pairing only for first-use migration", () => {
    expect(sceneEnvironmentIdForBackground(BackgroundType.BLOSSOM)).toBe(
      SceneEnvironmentId.BLOSSOM
    );
    expect(sceneEnvironmentIdForBackground("2d-only-future-background")).toBe(
      DEFAULT_SCENE_ENVIRONMENT_ID
    );
  });

  it("keeps renderer routing inside the 3D catalog", () => {
    expect(getSceneEnvironmentRendererKey(SceneEnvironmentId.RAINBOW)).toBe(
      BackgroundType.PRIDE
    );
    expect(new Set(SCENE_ENVIRONMENTS.map((scene) => scene.id)).size).toBe(
      SCENE_ENVIRONMENTS.length
    );
  });
});


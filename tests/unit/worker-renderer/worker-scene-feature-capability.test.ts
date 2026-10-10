import { describe, expect, it } from "vitest";
import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";
import { hasExactWorkerSceneFeatures } from "#lib/shared/3d/worker-renderer/domain/worker-scene-feature-capability.js";

function reader(overrides: Record<string, boolean> = {}) {
  const defaults = Object.fromEntries(
    SCENE_FEATURES.map((feature) => [feature.key, feature.defaultEnabled])
  );
  const values = { ...defaults, ...overrides };
  return { isEnabled: (key: string) => values[key] ?? false };
}

describe("hasExactWorkerSceneFeatures", () => {
  it("accepts the complete registry default configuration", () => {
    expect(hasExactWorkerSceneFeatures(reader())).toBe(true);
  });

  it.each(SCENE_FEATURES)(
    "fails closed when $key differs from its default",
    (feature) => {
      expect(
        hasExactWorkerSceneFeatures(
          reader({ [feature.key]: !feature.defaultEnabled })
        )
      ).toBe(false);
    }
  );

  it("reads every registered feature so new toggles cannot bypass the gate", () => {
    const seen: string[] = [];
    hasExactWorkerSceneFeatures({
      isEnabled(key) {
        seen.push(key);
        return SCENE_FEATURES.find((feature) => feature.key === key)!
          .defaultEnabled;
      },
    });
    expect(seen).toEqual(SCENE_FEATURES.map((feature) => feature.key));
  });
});

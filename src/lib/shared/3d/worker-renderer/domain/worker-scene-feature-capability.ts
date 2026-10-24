import { SCENE_FEATURES } from "../../scene-features/domain/scene-feature-registry";
import type { ContactMode } from "@austencloud/scene-3d";

export interface WorkerSceneFeatureReader {
  isEnabled(key: string): boolean;
}

/**
 * Worker worlds currently reproduce the registry's default feature set.
 *
 * Keep customized combinations on the legacy renderer until feature flags are
 * part of the worker protocol. Comparing against the registry instead of a
 * second handwritten list also makes a newly-added feature fail closed.
 */
export function hasExactWorkerSceneFeatures(
  features: WorkerSceneFeatureReader,
  contactMode: ContactMode = "legacy"
): boolean {
  return (
    contactMode === "legacy" &&
    SCENE_FEATURES.every(
      (feature) => features.isEnabled(feature.key) === feature.defaultEnabled
    )
  );
}

import { propFinishState } from "@austencloud/scene-3d";

import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { normalizeTriangleGrip } from "$lib/shared/pictograph/prop/domain/triangle-appearance";

/**
 * The Grip pills live in BentoPropGrid and write AppSettings; the 3D studio's
 * scene default follows them so the prop turns in the hand as the row is
 * toggled. This is one way, settings to scene, and never writes AppSettings:
 * `SequenceViewerOrchestrator`'s build-sync effect is the only writer back to
 * settings, and it lives outside the studio, so the two effects read the same
 * scene state but never race each other.
 *
 * Exported so the behavioural test can drive the real production logic
 * inside `$effect.root` without mounting `ScenePropPicker` and its heavier
 * dependency surface (BentoPropGrid, image loading, gamification state) under
 * jsdom.
 */
export function syncTriangleGripToScene(): void {
  const grip = normalizeTriangleGrip(getSettings().triangleGrip);
  if (propFinishState.triangleGrip !== grip) {
    propFinishState.setTriangleGrip(grip);
  }
}

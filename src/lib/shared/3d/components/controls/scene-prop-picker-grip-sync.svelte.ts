import { untrack } from "svelte";
import { propFinishState } from "@austencloud/scene-3d";

import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import { applyTriadBuildToScene } from "#lib/shared/pictograph/prop/domain/triad-build.js";

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

/**
 * The 2D Build row (Pictograph, Fire, Day) also sets the 3D scene's triad
 * finish: Fire or Day become the scene default; Pictograph has no physical
 * build and leaves the scene alone. Like the grip this runs one way, settings
 * to scene, but only when the setting changes: the scene's finish is read
 * untracked, so the 3D Fire/Day control still changes the scene on its own
 * until the 2D build is picked again.
 */
export function syncTriadBuildToScene(): void {
  const build = getSettings().triadBuild;
  untrack(() => applyTriadBuildToScene(propFinishState, build));
}

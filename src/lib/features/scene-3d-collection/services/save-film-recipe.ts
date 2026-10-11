import type { Viewer3DState } from "#lib/shared/3d/context/viewer-3d-context.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CameraKeyframe } from "#lib/shared/video-export/domain/camera-keyframe.js";
import { compactCameraKeyframes } from "#lib/shared/video-export/domain/camera-keyframe.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  captureScene3DSnapshot,
  captureScene3DPoster,
} from "./capture-3d-scene";
import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
import { scene3dCollectionState } from "../state/scene-3d-collection-state.svelte";
import { SCENE_3D_GROUPS } from "../domain/scene-3d-collection-types";
import type {
  Collected3DScene,
  FilmCameraMode,
  Scene3DFilmRender,
  Scene3DGroupId,
  StepData,
} from "../domain/scene-3d-collection-types";

/** How many recordings the Stop hook may leave sitting in the collection
 *  before the oldest ones are dropped. Naming an entry takes it out of this
 *  count, so nothing a person deliberately kept is ever pruned. */
export const MAX_AUTOSAVED_FILMS = 12;

export interface SaveFilmRecipeInput {
  viewer3DState: Viewer3DState;
  sequence: SequenceData | null;
  bpm: number | undefined;
  keyframes: readonly CameraKeyframe[];
  cameraMode: FilmCameraMode;
  render: Scene3DFilmRender;
}

function allGroupsOn(): Record<Scene3DGroupId, boolean> {
  return Object.fromEntries(SCENE_3D_GROUPS.map((g) => [g, true])) as Record<
    Scene3DGroupId,
    boolean
  >;
}

/**
 * Save what was just recorded — the scene, the camera path, and the render
 * settings — into the person's 3D scene collection.
 *
 * This runs without being asked, at the moment recording stops, so dismissing
 * the finished video never throws the performance away: the recording can be
 * rendered again later, at any resolution, because the render pass is
 * deterministic.
 *
 * Never throws. A failed save must not stand between someone and the render
 * they are waiting for.
 */
export async function saveFilmRecipe(
  input: SaveFilmRecipeInput
): Promise<Collected3DScene | null> {
  try {
    const keyframes = compactCameraKeyframes(input.keyframes);
    if (keyframes.length === 0) return null;

    const uid = authState.user?.uid;
    if (uid) scene3dCollectionState.ensureStarted(uid);
    else scene3dCollectionState.initLocal();

    if (scene3dCollectionState.isReadOnlyPreview) return null;

    const seq = input.sequence;
    const snapshot = captureScene3DSnapshot(input.viewer3DState, {
      ...(input.bpm !== undefined ? { bpm: input.bpm } : {}),
      groups: allGroupsOn(),
    });
    const poster = captureScene3DPoster(input.viewer3DState);
    const steps = (seq?.steps ?? []) as StepData[];
    const sourceWord = simplifyRepeatedWord(seq?.word || seq?.name || "");
    const join = sequenceGridJoin(seq);

    const durationSeconds =
      keyframes[keyframes.length - 1]!.timestamp - keyframes[0]!.timestamp;

    const entry = await scene3dCollectionState.add({
      name: sourceWord ? `${sourceWord} film` : "Film",
      poster,
      snapshot,
      ...(steps.length > 0 ? { steps } : {}),
      ...(steps.length > 0 && join ? { conjoined: join } : {}),
      ...(sourceWord
        ? { sourceWord, ...(seq?.id ? { sourceSequenceId: seq.id } : {}) }
        : {}),
      film: {
        version: 1,
        recordedAt: Date.now(),
        durationSeconds,
        cameraMode: input.cameraMode,
        keyframes,
        render: { ...input.render },
        autoSaved: true,
      },
    });

    await pruneAutoSavedFilms();
    return entry;
  } catch (error) {
    console.warn("[FilmRecipe] Could not save the recording:", error);
    return null;
  }
}

/**
 * Keep only the newest automatic recordings. Anything the person named is off
 * limits, and so is a scene that carries no film at all.
 */
export async function pruneAutoSavedFilms(): Promise<void> {
  try {
    if (scene3dCollectionState.isReadOnlyPreview) return;
    const autoSaved = scene3dCollectionState.collection
      .filter((entry) => entry.film?.autoSaved)
      .sort((a, b) => (b.film?.recordedAt ?? 0) - (a.film?.recordedAt ?? 0));
    for (const stale of autoSaved.slice(MAX_AUTOSAVED_FILMS)) {
      await scene3dCollectionState.remove(stale.id);
    }
  } catch (error) {
    console.warn("[FilmRecipe] Could not prune older recordings:", error);
  }
}

/**
 * Naming a recording is how someone says they want to keep it, so it stops
 * counting against the automatic-recording limit.
 */
export async function markFilmSceneKept(id: string): Promise<void> {
  try {
    const entry = scene3dCollectionState.collection.find((e) => e.id === id);
    if (!entry?.film?.autoSaved) return;
    await scene3dCollectionState.update(id, {
      film: { ...entry.film, autoSaved: false },
    });
  } catch (error) {
    console.warn("[FilmRecipe] Could not mark the recording as kept:", error);
  }
}

/**
 * Record the settings a film was actually rendered with, when the person
 * changed the preset on the render card after the recipe was already saved.
 */
export async function updateFilmRenderOptions(
  id: string,
  render: Scene3DFilmRender
): Promise<void> {
  try {
    const entry = scene3dCollectionState.collection.find((e) => e.id === id);
    if (!entry?.film) return;
    await scene3dCollectionState.update(id, {
      film: { ...entry.film, render: { ...render } },
    });
  } catch (error) {
    console.warn("[FilmRecipe] Could not update the render settings:", error);
  }
}

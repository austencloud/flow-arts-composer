import type {
  Collected3DScene,
  Scene3DFilm,
} from "../domain/scene-3d-collection-types";
import { isGroupSaved, Scene3DFilmSchema } from "../domain/scene-3d-collection-types";
import { buildScene3DPersistConfig } from "../domain/scene-3d-look";
import {
  clearViewer3DPresetIntent,
  markViewer3DPresetIntent,
  writeViewer3DConfig,
  type Viewer3DState,
} from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { persistViewerMode } from "#lib/shared/sequence-viewer/services/viewer-state-persistence.js";
import { createSequenceData, type SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  captureSettingsCheckpoint,
  revertSettingsCheckpoint,
} from "#lib/shared/collections/settings-checkpoint.svelte.js";
import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

const SCENE_FEATURES_STORAGE_KEY = "tka-scene-features";

/** Legacy one-shot tempo handoff retained for Sequence Viewer compatibility. */
export const SCENE_BPM_INTENT_KEY = "tka_scene_bpm";
const SCENE_STUDIO_HANDOFF_KEY = "tka_scene_studio_handoff";

export interface SceneStudioHandoff {
  sequence: SequenceData;
  bpm: number | null;
  /** Present when the scene was opened to re-render a recorded camera
   *  performance rather than to compose a fresh shot. */
  film?: Scene3DFilm;
}

/**
 * Apply a saved scene's LOOK: seed the viewer-3d localStorage keys, the
 * scene-feature toggles, and global prop defaults — but ONLY for
 * the packing-list groups the save included (`snapshot.groups`; absent = all).
 * A fresh viewer mount reads these seeds (same mechanism as
 * open-tunnel-in-viewer). This does NOT open a sequence.
 *
 * `captureSettingsCheckpoint` snapshots the pre-apply state as the very first
 * act so the collection's standalone "Apply look" action can offer Undo.
 */
export function applyScene3DLook(scene: Collected3DScene): void {
  const snap = scene.snapshot;
  const saved = (g: Parameters<typeof isGroupSaved>[1]) => isGroupSaved(snap, g);

  captureSettingsCheckpoint(scene.name);

  // 1. Viewer-3d persistence keys, filtered by group.
  const config = buildScene3DPersistConfig(scene);
  writeViewer3DConfig(config);

  // 2. Scene-feature toggles (a fresh createSceneFeatureState reads this key).
  if (saved("scene") && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SCENE_FEATURES_STORAGE_KEY, JSON.stringify(snap.sceneFeatures));
    } catch {
      // Quota / unavailable — viewer still opens with existing feature toggles.
    }
  }

  // 3. Prop defaults remain app preferences. The environment above is viewer
  //    state and never repaints the application.
  if (saved("props")) {
    const propUpdate: Record<string, PropType> = {};
    if (snap.props.leftPropType) propUpdate.leftPropType = snap.props.leftPropType as PropType;
    if (snap.props.rightPropType) propUpdate.rightPropType = snap.props.rightPropType as PropType;
    if (Object.keys(propUpdate).length > 0) void settingsService.updateSettings(propUpdate);
  }

  // 4. Viewer boots into 3D (a fresh createViewerState reads this via
  //    loadViewerMode(); wants3D derives from "animation-3d").
  persistViewerMode("animation-3d");

  // 5. Tell the next viewer mount this open was preset-sourced, so it restores
  //    prop identity verbatim instead of re-seeding it from the app prop.
  markViewer3DPresetIntent();
}

/**
 * Apply a saved scene while a viewer is MOUNTED — the in-viewer preset picker.
 *
 * `applyScene3DLook` alone only seeds the localStorage a FRESH mount reads, so
 * from inside a live viewer it would appear to do nothing until a reload. This
 * pairs it with a push into the live state so the scene repaints now AND a
 * refresh keeps it.
 *
 * The toast lives here rather than at the call site because the Undo has to
 * reach both halves: the settings checkpoint `applyScene3DLook` captured, and
 * the live viewer state, which no checkpoint knows about. The collection
 * module's own "Apply look" action keeps its call-site toast — that path has
 * no mounted viewer to restore.
 *
 * KNOWN LIMITATION — scene-feature toggles do not apply live. `createSceneFeatureState`
 * reads `tka-scene-features` exactly once at construct, and `Viewer3DCanvas`
 * builds it once per mount (`const`, not derived), so the seed
 * `applyScene3DLook` writes only takes effect on the next mount. Its public
 * surface offers no setter that could bridge the gap: `toggle` inverts the
 * live (already stale) value rather than driving to an absolute target, so it
 * cannot express "make this key match the preset". A live apply therefore
 * swaps the environment immediately while its saved feature toggles (ocean
 * flora, torches, …) stay as they are until reload.
 */
export function applyScene3DLookLive(
  scene: Collected3DScene,
  viewer: Viewer3DState
): void {
  const before = viewer.serialize();

  applyScene3DLook(scene); // checkpoints settings, writes seeds, marks intent
  viewer.applyPersistConfig(buildScene3DPersistConfig(scene));
  // The undo stack predates this applied config, so an in-viewer Ctrl+Z right
  // after a live apply would try to "undo" state that no longer describes
  // what's on screen. Clearing it here keeps the stack honest going forward;
  // the toast's own Undo action (below) is the correct way back to before.
  viewer.sceneUndo.clear();

  showToast({
    message: `Applied "${scene.name}"`,
    type: "success",
    duration: 6000,
    action: {
      label: "Undo",
      onClick: () => {
        revertSettingsCheckpoint();
        // Carries the two things the checkpoint restore can't: it forces
        // STORAGE_KEY_MODE back to "3d", and it is the whole undo when the
        // viewer is already gone (the live half below is skipped then).
        writeViewer3DConfig(before);
        clearViewer3DPresetIntent();
        // The toast outlives a viewer the user leaves during its six seconds,
        // by either exit: toggling back to 2D, or closing it outright (which
        // disposes the state and destroys the cast without emptying it —
        // `renderMode` alone still reads "3d" there). Storage is already
        // restored, so the next mount picks the undo up regardless.
        if (!viewer.disposed && viewer.renderMode === "3d") {
          viewer.applyPersistConfig(before);
        }
      },
    },
  });
}

/**
 * Reproduce a saved scene as a performance in the dedicated Scene workspace.
 * The handoff is one-shot so reopening 3D Studio later returns to its own
 * current source instead of replaying an old Browse action.
 */
export function openScene3DInStudio(
  scene: Collected3DScene,
  options: { includeFilm?: boolean } = {}
): void {
  applyScene3DLook(scene);
  const film = options.includeFilm ? scene.film : undefined;

  const steps = scene.steps ?? [];
  const sequence: SequenceData = createSequenceData({
    id: scene.id,
    name: scene.name,
    word: scene.name,
    steps: [...steps],
    gridMode: steps.find((s) => s.gridMode)?.gridMode,
    ...(scene.conjoined ? { conjoined: scene.conjoined } : {}),
  });

  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(
        SCENE_STUDIO_HANDOFF_KEY,
        JSON.stringify({
          sequence,
          bpm:
            isGroupSaved(scene.snapshot, "performance") &&
            typeof scene.snapshot.bpm === "number"
              ? scene.snapshot.bpm
              : null,
          ...(film ? { film } : {}),
        } satisfies SceneStudioHandoff)
      );
    } catch {
      // Navigation still succeeds; Scene Studio will show its source picker.
    }
  }

  showToast({
    message: film
      ? `Opening "${scene.name}" to render`
      : `Opening "${scene.name}" in 3D Studio`,
    type: "success",
    duration: 4000,
  });
  // The coordinator imports auth-state; loading it here keeps the scene
  // controls that apply presets from bringing Firebase onto public pages.
  void import("#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js").then(
    ({ handleModuleChange }) => handleModuleChange("stage", "scene")
  );
}

/**
 * Reopen a saved scene in order to render its recorded camera performance
 * again. Same handoff as opening the scene, plus the film, so 3D Studio can
 * replay the exact camera path instead of the current static angle.
 */
export function openScene3DFilmInStudio(scene: Collected3DScene): void {
  openScene3DInStudio(scene, { includeFilm: true });
}

export function consumeSceneStudioHandoff(): SceneStudioHandoff | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCENE_STUDIO_HANDOFF_KEY);
    sessionStorage.removeItem(SCENE_STUDIO_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SceneStudioHandoff>;
    if (!parsed.sequence || !Array.isArray(parsed.sequence.steps)) return null;
    // The film crossed sessionStorage as JSON, so it is parsed rather than
    // trusted: a shape the renderer cannot use is better dropped than thrown.
    const film = parsed.film
      ? Scene3DFilmSchema.safeParse(parsed.film)
      : null;
    return {
      sequence: parsed.sequence,
      bpm: typeof parsed.bpm === "number" ? parsed.bpm : null,
      ...(film?.success ? { film: film.data as Scene3DFilm } : {}),
    };
  } catch {
    return null;
  }
}

/** Whether this saved scene carries a reproducible performance. */
export function scene3DHasSteps(scene: Collected3DScene): boolean {
  return (
    isGroupSaved(scene.snapshot, "performance") &&
    Array.isArray(scene.steps) &&
    scene.steps.length > 0
  );
}

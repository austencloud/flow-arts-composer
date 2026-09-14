/**
 * Viewer 3D State
 *
 * Top-level state factory for the 3D viewer feature.
 * Manages render mode, character instances, effect toggles,
 * and the last known camera snapshot.
 *
 * WebGL2 availability is detected once at factory creation time so callers
 * can gate "Enter 3D" before attempting any WebGL work.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { reducedMotion } from "$lib/shared/transitions/motion";
// propInterpolator / sequenceConverter are now module-level functions; no type imports needed
import type { CameraStateSnapshot } from "@austencloud/scene-3d";
import { getSceneUndoManager } from "../undo/get-scene-undo-manager";
import type {
  DefaultsDomainSnapshot,
  PerformerDomainSnapshot,
  PerformerPositionSnapshot,
  SceneUndoOperationType,
  ViewerDomainSnapshot,
  VisibilityDomainSnapshot,
} from "../undo/scene-undo-types";
import { Plane, PlaneMode, type PropBuild } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "./character-instance-state.svelte";
import { derivePlaneModeFromHands } from "./character-instance-state.svelte";
import type {
  DefaultPerformerSettings,
  CascadeCategory,
} from "./performer-settings-types";
import type { EffectType } from "$lib/shared/effects/domain/effects-config";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import {
  createPerformerManager,
  type PerformerManager,
} from "./performer-manager.svelte";
import {
  CHARACTER_DEFINITIONS,
  DEFAULT_CHARACTER_ID,
  type CharacterId,
} from "../domain/character-model";
import { STAGE } from "@austencloud/scene-3d";
import type { FormationPreset } from "@austencloud/scene-3d";
import {
  PRESET_VALID_COUNTS,
  createFormationFromPreset,
} from "@austencloud/scene-3d";
import {
  getViewerFrontStageCameraZ,
  getViewerFrontStageFacingAngle,
  resolveViewerFormationFacingAngle,
} from "../domain/viewer-formation-facing";
import { isWebGL2Available } from "../capabilities/webgl-capabilities";
import { getBlossomOpeningCamera } from "../environments/scenes/cherry-blossom/blossom-site";
import { fits3DViewportNow } from "../capabilities/viewport-3d-gate.svelte";
import { userProportionsState } from "@austencloud/scene-3d";
import { createCameraChoreographyState } from "$lib/shared/sequence-viewer/camera-choreography/state.svelte";
import {
  computeChoreographerShot,
  type PerformerShotSubject,
} from "$lib/shared/sequence-viewer/camera-choreography/presets/shots";
import type { OceanVariant } from "../environments/domain/enums/environment-enums";
import type { TimedTransition } from "../camera/transitions";
import {
  DEFAULT_SCENE_ENVIRONMENT_ID,
  VIEWER_3D_ENVIRONMENT_STORAGE_KEY,
  normalizeSceneEnvironmentId,
  type SceneEnvironmentId,
} from "../environments/domain/scene-environment";
import {
  resolveInitialDefaultProp,
  resolvePlainOpenPerformerSettings,
} from "../domain/plain-open-policy";
import { normalizeLegacyPerformerSnapshot } from "./legacy-viewer-3d-snapshots";

// Popover Stack

export type PopoverId =
  | "formation"
  | "tempo"
  | "export"
  | "camera"
  | "planes"
  | "info"
  | "scene"
  | "effects"
  | "prop"
  | "effort"
  | "dev";

// Persistence

const STORAGE_KEY_MODE = "tka-viewer3d-renderMode";
const STORAGE_KEY_CAMERA = "tka-viewer3d-camera";
const STORAGE_KEY_VISIBLE_PLANES = "tka-viewer3d-visiblePlanes";
const STORAGE_KEY_PRESET = "tka-viewer3d-activePreset";
const STORAGE_KEY_CAM_PRESET = "tka-viewer3d-cameraPreset";
const STORAGE_KEY_NAV_MODE = "tka-viewer3d-navMode";
const STORAGE_KEY_GRID_LABELS = "tka-viewer3d-gridLabels";
const STORAGE_KEY_EFFECT_TOGGLES = "tka-viewer3d-effectToggles";
const STORAGE_KEY_OCEAN_VARIANT = "tka-viewer3d-oceanVariant";
const STORAGE_KEY_ENVIRONMENT = VIEWER_3D_ENVIRONMENT_STORAGE_KEY;

export type ViewerNavMode = "orbit" | "fly" | "walk";

export interface ViewerPerformerAppearanceAssignment {
  index: number;
  characterId?: CharacterId;
  prop?: PropType;
}

type CameraSnapTo = (
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  spherical?: { azimuth: number; polar: number },
  animate?: boolean,
  transitionTiming?: TimedTransition
) => void;

function loadPersistedNavMode(): ViewerNavMode {
  if (typeof localStorage === "undefined") return "orbit";
  try {
    const v = localStorage.getItem(STORAGE_KEY_NAV_MODE);
    return v === "fly" || v === "walk" ? v : "orbit";
  } catch {
    return "orbit";
  }
}

function persistNavMode(value: ViewerNavMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_NAV_MODE, value);
  } catch {
    // Storage full or unavailable
  }
}

/** Narrow an untrusted string (seed JSON, app settings) to a real PropType. */
function asPropType(value: string | null | undefined): PropType | null {
  if (!value) return null;
  return Object.values(PropType).includes(value as PropType)
    ? (value as PropType)
    : null;
}

function loadPersistedDefaultProp(): PropType {
  if (typeof localStorage === "undefined") return PropType.STAFF;
  try {
    const v = localStorage.getItem(STORAGE_KEY_DEFAULT_PROP);
    if (v && Object.values(PropType).includes(v as PropType))
      return v as PropType;
    return PropType.STAFF;
  } catch {
    return PropType.STAFF;
  }
}

function persistDefaultProp(prop: PropType) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_DEFAULT_PROP, prop);
  } catch {}
}

// New multi-performer persistence keys (v2). The old
// STORAGE_KEY_VISIBLE_PLANES is migrated to the first entry of the new
// performers array on first load.
const STORAGE_KEY_PERFORMERS = "tka-viewer3d-performers";
const STORAGE_KEY_ACTIVE_FORMATION = "tka-viewer3d-activeFormation";
const STORAGE_KEY_SELECTED_INDEX = "tka-viewer3d-selectedIndex";
const STORAGE_KEY_SELECTED_INDICES = "tka-viewer3d-selectedIndices";
const STORAGE_KEY_DEFAULT_PROP = "tka-viewer3d-defaultProp";

/** Per-performer cascade overrides; null = inherit the viewer default. */
// Mirrored structurally by domain/plain-open-policy.ts — keep field policy in sync when adding fields.
export interface StoredPerformerSettings {
  prop: string | null;
  effortId: string | null;
  effect: string | null;
  staffLengthCm: number | null;
}

export interface StoredPerformerSnapshot {
  /** The visible character model selected for this performer. */
  characterId?: CharacterId;
  position: { x: number; z: number };
  facingAngle: number;
  customLeftPlane: Plane;
  customRightPlane: Plane;
  /** User-assigned display name; absent/null = inherit the character model's name. */
  name?: string | null;
  /** Cascade overrides; absent = no overrides (pre-v2 snapshots). */
  settings?: StoredPerformerSettings;
}

function loadPersistedMode(): "2d" | "3d" {
  if (typeof localStorage === "undefined") return "2d";
  try {
    const v = localStorage.getItem(STORAGE_KEY_MODE);
    return v === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function persistMode(mode: "2d" | "3d") {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  } catch {
    // Storage full or unavailable
  }
}

function loadPersistedEnvironment(
  firstUseEnvironment: SceneEnvironmentId
): SceneEnvironmentId {
  if (typeof localStorage === "undefined") return firstUseEnvironment;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ENVIRONMENT);
    const environmentId = normalizeSceneEnvironmentId(
      stored,
      firstUseEnvironment
    );

    // The old viewer followed the app background forever. The first viewer
    // opened after this migration remembers that look once, then owns it.
    if (stored !== environmentId) {
      localStorage.setItem(STORAGE_KEY_ENVIRONMENT, environmentId);
    }
    return environmentId;
  } catch {
    return firstUseEnvironment;
  }
}

function persistEnvironment(environmentId: SceneEnvironmentId): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_ENVIRONMENT, environmentId);
  } catch {
    // Storage full or unavailable.
  }
}

function loadPersistedCamera(): CameraStateSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAMERA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistCamera(snapshot: CameraStateSnapshot) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_CAMERA, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable
  }
}

// Plane Persistence

function loadPersistedPlanes(): Set<Plane> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VISIBLE_PLANES);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    // Validate each entry is a known Plane value
    const validValues = new Set<string>(Object.values(Plane));
    const planes = arr.filter((v) => validValues.has(v)) as Plane[];
    return new Set(planes);
  } catch {
    return null;
  }
}

function persistPlanes(planes: Set<Plane>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY_VISIBLE_PLANES,
      JSON.stringify([...planes])
    );
  } catch {
    // Storage full or unavailable
  }
}

function loadPersistedPerformers(): StoredPerformerSnapshot[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PERFORMERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(
      normalizeLegacyPerformerSnapshot
    ) as StoredPerformerSnapshot[];
  } catch {
    return null;
  }
}

function persistPerformers(snapshots: StoredPerformerSnapshot[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PERFORMERS, JSON.stringify(snapshots));
  } catch {
    // Quota exceeded or unavailable
  }
}

function loadPersistedActiveFormation():
  | FormationPreset
  | "manual"
  | "custom"
  | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_FORMATION);
    return raw as FormationPreset | "manual" | "custom" | null;
  } catch {
    return null;
  }
}

function persistActiveFormation(
  value: FormationPreset | "manual" | "custom"
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_FORMATION, value);
  } catch {
    // Quota exceeded or unavailable
  }
}

function loadPersistedSelectedIndex(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTED_INDEX);
    if (raw === null || raw === "null") return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function persistSelectedIndex(value: number | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY_SELECTED_INDEX,
      value === null ? "null" : String(value)
    );
  } catch {
    // Quota exceeded or unavailable
  }
}

function loadPersistedSelectedIndices(): number[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTED_INDICES);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (value): value is number => Number.isInteger(value) && value >= 0
    );
  } catch {
    return null;
  }
}

function persistSelectedIndices(value: readonly number[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED_INDICES, JSON.stringify(value));
  } catch {
    // Quota exceeded or unavailable
  }
}

/**
 * One-time migration: if the old single-character visiblePlanes key exists and
 * the new per-performer key does not, construct a single-performer snapshot
 * from the old data and save it to the new key. Delete the old key so the
 * migration never runs twice.
 */
function migrateLegacyPlanesIfNeeded(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const hasNew = localStorage.getItem(STORAGE_KEY_PERFORMERS);
    if (hasNew) return;
    const hasOld = localStorage.getItem(STORAGE_KEY_VISIBLE_PLANES);
    if (!hasOld) return;

    const planes = JSON.parse(hasOld) as Plane[];
    const left = planes[0] ?? Plane.WALL;
    const right = planes[1] ?? left;
    const snapshots: StoredPerformerSnapshot[] = [
      {
        position: { x: 0, z: 0 },
        facingAngle: 0,
        customLeftPlane: left,
        customRightPlane: right,
      },
    ];
    localStorage.setItem(STORAGE_KEY_PERFORMERS, JSON.stringify(snapshots));
    localStorage.removeItem(STORAGE_KEY_VISIBLE_PLANES);
  } catch {
    // Migration is best-effort; fall back to fresh state on any failure.
  }
}

const DEFAULT_EFFECT_TOGGLES: Record<string, boolean> = {
  fire: false,
  led: false,
  trails: false,
  charcoal: false,
};

function loadPersistedEffectToggles(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return { ...DEFAULT_EFFECT_TOGGLES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EFFECT_TOGGLES);
    if (!raw) return { ...DEFAULT_EFFECT_TOGGLES };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_EFFECT_TOGGLES };
    }
    const toggles = { ...DEFAULT_EFFECT_TOGGLES };
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") toggles[k] = v;
    }
    return toggles;
  } catch {
    return { ...DEFAULT_EFFECT_TOGGLES };
  }
}

function persistEffectToggles(toggles: Record<string, boolean>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_EFFECT_TOGGLES, JSON.stringify(toggles));
  } catch {
    // Quota exceeded or unavailable
  }
}

// Factory

/**
 * The module-level writers, captured so a seeded instance can shadow each name
 * with a no-op inside the factory without self-referencing (a local
 * `const persistCamera = persistCamera` would be a TDZ error). Call sites stay
 * untouched and route through whichever binding their instance installed.
 */
const WRITERS = {
  navMode: persistNavMode,
  defaultProp: persistDefaultProp,
  mode: persistMode,
  camera: persistCamera,
  planes: persistPlanes,
  performers: persistPerformers,
  activeFormation: persistActiveFormation,
  selectedIndex: persistSelectedIndex,
  selectedIndices: persistSelectedIndices,
  effectToggles: persistEffectToggles,
} as const;

export interface ViewerPerformerSelectionController {
  getSelectedIndices(): readonly number[];
  getPrimaryIndex(): number | null;
  replace(index: number): void;
  toggle(index: number): void;
  clear(): void;
  selectAll(count: number): void;
  setSelection(indices: readonly number[], primaryIndex?: number): void;
  removeSelection?(indices: readonly number[]): boolean;
}

/**
 * Optional construction seed. Every field present here is used INSTEAD OF the
 * matching localStorage key, and nothing is written back — so a seeded viewer
 * is fully self-contained.
 *
 * This exists because the only way to reproduce a saved 3D scene used to be
 * `applyScene3DLook`: write the user's localStorage, then let a fresh mount
 * read it. That works for one viewer and is destructive by construction — it
 * overwrites settings the user chose, which is why every caller had to pair it
 * with `captureSettingsCheckpoint` and an Undo toast. It also cannot support
 * two viewers at once: localStorage is a single global slot, so two mounts
 * seeding concurrently both read whichever wrote last.
 *
 * A gallery of live scene previews needs neither of those properties, hence
 * the argument. `applyScene3DLook` is untouched and still correct for the
 * "make my whole app look like this" gesture.
 */
export interface Viewer3DStateSeed extends Partial<Viewer3DPersistConfig> {
  /** Force the initial render mode, bypassing the persisted one. A preview
   *  always wants "3d" regardless of where the user left the real viewer. */
  renderMode?: "2d" | "3d";
  /** Legacy v1/v2 saved-scene field. `environmentId` is canonical. */
  backgroundType?: string;
  /**
   * Orbit the camera around its target continuously, for as long as the viewer
   * is mounted. A gallery tile is watched, not driven, so it wants motion that
   * never ends and never depends on playback.
   *
   * This is deliberately NOT the `auto-orbit` camera preset. That preset is a
   * choreography shot: it targets the primary performer, runs exactly one
   * revolution across the sequence duration, and only advances while the
   * choreography driver is ticking — so a tile showing a saved LOOK with no
   * performance would never move at all.
   */
  autoOrbit?: boolean;
  /** Revolution speed when `autoOrbit` is on. Three.js OrbitControls units:
   *  ~6deg/sec per unit. Default 2.0 (a full turn in ~30s). */
  autoOrbitSpeed?: number;
  /**
   * Scene-feature toggles (ocean flora, torches, …) for THIS viewer. Unseeded,
   * Viewer3DCanvas builds its feature state from the shared
   * `tka-scene-features` key. Seeded, that key is ignored in both directions.
   */
  sceneFeatures?: Record<string, boolean>;
}

export interface Viewer3DStateOptions {
  /** Used only when this user has never chosen a 3D environment. */
  firstUseEnvironment?: SceneEnvironmentId;
  /**
   * The app's current prop (settings.leftPropType). A PLAIN open re-seeds prop
   * identity from this instead of the persisted viewer prop, so users stop
   * being ambushed by a stale saved prop. A preset-sourced open ignores it.
   */
  appDefaultProp?: string | null;
  /**
   * View-only environment, from a shared viewer link (`t3` URL slice). It wins
   * over the persisted key AND suppresses this instance's environment writes,
   * so the sender's scene renders without ever reaching the recipient's disk —
   * the same `initial` + `persist:false` shape `createEffectsConfigState` uses.
   *
   * Deliberately NOT expressed by passing a `Viewer3DStateSeed`: a seed marks
   * the whole instance as a self-contained PREVIEW (it stops persisting camera,
   * planes, performers and prop, forces verbatim performer restore, and makes
   * `seededBackgroundType` non-null, which `Viewer3DCamera` reads to pick a
   * preview-specific distance for Blossom). A link override is a real viewer,
   * so it narrows the override to the one field the slice actually encodes.
   */
  viewOnlyEnvironmentId?: SceneEnvironmentId;
  /**
   * View-only scene-feature toggles from the same link. Read by
   * `Viewer3DCanvas`, which builds an ISOLATED feature state from them — the
   * shared `tka-scene-features` key is then ignored in both directions.
   */
  viewOnlySceneFeatures?: Record<string, boolean>;
  /** A document host can own performer selection while the shared viewer
   * exposes the same index-based interaction surface to scene controls. */
  performerSelection?: ViewerPerformerSelectionController;
}

function buildViewer3DState(
  seed?: Viewer3DStateSeed,
  options: Viewer3DStateOptions = {}
) {
  const sceneUndo = getSceneUndoManager();
  // The manager is imperative. This revision carries its subscription events
  // into Svelte so shortcut availability changes in the same frame as history.
  let undoRevision = $state(0);
  const unsubscribeFromUndo = sceneUndo.subscribe(() => {
    undoRevision++;
  });
  const _webgl2Available = isWebGL2Available();
  /** A seeded field wins over storage; `undefined` means "not seeded". */
  const seeded = <T>(value: T | undefined, fromStorage: () => T): T =>
    value !== undefined ? value : fromStorage();

  /**
   * A seeded viewer is a self-contained preview, so it reads its own config and
   * writes NOTHING back. Without this, mounting a saved-scene tile would stomp
   * the real viewer's keys: `enter3D` persists mode, and an orbit gesture (or
   * `snapCameraTo`) persists the camera — exactly the destructiveness the seed
   * argument exists to remove. Each writer below shadows its module-level
   * namesake for this instance only; call sites are unchanged.
   */
  const persistent = seed === undefined;
  /**
   * Should restored performer settings be applied verbatim? Three cases:
   *
   * 1. Seeded preview (tiles, demos) — ALWAYS verbatim. A seed is the whole
   *    point: it renders exactly the saved look, so nothing is stripped.
   * 2. Persistent host that opted into prop-follow (passed `appDefaultProp`) —
   *    the one-shot intent decides. Present = preset-sourced open, verbatim;
   *    absent = plain open, prop identity re-seeds from the app prop.
   * 3. Persistent host that did NOT opt in (e.g. /coven) — verbatim, the
   *    pre-feature behavior. Crucially it does NOT consume the marker, so a
   *    pending preset intent survives for the host it was written for.
   */
  const _restoreVerbatim =
    persistent && options.appDefaultProp !== undefined
      ? consumeViewer3DPresetIntent()
      : true;
  const seededEnvironment =
    seed?.environmentId ??
    seed?.backgroundType ??
    options.viewOnlyEnvironmentId;
  /**
   * A link override reads its environment from the URL and writes none back.
   * `loadPersistedEnvironment` is skipped entirely, which also skips its
   * first-use migration write — the recipient's key stays exactly as it was.
   */
  const environmentIsViewOnly = options.viewOnlyEnvironmentId !== undefined;
  let environmentId = $state<SceneEnvironmentId>(
    seededEnvironment !== undefined
      ? normalizeSceneEnvironmentId(seededEnvironment)
      : loadPersistedEnvironment(
          options.firstUseEnvironment ?? DEFAULT_SCENE_ENVIRONMENT_ID
        )
  );
  const noop = () => {};
  const persistNavMode = persistent ? WRITERS.navMode : noop;
  const persistDefaultProp = persistent ? WRITERS.defaultProp : noop;
  const persistMode = persistent ? WRITERS.mode : noop;
  const persistCamera = persistent ? WRITERS.camera : noop;
  const persistPlanes = persistent ? WRITERS.planes : noop;
  const persistPerformers = persistent ? WRITERS.performers : noop;
  const persistActiveFormation = persistent ? WRITERS.activeFormation : noop;
  const persistSelectedIndex = persistent ? WRITERS.selectedIndex : noop;
  const persistSelectedIndices = persistent ? WRITERS.selectedIndices : noop;
  const persistEffectToggles = persistent ? WRITERS.effectToggles : noop;
  const persistSceneEnvironment =
    persistent && !environmentIsViewOnly ? persistEnvironment : noop;
  /** The four keys written inline rather than through a `persist*` helper. */
  const writeKey = (key: string, value: string) => {
    if (!persistent) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or unavailable.
    }
  };
  // Start in 2D on viewports too small to host 3D even if '3d' was persisted from
  // a larger screen — avoids briefly mounting the 3D overlay before the
  // orchestrator's fits3D guard corrects it. Non-mutating: storage keeps '3d', so
  // unfolding restores 3D.
  const _persistedMode = seeded(seed?.renderMode, () =>
    _webgl2Available && fits3DViewportNow() ? loadPersistedMode() : "2d"
  );
  const _persistedCamera = seeded(seed?.camera, loadPersistedCamera);

  // Synchronously restore the last render mode from localStorage so that
  // closing and reopening the sequence drawer keeps the user in 3D if that's
  // where they were. The orchestrator still fires enter3D() once the sequence
  // is available so the primary performer gets its sequence data loaded.
  let renderMode = $state<"2d" | "3d">(_persistedMode);
  let showPerf = $state(false);

  const _persistedOceanVariant = seeded(
    seed?.oceanVariant as OceanVariant | undefined,
    () => {
      try {
        return (localStorage.getItem(STORAGE_KEY_OCEAN_VARIANT) ??
          "abyss") as OceanVariant;
      } catch {
        return "abyss" as OceanVariant;
      }
    }
  );
  let oceanVariant = $state<OceanVariant>(_persistedOceanVariant);

  // Exclusive popover stack: only one popover can be open at a time.
  // Used to prevent "popover stomping" where multiple rail popovers and the
  // header info chip could be open simultaneously.
  let _activePopover = $state<PopoverId | null>(null);

  function openPopover(id: PopoverId | null): void {
    _activePopover = id;
  }

  function closePopover(): void {
    _activePopover = null;
  }

  // Viewer-level default settings for the cascade system. Performers with
  // null overrides inherit from these defaults.
  const _defaultSettings = $state<DefaultPerformerSettings>({
    // Seeded prop arrives as a bare string (Viewer3DPersistConfig's shape, and
    // what Firestore stores), so `asPropType` validates before trusting it —
    // an unknown value falls through rather than poisoning the cascade.
    // Falling through: a plain open follows the app prop, while a verbatim open
    // (preset-sourced, or a host that never opted in) keeps the persisted
    // viewer prop, which applyScene3DLook just wrote for the preset case.
    prop:
      asPropType(seed?.defaultProp) ??
      (resolveInitialDefaultProp({
        presetSourced: _restoreVerbatim,
        appProp: asPropType(options.appDefaultProp),
        persistedProp: loadPersistedDefaultProp(),
      }) as PropType),
    effortId: "linear" as EffortId,
    planeMode: PlaneMode.WALL,
    customLeftPlane: Plane.WALL,
    customRightPlane: Plane.WALL,
  });

  // Performer manager - single source of truth for multi-performer state.
  // The viewer passes its viewer-specific cap (8) while realm/museum/duet
  // keep their shared cap (4) by not passing maxPerformers at all.
  const performerManager: PerformerManager = createPerformerManager({
    initialCharacterId: DEFAULT_CHARACTER_ID,
    maxPerformers: STAGE.MAX_VIEWER_PERFORMERS,
    getDefaults: () => _defaultSettings,
    getFrontStageFacingAngle: () =>
      getViewerFrontStageFacingAngle(environmentId),
    persistent,
  });

  // Viewer-specific selection scope. A null local set is explicit All, while
  // an empty array is explicit None. A document host can inject the same
  // contract so Stage IDs remain canonical without creating a second store.
  let localSelectedPerformerIndices = $state<number[] | null>(null);
  let localPrimaryPerformerIndex = $state<number | null>(null);
  let performerSelectionMode = $state(false);

  function normalizeSelectedIndices(indices: readonly number[]): number[] {
    const count = performerManager.performers.length;
    return [...new Set(indices)].filter(
      (index) => Number.isInteger(index) && index >= 0 && index < count
    );
  }

  function selectedPerformerIndices(): number[] {
    const controlled = options.performerSelection?.getSelectedIndices();
    if (controlled) return normalizeSelectedIndices(controlled);
    if (localSelectedPerformerIndices === null) {
      return performerManager.performers.map((_, index) => index);
    }
    return normalizeSelectedIndices(localSelectedPerformerIndices);
  }

  function primaryPerformerIndex(): number | null {
    const selected = selectedPerformerIndices();
    if (selected.length === 0) return null;
    const controlled = options.performerSelection?.getPrimaryIndex();
    if (
      controlled !== undefined &&
      controlled !== null &&
      selected.includes(controlled)
    ) {
      return controlled;
    }
    if (
      localPrimaryPerformerIndex !== null &&
      selected.includes(localPrimaryPerformerIndex)
    ) {
      return localPrimaryPerformerIndex;
    }
    return selected.at(-1) ?? null;
  }

  function allPerformersSelected(): boolean {
    const count = performerManager.performers.length;
    return count > 0 && selectedPerformerIndices().length === count;
  }

  function persistLocalSelection(): void {
    if (options.performerSelection || !_performersPersistReady) return;
    persistSelectedIndices(selectedPerformerIndices());
    persistSelectedIndex(
      allPerformersSelected() ? null : primaryPerformerIndex()
    );
  }

  function setLocalSelection(
    indices: readonly number[],
    primaryIndex?: number
  ): void {
    const selected = normalizeSelectedIndices(indices);
    localSelectedPerformerIndices = selected;
    localPrimaryPerformerIndex =
      primaryIndex !== undefined && selected.includes(primaryIndex)
        ? primaryIndex
        : (selected.at(-1) ?? null);
    persistLocalSelection();
  }

  // Whether prop size is linked (global) or per-performer.
  let propSizeLinked = $state(true);

  // Suppresses performer raycast picks while the user is orbiting the camera.
  // OrbitControls onstart/onend in Viewer3DCamera flip this flag so a drag
  // that ends near a performer's body doesn't accidentally select them.
  let isCameraDragging = $state(false);

  // Welcome animation: plays once per session on first 3D entry.
  // Fires on the next animation frame after registerSnapTo.
  let _hasPlayedWelcome = false;
  let _welcomeAnimationPending = false;

  // Gate for the performer persistence $effect. Stays false until enter3D()
  // finishes restoring from localStorage, preventing the effect from
  // overwriting the saved multi-performer state with an empty array before
  // restoration has a chance to run.
  let _performersPersistReady = false;

  /**
   * Return the set of performers that should receive scoped writes.
   * The ordered selection is the edit scope. None is a safe no-op.
   */
  function scopedPerformers(): CharacterInstanceState[] {
    return selectedPerformerIndices()
      .map((index) => performerManager.performers[index])
      .filter((performer): performer is CharacterInstanceState => !!performer);
  }

  function currentViewportAspect(): number {
    return typeof window === "undefined"
      ? 1
      : window.innerWidth / window.innerHeight;
  }

  /**
   * Frame the cast from the environment's authored front-stage side. The
   * shared choreography preset supplies the distance and elevation; this
   * viewer adapter supplies the scene-specific stage axis.
   */
  function computeViewerFrontStageShot(
    performers: readonly PerformerShotSubject[],
    viewportAspect = currentViewportAspect()
  ) {
    const shot = computeChoreographerShot(
      performers,
      stageGroundOffset,
      viewportAspect
    );
    shot.eye.z = getViewerFrontStageCameraZ(
      shot.target.z,
      shot.eye.z - shot.target.z,
      environmentId
    );
    return shot;
  }

  /**
   * First load is a hero composition, not a blocking diagram. Keep the
   * FOV-derived group distance but lower the eye and target to the rig's
   * shoulder-height origin so the authored environment remains visible behind
   * the performers. Later cast edits still use the elevated overview above.
   */
  function computeViewerOpeningShot(
    performers: readonly PerformerShotSubject[]
  ) {
    const shot = computeViewerFrontStageShot(performers);
    if (environmentId === "blossom" && performers.length === 1) {
      const camera = getBlossomOpeningCamera(currentViewportAspect() < 1);
      const [x, y, z] = camera.position;
      const [tx, ty, tz] = camera.target;
      shot.eye.set(x, y, z);
      shot.target.set(tx, ty, tz);
      return shot;
    }
    const horizontalDistance = Math.hypot(
      shot.eye.x - shot.target.x,
      shot.eye.z - shot.target.z
    );
    shot.eye.x = shot.target.x;
    shot.eye.y = 0;
    shot.eye.z = getViewerFrontStageCameraZ(
      shot.target.z,
      horizontalDistance,
      environmentId
    );
    shot.target.y = 0;
    return shot;
  }

  /**
   * Refit the complete cast after the viewer gives real width to a dock. The
   * calculated shot supplies the distance and group center, while the live
   * camera supplies its direction. Opening controls therefore keeps the angle
   * the user chose instead of snapping them back to a canned viewpoint.
   */
  function frameAllPerformers(
    viewportAspect = currentViewportAspect(),
    preserveViewingDirection = true
  ): void {
    framePerformers(
      performerManager.performers,
      viewportAspect,
      preserveViewingDirection
    );
  }

  function focusSelectedPerformers(): void {
    const selected = scopedPerformers();
    framePerformers(
      selected.length > 0 ? selected : performerManager.performers,
      currentViewportAspect(),
      true
    );
  }

  function framePerformers(
    performers: readonly PerformerShotSubject[],
    viewportAspect: number,
    preserveViewingDirection: boolean
  ): void {
    if (renderMode !== "3d" || !_snapToFn || performers.length === 0) return;

    const shot = computeViewerFrontStageShot(performers, viewportAspect);
    const target = shot.target;
    let position: { x: number; y: number; z: number } = shot.eye;

    const liveCamera = cameraSnapshot ?? _persistedCamera;
    if (preserveViewingDirection && liveCamera) {
      const dx = liveCamera.position.x - liveCamera.target.x;
      const dy = liveCamera.position.y - liveCamera.target.y;
      const dz = liveCamera.position.z - liveCamera.target.z;
      const currentDistance = Math.hypot(dx, dy, dz);
      const requiredDistance = Math.hypot(
        shot.eye.x - shot.target.x,
        shot.eye.y - shot.target.y,
        shot.eye.z - shot.target.z
      );

      if (
        Number.isFinite(currentDistance) &&
        currentDistance > 0.001 &&
        Number.isFinite(requiredDistance)
      ) {
        position = {
          x: target.x + (dx / currentDistance) * requiredDistance,
          y: target.y + (dy / currentDistance) * requiredDistance,
          z: target.z + (dz / currentDistance) * requiredDistance,
        };
      }
    }

    snapCameraTo(
      { x: position.x, y: position.y, z: position.z },
      { x: target.x, y: target.y, z: target.z },
      undefined,
      !reducedMotion()
    );
  }

  function setPerformerSelection(
    indices: readonly number[],
    primaryIndex?: number
  ): void {
    if (options.performerSelection) {
      options.performerSelection.setSelection(indices, primaryIndex);
      return;
    }
    setLocalSelection(indices, primaryIndex);
  }

  function replacePerformerSelection(index: number): void {
    if (options.performerSelection) options.performerSelection.replace(index);
    else setLocalSelection([index], index);
  }

  function togglePerformerSelection(index: number): void {
    if (options.performerSelection) {
      options.performerSelection.toggle(index);
      return;
    }
    const selected = selectedPerformerIndices();
    setLocalSelection(
      selected.includes(index)
        ? selected.filter((candidate) => candidate !== index)
        : [...selected, index],
      index
    );
  }

  function clearPerformerSelection(): void {
    if (options.performerSelection) options.performerSelection.clear();
    else setLocalSelection([]);
  }

  function selectAllPerformers(): void {
    const count = performerManager.performers.length;
    if (options.performerSelection) options.performerSelection.selectAll(count);
    else {
      localSelectedPerformerIndices = null;
      localPrimaryPerformerIndex = null;
      persistLocalSelection();
    }
  }

  /** Compatibility adapter: null remains All, a number remains replace. */
  function selectPerformerScope(index: number | null): void {
    if (index === null) selectAllPerformers();
    else replacePerformerSelection(index);
  }

  /**
   * Toggle between linked (global) and unlinked (per-performer) prop sizing.
   *
   * Linked → Unlinked: stamps current global staffLengthCm onto every
   * performer that still has null (i.e. inheriting global).
   *
   * Unlinked → Linked: syncs global to the selected performer's value
   * (or performer 0 if "All" is selected), then clears all per-performer
   * overrides so everyone inherits the global again.
   */
  function togglePropSizeLink(): void {
    sceneUndo.withoutUndo(() => {
      if (propSizeLinked) {
        const globalCm = userProportionsState.staffLengthCm;
        for (const p of performerManager.performers) {
          if (p.settings.staffLengthCm === null) {
            p.setStaffLengthCm(globalCm);
          }
        }
        propSizeLinked = false;
      } else {
        const sourceIdx = primaryPerformerIndex() ?? 0;
        const source = performerManager.performers[sourceIdx];
        if (source?.settings.staffLengthCm != null) {
          userProportionsState.setStaffLengthCm(source.settings.staffLengthCm);
        }
        for (const p of performerManager.performers) {
          p.setStaffLengthCm(null);
        }
        propSizeLinked = true;
      }
    });
  }

  // Default Settings — Cascade Write Methods

  function setDefaultProp(prop: PropType): void {
    sceneUndo.captureState("change-default-prop", `Default prop: ${prop}`);
    _defaultSettings.prop = prop;
    persistDefaultProp(prop);
    sceneUndo.commitState();
  }

  function setDefaultEffort(effortId: EffortId): void {
    sceneUndo.captureState(
      "change-default-effort",
      `Default effort: ${effortId}`
    );
    _defaultSettings.effortId = effortId;
    sceneUndo.commitState();
  }

  function setDefaultPlaneMode(mode: PlaneMode): void {
    sceneUndo.captureState(
      "change-default-planes",
      `Default plane mode: ${mode}`
    );
    _defaultSettings.planeMode = mode;
    sceneUndo.commitState();
  }

  function setDefaultHandPlane(hand: "left" | "right", plane: Plane): void {
    sceneUndo.captureState(
      "change-default-planes",
      `Default ${hand}: ${plane}`
    );
    if (hand === "left") _defaultSettings.customLeftPlane = plane;
    else _defaultSettings.customRightPlane = plane;
    _defaultSettings.planeMode = derivePlaneModeFromHands(
      _defaultSettings.customLeftPlane,
      _defaultSettings.customRightPlane
    );
    sceneUndo.commitState();
  }

  // ============================================
  // Override Count & Bulk Reset
  // ============================================

  function overrideCountForCategory(cat: CascadeCategory): number {
    return performerManager.performers.filter((p) => p.hasOverride[cat]).length;
  }

  function resetAllPerformersProp(): void {
    sceneUndo.captureState("reset-all-overrides", "Reset all prop overrides");
    sceneUndo.withoutUndo(() => {
      for (const p of performerManager.performers) p.resetProp();
    });
    sceneUndo.commitState();
  }

  function resetAllPerformersEffort(): void {
    sceneUndo.captureState("reset-all-overrides", "Reset all effort overrides");
    sceneUndo.withoutUndo(() => {
      for (const p of performerManager.performers) p.resetEffort();
    });
    sceneUndo.commitState();
  }

  function resetAllPerformersEffects(): void {
    sceneUndo.captureState("reset-all-overrides", "Reset all effect overrides");
    sceneUndo.withoutUndo(() => {
      for (const p of performerManager.performers) p.resetEffects();
    });
    sceneUndo.commitState();
  }

  function resetAllPerformersPlanes(): void {
    sceneUndo.captureState("reset-all-overrides", "Reset all plane overrides");
    sceneUndo.withoutUndo(() => {
      for (const p of performerManager.performers) p.resetPlanes();
    });
    sceneUndo.commitState();
  }

  type ScopedPerformerSnapshot = {
    performer: CharacterInstanceState;
    snapshot: PerformerDomainSnapshot;
  };

  function captureScopedEditingSnapshots(
    targets: readonly CharacterInstanceState[]
  ): ScopedPerformerSnapshot[] {
    return targets.map((performer) => ({
      performer,
      snapshot: performer.captureEditingSnapshot(),
    }));
  }

  function restoreScopedEditingSnapshots(
    snapshots: readonly ScopedPerformerSnapshot[]
  ): void {
    sceneUndo.withoutUndo(() => {
      for (const { performer, snapshot } of snapshots) {
        performer.restoreEditingSnapshot(snapshot);
      }
    });
  }

  function applyScopedPerformerEdit(
    type: SceneUndoOperationType,
    description: string,
    mutate: (performer: CharacterInstanceState) => void,
    coalescingKey?: string,
    sideEffects?: { undo: () => void; redo: () => void }
  ): boolean {
    const targets = scopedPerformers();
    if (targets.length === 0) return false;
    const before = captureScopedEditingSnapshots(targets);
    sceneUndo.withoutUndo(() => {
      for (const performer of targets) mutate(performer);
    });
    const after = captureScopedEditingSnapshots(targets);
    const restore = {
      undo: () => {
        restoreScopedEditingSnapshots(before);
        sideEffects?.undo();
      },
      redo: () => {
        restoreScopedEditingSnapshots(after);
        sideEffects?.redo();
      },
    };
    if (coalescingKey) {
      sceneUndo.pushSelfRestoringEntryCoalescing(
        type,
        description,
        restore,
        `${coalescingKey}:${targets.map((performer) => performer.id).join(",")}`
      );
    } else {
      sceneUndo.pushSelfRestoringEntry(type, description, restore);
    }
    return true;
  }

  function setHandPlaneScoped(hand: "left" | "right", plane: Plane): boolean {
    const scopeLabel =
      scopedPerformers().length > 1 ? "Selected performers" : hand;
    return applyScopedPerformerEdit(
      "set-hand-plane",
      `${scopeLabel}: ${plane}`,
      (performer) => performer.setHandPlane(hand, plane)
    );
  }

  function setCharacterScoped(modelId: CharacterId): boolean {
    const name =
      CHARACTER_DEFINITIONS.find((definition) => definition.id === modelId)
        ?.name ?? modelId;
    return applyScopedPerformerEdit(
      "change-character",
      `Character: ${name}`,
      (performer) => performer.setCharacter(modelId)
    );
  }

  function setPropScoped(prop: PropType): boolean {
    return applyScopedPerformerEdit(
      "change-prop",
      `Prop: ${prop}`,
      (performer) => performer.setProp(prop)
    );
  }

  /**
   * Apply a per-performer cast plan as one viewer history entry. Director
   * instructions intentionally bypass the current selection: their indices
   * address the whole live cast that was included in the interpreted scene.
   */
  function applyPerformerAppearanceAssignments(
    assignments: readonly ViewerPerformerAppearanceAssignment[]
  ): boolean {
    const byIndex = new Map(
      assignments.map((assignment) => [assignment.index, assignment])
    );
    const targets = [...byIndex]
      .map(([index, assignment]) => ({
        performer: performerManager.performers[index],
        assignment,
      }))
      .filter(
        (
          target
        ): target is {
          performer: CharacterInstanceState;
          assignment: ViewerPerformerAppearanceAssignment;
        } => !!target.performer
      );
    if (targets.length === 0) return false;

    const before = captureScopedEditingSnapshots(
      targets.map((target) => target.performer)
    );
    sceneUndo.withoutUndo(() => {
      for (const { performer, assignment } of targets) {
        if (assignment.characterId) {
          performer.setCharacter(assignment.characterId);
        }
        if (assignment.prop) performer.setProp(assignment.prop);
      }
    });
    const after = captureScopedEditingSnapshots(
      targets.map((target) => target.performer)
    );
    sceneUndo.pushSelfRestoringEntry(
      targets.some((target) => target.assignment.characterId)
        ? "change-character"
        : "change-prop",
      "TIKA: direct cast",
      {
        undo: () => restoreScopedEditingSnapshots(before),
        redo: () => restoreScopedEditingSnapshots(after),
      }
    );
    return true;
  }

  function setPropBuildScoped(propBuild: Partial<PropBuild>): boolean {
    return applyScopedPerformerEdit(
      "change-prop-build",
      "Prop build",
      (performer) => performer.setPropBuild(propBuild)
    );
  }

  function setEffortScoped(effortId: EffortId): boolean {
    return applyScopedPerformerEdit(
      "change-effort",
      `Effort: ${effortId}`,
      (performer) => performer.setEffort(effortId)
    );
  }

  function setEffectScoped(effect: EffectType | null): boolean {
    return applyScopedPerformerEdit(
      "toggle-effect",
      `Effect: ${effect ?? "inherit"}`,
      (performer) => performer.setEffect(effect)
    );
  }

  function setHandEffectsScoped(left: EffectType, right: EffectType): boolean {
    return applyScopedPerformerEdit(
      "toggle-effect",
      `Effects: ${left} / ${right}`,
      (performer) => performer.setHandEffects(left, right)
    );
  }

  function setStaffLengthScoped(cm: number | null): boolean {
    return applyScopedPerformerEdit(
      "change-staff-length",
      "Prop size",
      (performer) => performer.setStaffLengthCm(cm),
      "selection-staff-length"
    );
  }

  function resetPropScoped(): boolean {
    return applyScopedPerformerEdit(
      "change-prop",
      "Reset selected props",
      (p) => p.resetProp()
    );
  }

  function resetPropBuildScoped(): boolean {
    return applyScopedPerformerEdit(
      "change-prop-build",
      "Reset selected prop builds",
      (performer) => performer.resetPropBuild()
    );
  }

  function resetEffortScoped(): boolean {
    return applyScopedPerformerEdit(
      "change-effort",
      "Reset selected efforts",
      (performer) => performer.resetEffort()
    );
  }

  function resetEffectsScoped(): boolean {
    return applyScopedPerformerEdit(
      "toggle-effect",
      "Reset selected effects",
      (performer) => performer.resetEffects()
    );
  }

  function resetPlanesScoped(): boolean {
    return applyScopedPerformerEdit(
      "set-hand-plane",
      "Reset selected planes",
      (performer) => {
        performer.resetPlanes();
        performer.clearBeatPlaneOverrides();
      }
    );
  }

  function resetAllOverridesScoped(): boolean {
    return applyScopedPerformerEdit(
      "reset-all-overrides",
      "Reset selected performer settings",
      (performer) => performer.resetAllOverrides()
    );
  }

  /**
   * Fan-out: load a sequence onto every performer in the current scope.
   * The viewer's "change sequence for this performer" control routes here.
   */
  function loadSequenceScoped(sequenceData: SequenceData): boolean {
    const previousSequence = _currentSequenceData;
    _currentSequenceData = sequenceData;
    const applied = applyScopedPerformerEdit(
      "change-sequence",
      `Sequence: ${sequenceData.word ?? sequenceData.name ?? "Untitled"}`,
      (performer) => performer.loadSequence(sequenceData),
      undefined,
      {
        undo: () => {
          _currentSequenceData = previousSequence;
        },
        redo: () => {
          _currentSequenceData = sequenceData;
        },
      }
    );
    if (!applied) _currentSequenceData = previousSequence;
    return applied;
  }

  function clearSequenceScoped(): boolean {
    return applyScopedPerformerEdit(
      "change-sequence",
      "Clear selected sequences",
      (performer) => performer.clearSequence()
    );
  }

  // Track the most recently applied formation preset so undo snapshots can
  // record it. Starts as "manual" until the user picks a preset.
  let activeFormation = $state<FormationPreset | "manual" | "custom">("manual");

  function captureViewerSnapshot(): ViewerDomainSnapshot {
    const performerSnapshots: PerformerPositionSnapshot[] =
      performerManager.performers.map((p) => ({
        id: p.id,
        position: { x: p.position.x, z: p.position.z },
        facingAngle: p.facingAngle,
        customLeftPlane: p.customLeftPlane,
        customRightPlane: p.customRightPlane,
      }));

    return structuredClone({
      performers: performerSnapshots,
      selectedPerformerIndex: allPerformersSelected()
        ? null
        : primaryPerformerIndex(),
      selectedPerformerIndices: selectedPerformerIndices(),
      activeFormation,
    });
  }

  function captureVisibilitySnapshot(): VisibilityDomainSnapshot {
    return structuredClone({
      visiblePlanes: new Set(visiblePlanes),
      showGridLabels,
    });
  }

  function restoreViewerSnapshot(snap: ViewerDomainSnapshot): void {
    while (performerManager.performers.length < snap.performers.length) {
      performerManager.addPerformer();
    }
    while (performerManager.performers.length > snap.performers.length) {
      performerManager.removePerformer();
    }

    performerManager.cancelFormationTransition();

    snap.performers.forEach((ps, i) => {
      const p = performerManager.performers[i];
      if (!p) return;
      p.position.x = ps.position.x;
      p.position.z = ps.position.z;
      p.setFacingAngle(ps.facingAngle);
      p.setHandPlane("left", ps.customLeftPlane);
      p.setHandPlane("right", ps.customRightPlane);
      if (_currentSequenceData && !p.totalSteps) {
        p.loadSequence(_currentSequenceData);
      }
    });

    activeFormation = snap.activeFormation;
    setPerformerSelection(
      snap.selectedPerformerIndices ??
        (snap.selectedPerformerIndex === null
          ? performerManager.performers.map((_, index) => index)
          : [snap.selectedPerformerIndex]),
      snap.selectedPerformerIndex ?? undefined
    );
  }

  function restoreVisibilitySnapshot(snap: VisibilityDomainSnapshot): void {
    visiblePlanes = new Set(snap.visiblePlanes);
    showGridLabels = snap.showGridLabels;
    persistPlanes(visiblePlanes);
  }

  function spawnPerformerWithoutUndo(): boolean {
    if (performerManager.performers.length >= performerManager.maxPerformers)
      return false;

    const sourceIndex = primaryPerformerIndex() ?? 0;
    const source = performerManager.performers[sourceIndex];

    const layoutTargets = performerManager.addPerformer();
    if (!layoutTargets) return false;

    const newIndex = performerManager.performers.length - 1;
    const newPerf = performerManager.performers[newIndex];
    sceneUndo.withoutUndo(() => {
      if (newPerf && source && source !== newPerf) {
        newPerf.setHandPlane("left", source.customLeftPlane);
        newPerf.setHandPlane("right", source.customRightPlane);
      }
      if (newPerf && _currentSequenceData) {
        newPerf.loadSequence(_currentSequenceData);
      }
    });

    replacePerformerSelection(newIndex);
    return true;
  }

  function spawnPerformerFromUI(): void {
    if (performerManager.performers.length >= performerManager.maxPerformers)
      return;

    sceneUndo.captureState("spawn-performer", "Add performer");
    spawnPerformerWithoutUndo();
    sceneUndo.commitState();
  }

  function removePerformerAtIndexWithoutUndo(index: number): boolean {
    if (performerManager.performers.length <= 1) return false;
    const layoutTargets = performerManager.removePerformer(index);
    if (!layoutTargets) return false;
    return true;
  }

  function removePerformerWithoutUndo(): boolean {
    const selected = selectedPerformerIndices();
    if (
      selected.length === 0 ||
      selected.length >= performerManager.performers.length
    ) {
      return false;
    }

    if (options.performerSelection?.removeSelection) {
      return options.performerSelection.removeSelection(selected);
    }

    const firstRemoved = Math.min(...selected);
    for (const index of [...selected].sort((a, b) => b - a)) {
      if (!removePerformerAtIndexWithoutUndo(index)) return false;
    }
    replacePerformerSelection(
      Math.min(firstRemoved, performerManager.performers.length - 1)
    );
    return true;
  }

  function removePerformerFromUI(): void {
    if (performerManager.performers.length <= 1) return;

    if (options.performerSelection?.removeSelection) {
      removePerformerWithoutUndo();
      return;
    }

    sceneUndo.captureState("remove-performer", "Remove performer");
    removePerformerWithoutUndo();
    sceneUndo.commitState();
  }

  function setPerformerCountFromUI(target: number): void {
    const current = performerManager.performers.length;
    const finiteTarget = Number.isFinite(target) ? Math.trunc(target) : current;
    const boundedTarget = Math.min(
      Math.max(finiteTarget, 1),
      performerManager.maxPerformers
    );
    if (boundedTarget === current) return;

    const operation =
      boundedTarget > current ? "spawn-performer" : "remove-performer";
    sceneUndo.captureState(
      operation,
      `Set performer count to ${boundedTarget}`
    );
    sceneUndo.withoutUndo(() => {
      const iterationLimit = Math.abs(boundedTarget - current);
      for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
        const before = performerManager.performers.length;
        if (before < boundedTarget) spawnPerformerWithoutUndo();
        else if (before > boundedTarget) {
          removePerformerAtIndexWithoutUndo(before - 1);
          const normalized = normalizeSelectedIndices(
            selectedPerformerIndices()
          );
          if (normalized.length === 0) {
            replacePerformerSelection(performerManager.performers.length - 1);
          } else {
            setPerformerSelection(
              normalized,
              primaryPerformerIndex() ?? undefined
            );
          }
        }
        if (performerManager.performers.length === before) break;
      }
    });
    sceneUndo.commitState();
  }

  function applyFormationFromUI(preset: FormationPreset): void {
    const count = performerManager.performers.length;
    if (!PRESET_VALID_COUNTS[preset]?.includes(count)) return;

    const beforeSnap = captureViewerSnapshot();

    performerManager.transitionToFormation(preset);
    activeFormation = preset;

    const targetFormation = createFormationFromPreset(preset, count);
    const afterPerformers: PerformerPositionSnapshot[] =
      performerManager.performers.map((p, i) => {
        const slot = targetFormation.slots.find((s) => s.index === i);
        const facing = resolveViewerFormationFacingAngle(
          slot,
          targetFormation,
          p.facingAngle,
          getViewerFrontStageFacingAngle(environmentId)
        );
        return {
          id: p.id,
          position: slot
            ? { x: slot.position.x, z: slot.position.z }
            : { x: p.position.x, z: p.position.z },
          facingAngle: facing,
          customLeftPlane: p.customLeftPlane,
          customRightPlane: p.customRightPlane,
        };
      });
    const afterSnap: ViewerDomainSnapshot = {
      performers: afterPerformers,
      selectedPerformerIndex: allPerformersSelected()
        ? null
        : primaryPerformerIndex(),
      selectedPerformerIndices: selectedPerformerIndices(),
      activeFormation: preset,
    };

    sceneUndo.pushSelfRestoringEntry(
      "apply-formation",
      `Formation: ${preset}`,
      {
        undo: () => restoreViewerSnapshot(beforeSnap),
        redo: () => restoreViewerSnapshot(afterSnap),
      }
    );
  }

  let _spatialBeforeSnapshot: ViewerDomainSnapshot | null = null;

  function beginSpatialEdit(): void {
    if (sceneUndo.isUndoDisabled) return;
    if (!_spatialBeforeSnapshot) {
      _spatialBeforeSnapshot = captureViewerSnapshot();
    }
  }

  function endSpatialEdit(): void {
    if (sceneUndo.isUndoDisabled || !_spatialBeforeSnapshot) return;
    const before = _spatialBeforeSnapshot;
    const after = captureViewerSnapshot();
    sceneUndo.pushSelfRestoringEntryCoalescing(
      "spatial-edit",
      "Move performer",
      {
        undo: () => restoreViewerSnapshot(before),
        redo: () => restoreViewerSnapshot(after),
      },
      "spatial-edit",
      300
    );
    _spatialBeforeSnapshot = null;
  }

  function cancelSpatialEdit(): void {
    _spatialBeforeSnapshot = null;
  }

  function markFormationCustom(): void {
    activeFormation = "custom";
  }

  sceneUndo.registerDomain("viewer", {
    capture: captureViewerSnapshot,
    restore: restoreViewerSnapshot,
  });

  sceneUndo.registerDomain("visibility", {
    capture: captureVisibilitySnapshot,
    restore: restoreVisibilitySnapshot,
  });

  function captureDefaultsSnapshot(): DefaultsDomainSnapshot {
    return {
      prop: _defaultSettings.prop,
      effortId: _defaultSettings.effortId,
      planeMode: _defaultSettings.planeMode,
      customLeftPlane: _defaultSettings.customLeftPlane,
      customRightPlane: _defaultSettings.customRightPlane,
    };
  }

  function restoreDefaultsSnapshot(snap: DefaultsDomainSnapshot): void {
    _defaultSettings.prop = snap.prop;
    _defaultSettings.effortId = snap.effortId;
    _defaultSettings.planeMode = snap.planeMode;
    _defaultSettings.customLeftPlane = snap.customLeftPlane;
    _defaultSettings.customRightPlane = snap.customRightPlane;
  }

  sceneUndo.registerDomain("defaults", {
    capture: captureDefaultsSnapshot,
    restore: restoreDefaultsSnapshot,
  });

  function undo(): string | null {
    const result = sceneUndo.undo();
    return result?.description ?? null;
  }

  function redo(): string | null {
    const result = sceneUndo.redo();
    return result?.description ?? null;
  }

  let _currentSequenceData = $state<SequenceData | null>(null);

  const effectToggles = $state<Record<string, boolean>>(
    seeded(seed?.effectToggles, loadPersistedEffectToggles)
  );
  let cameraSnapshot = $state<CameraStateSnapshot | null>(null);
  let navMode = $state<ViewerNavMode>(
    seeded(seed?.navMode, loadPersistedNavMode)
  );
  let activePreset = $state<string | null>(
    (() => {
      if (typeof localStorage === "undefined") return "behind";
      try {
        return localStorage.getItem(STORAGE_KEY_PRESET) || "behind";
      } catch {
        return "behind";
      }
    })()
  );
  let activeCameraPreset = $state<string>(
    (() => {
      if (typeof localStorage === "undefined") return "main";
      try {
        return localStorage.getItem(STORAGE_KEY_CAM_PRESET) || "main";
      } catch {
        return "main";
      }
    })()
  );
  // visiblePlanes: which grid planes are currently shown. Empty set = grid hidden.
  // On first visit, default to null (no planes shown). When the user enables the
  // grid for the first time, we auto-select only the planes the sequence uses.
  // A seeded viewer is self-contained: its seed value wins and the user's
  // persisted planes are never read.
  let visiblePlanes = $state<Set<Plane>>(
    seed?.visiblePlanes !== undefined
      ? new Set(seed.visiblePlanes as Plane[])
      : (loadPersistedPlanes() ?? new Set())
  );
  let showGridLabels = $state<boolean>(
    (() => {
      if (typeof localStorage === "undefined") return false;
      try {
        const v = localStorage.getItem(STORAGE_KEY_GRID_LABELS);
        return v === "true";
      } catch {
        return false;
      }
    })()
  );
  let webglCanvas = $state<HTMLCanvasElement | null>(null);
  let stageGroundOffset = $state(0);

  // Threlte scene internals - registered by Viewer3DScene so the offline
  // exporter can drive rendering without coupling to Threlte's reactive layer.
  let threlteRenderer = $state<unknown>(null);
  let threlteScene = $state<unknown>(null);
  let threlteCamera = $state<unknown>(null);
  // runFrame drives Threlte's full pipeline synchronously: every useTask
  // callback (puppet loop, IK, effects, render) runs in one call. The
  // offline exporter uses this to render at CPU speed, decoupled from the
  // display refresh rate.
  let threlteRunFrame = $state<((timeMs: number) => void) | null>(null);
  // Pause/resume the native rAF animation loop. During offline export the
  // loop is paused so manual runFrame calls aren't racing with rAF renders.
  let threltePauseAutoLoop = $state<(() => void) | null>(null);
  let threlteResumeAutoLoop = $state<(() => void) | null>(null);
  // Renderer objects stored in rune state are proxied, so their exposed value
  // is not a safe identity token for registration ownership.
  let threlteRegistrationOwner: unknown = null;

  // Pause the Threlte render loop when in 2D mode so the hidden 3D canvas
  // doesn't eat CPU/GPU time and stutter the active 2D animation.
  let _loopPausedFor2D = false;
  $effect(() => {
    if (renderMode === "2d" && threltePauseAutoLoop && !isExporting) {
      threltePauseAutoLoop();
      _loopPausedFor2D = true;
    } else if (
      renderMode === "3d" &&
      threlteResumeAutoLoop &&
      _loopPausedFor2D
    ) {
      threlteResumeAutoLoop();
      _loopPausedFor2D = false;
    }
  });

  // When true, the puppet loop in Viewer3DScene skips performer state updates
  // so the offline exporter can drive performers deterministically. IK and
  // effects still run normally during advance().
  let isExporting = $state(false);
  // During offline export, the exporter sets this to the desired animation
  // step each frame. The puppet loop reads it instead of the component prop
  // `currentStep`, keeping the state distribution inside useTask where
  // Svelte's $derived chain resolves correctly.
  let exportCurrentStep = $state<number | null>(null);

  // Legacy - kept for any remaining references but no longer used for gating.
  let autoRenderEnabled = $state(true);

  // Camera roll about the view axis, in degrees; positive reads clockwise to
  // the audience. camera-controls owns the camera's position and lookAt and
  // rewrites both every frame, so roll cannot be applied once - Viewer3DCamera
  // re-applies this value after the controls update on every frame. 0 leaves
  // the controls' own orientation untouched.
  let cameraRollDeg = $state(0);

  // Camera choreography sub-state - tracks the preset selected in the
  // Export popover. The recording driver that consumes this lands in
  // Phase 1 of the camera-choreography plan.
  const cameraChoreography = createCameraChoreographyState();

  // Callback slot for the effect orchestrator's per-frame update function.
  // Registered by EffectOrchestrator3D via $effect, called by the offline
  // exporter with a deterministic dt each frame.
  let updateEffectsCallback = $state<((dt: number) => void) | null>(null);

  // Camera snap callback - registered by Viewer3DCamera, called by Viewer3DViewPresets
  let _snapToFn: CameraSnapTo | null = null;

  // ---------------------------------------------------------------
  // Persistence effects - serialize state to localStorage reactively.
  // ---------------------------------------------------------------

  // Serialize the performer array whenever performer count, position,
  // facing angle, or hand planes change. The rune tracker re-runs this
  // on any write reached through the expression below.
  $effect(() => {
    const snapshots: StoredPerformerSnapshot[] =
      performerManager.performers.map((p) => ({
        characterId: p.characterId,
        position: { x: p.position.x, z: p.position.z },
        facingAngle: p.facingAngle,
        customLeftPlane: p.customLeftPlane,
        customRightPlane: p.customRightPlane,
        name: p.displayName,
        settings: {
          prop: p.settings.prop,
          effortId: p.settings.effortId,
          effect: p.settings.effect,
          staffLengthCm: p.settings.staffLengthCm,
        },
      }));
    if (!_performersPersistReady) return;
    persistPerformers(snapshots);
  });

  // Persist active formation preset.
  $effect(() => {
    persistActiveFormation(activeFormation);
  });

  // Persist the ordered selection and its compatibility primary index.
  $effect(() => {
    const selected = selectedPerformerIndices();
    persistSelectedIndices(selected);
    persistSelectedIndex(
      allPerformersSelected() ? null : primaryPerformerIndex()
    );
  });

  /**
   * Switch to 3D render mode, optionally loading choreography onto the stage.
   * Scene-authoring surfaces can enter without a sequence so the environment,
   * performers, and camera remain usable while the shot is being assembled.
   * No-ops silently when WebGL2 is unavailable so callers don't need to guard
   * every call site.
   */
  function enter3D(sequenceData: SequenceData | null = null) {
    if (!_webgl2Available) return;

    // One-time migration of the deprecated visiblePlanes key. Idempotent -
    // returns immediately once the new key exists.
    migrateLegacyPlanesIfNeeded();

    // Initialize the manager on first entry.
    if (performerManager.performers.length === 0) {
      performerManager.initialize();
    }

    // Restore persisted performers, if any. Each additional snapshot beyond
    // the first one spawns a new performer via the manager so the count
    // matches the saved state before we overwrite their fields.
    const persisted = seeded(seed?.performers, loadPersistedPerformers);
    if (persisted && persisted.length > 0) {
      while (performerManager.performers.length < persisted.length) {
        performerManager.addPerformer();
      }
      sceneUndo.withoutUndo(() => {
        persisted.forEach((snap, i) => {
          const p = performerManager.performers[i];
          if (!p) return;
          p.position.x = snap.position.x;
          p.position.z = snap.position.z;
          p.setFacingAngle(snap.facingAngle);
          p.setHandPlane("left", snap.customLeftPlane);
          p.setHandPlane("right", snap.customRightPlane);
          if (snap.characterId) p.setCharacter(snap.characterId);
          p.setDisplayName(snap.name ?? null);
          // On a plain open the per-performer prop AND staffLengthCm overrides
          // are stripped, so the performer inherits _defaultSettings.prop —
          // which points at the app prop — at the app's own size. Effort and
          // effect overrides survive either way. A verbatim open (seeded,
          // preset-sourced, or non-opted-in host) keeps all four.
          const settings = resolvePlainOpenPerformerSettings(
            snap.settings,
            _restoreVerbatim
          );
          if (settings) {
            if (settings.prop !== null)
              p.setProp(settings.prop as PropType, { equipBuild: false });
            if (settings.effortId !== null)
              p.setEffort(settings.effortId as EffortId);
            if (settings.effect !== null)
              p.setEffect(settings.effect as EffectType, { equipBuild: false });
            if (settings.staffLengthCm !== null)
              p.setStaffLengthCm(settings.staffLengthCm);
          }
        });
      });
    }

    // Load or clear choreography on every restored performer. (v1: all
    // performers share the same source sequence; per-performer offsets come
    // later.) An empty 3D workspace still owns a neutral performer so camera
    // and environment controls have a concrete stage to frame.
    _currentSequenceData = sequenceData;
    for (const p of performerManager.performers) {
      if (sequenceData) p.loadSequence(sequenceData);
      else p.clearSequence();
    }

    // Restore viewer-level state.
    const savedFormation = loadPersistedActiveFormation();
    if (savedFormation) activeFormation = savedFormation;
    if (!options.performerSelection) {
      const savedSelection = seeded(
        seed?.selectedPerformerIndices,
        loadPersistedSelectedIndices
      );
      if (savedSelection !== null) {
        const savedPrimary =
          seed?.selectedPerformerIndex ?? loadPersistedSelectedIndex();
        if (
          savedPrimary === null &&
          savedSelection.length === performerManager.performers.length
        ) {
          localSelectedPerformerIndices = null;
          localPrimaryPerformerIndex = null;
        } else {
          setLocalSelection(savedSelection, savedPrimary ?? undefined);
        }
      } else {
        const legacySelection = seeded(
          seed?.selectedPerformerIndex,
          loadPersistedSelectedIndex
        );
        localSelectedPerformerIndices =
          legacySelection === null ? null : [legacySelection];
        localPrimaryPerformerIndex = legacySelection;
      }
    }

    renderMode = "3d";
    persistMode("3d");

    // Now that restoration is complete, let the persistence $effect write
    // future changes back to localStorage.
    _performersPersistReady = true;

    // Queue welcome framing only when there is no camera to restore. A saved
    // pose belongs to the user and must win across refreshes and HMR remounts.
    // The snap executes when Viewer3DCamera registers its callback.
    if (!_hasPlayedWelcome && !_persistedCamera) {
      _welcomeAnimationPending = true;
      _hasPlayedWelcome = true;
    }
  }

  /**
   * Return to 2D render mode (character instance is kept alive to avoid
   * re-allocating WebGL resources if the user flips back).
   */
  function exit3D() {
    renderMode = "2d";
    persistMode("2d");
  }

  /**
   * Toggle a named visual effect on or off.
   * Unknown effect names are added automatically with an initial `true` value.
   */
  function toggleEffect(name: string) {
    effectToggles[name] = !effectToggles[name];
    persistEffectToggles({ ...effectToggles });
  }

  /**
   * The one owner of "this viewer now renders that environment". The exported
   * `setEnvironmentId` and the live preset apply below both route here so a
   * preset repaints the scene through exactly the path a control does.
   */
  function applyEnvironmentId(value: SceneEnvironmentId | string): void {
    const next = normalizeSceneEnvironmentId(value, environmentId);
    if (next === environmentId) return;
    environmentId = next;
    persistSceneEnvironment(next);
  }

  /**
   * Snapshot every persistable knob of this viewer state as one typed config.
   * This is the single capture point for save-a-3D-scene (and any future
   * "reproduce this viewer" feature) — the inverse of writeViewer3DConfig.
   */
  function serialize(): Viewer3DPersistConfig {
    return {
      environmentId,
      camera: cameraSnapshot ?? _persistedCamera,
      performers: performerManager.performers.map((p) => ({
        characterId: p.characterId,
        position: { x: p.position.x, z: p.position.z },
        facingAngle: p.facingAngle,
        customLeftPlane: p.customLeftPlane,
        customRightPlane: p.customRightPlane,
        name: p.displayName ?? null,
        settings: {
          prop: p.settings.prop,
          effortId: p.settings.effortId,
          effect: p.settings.effect,
          staffLengthCm: p.settings.staffLengthCm,
        },
      })),
      selectedPerformerIndex: allPerformersSelected()
        ? null
        : primaryPerformerIndex(),
      selectedPerformerIndices: selectedPerformerIndices(),
      activeFormation,
      defaultProp: String(_defaultSettings.prop),
      oceanVariant: String(oceanVariant),
      navMode,
      activePreset,
      activeCameraPreset,
      showGridLabels,
      visiblePlanes: [...visiblePlanes].map(String),
      effectToggles: { ...effectToggles },
    };
  }

  /**
   * Apply a persist config to the LIVE state — the in-viewer "load preset"
   * path, and the inverse of `serialize()` against a mounted viewer.
   *
   * `writeViewer3DConfig` only seeds the localStorage a FRESH mount reads, so
   * on its own it does nothing visible while a viewer is already on screen.
   * This walks the same fields through the live setters instead, so the scene
   * repaints immediately. Only PROVIDED fields are touched — an omitted field
   * (the packing-list group mask) leaves that part of the viewer alone.
   *
   * Render mode is deliberately not part of this: the caller is already
   * mounted in 3D. The user-facing Undo is the settings checkpoint the apply
   * service captures, so the whole apply lands as one non-undoable batch here
   * rather than as a pile of per-performer entries in the scene undo stack.
   */
  function applyPersistConfig(config: Partial<Viewer3DPersistConfig>): void {
    sceneUndo.withoutUndo(() => {
      if (config.performers) {
        // `addPerformer` returns null once the cast is at `maxPerformers`, and
        // `removePerformer` returns null at a cast of one — so a config whose
        // count sits outside that range (a hand-edited or future-versioned
        // Firestore doc) would spin these loops forever. Clamp to what the
        // manager can actually hold; an empty array floors at one performer,
        // and the forEach below skips any index the cast doesn't reach.
        const targetCount = Math.min(
          Math.max(config.performers.length, 1),
          performerManager.maxPerformers
        );
        while (performerManager.performers.length < targetCount) {
          performerManager.addPerformer();
        }
        while (performerManager.performers.length > targetCount) {
          performerManager.removePerformer();
        }
        performerManager.cancelFormationTransition();

        config.performers.forEach((snap, i) => {
          const p = performerManager.performers[i];
          if (!p) return;
          p.position.x = snap.position.x;
          p.position.z = snap.position.z;
          p.setFacingAngle(snap.facingAngle);
          p.setHandPlane("left", snap.customLeftPlane);
          p.setHandPlane("right", snap.customRightPlane);
          if (snap.characterId) p.setCharacter(snap.characterId);
          p.setDisplayName(snap.name ?? null);
          // Clear all four cascade overrides first. A preset that stores null
          // for a field means "inherit the viewer default", and only a reset
          // expresses that — writing nothing would leave the outgoing
          // performer's override standing.
          p.resetProp();
          p.resetEffort();
          p.resetEffects();
          p.setStaffLengthCm(null);
          if (snap.settings) {
            if (snap.settings.prop !== null) {
              const prop = asPropType(snap.settings.prop);
              if (prop) p.setProp(prop, { equipBuild: false });
            }
            if (snap.settings.effortId !== null)
              p.setEffort(snap.settings.effortId as EffortId);
            if (snap.settings.effect !== null)
              p.setEffect(snap.settings.effect as EffectType, {
                equipBuild: false,
              });
            if (snap.settings.staffLengthCm !== null)
              p.setStaffLengthCm(snap.settings.staffLengthCm);
          }
          // A performer spawned to match the preset's cast size arrives with
          // no choreography; give it the sequence the stage is already running.
          if (_currentSequenceData && !p.totalSteps) {
            p.loadSequence(_currentSequenceData);
          }
        });
      }

      if (config.activeFormation !== undefined)
        activeFormation = config.activeFormation;
      if (config.selectedPerformerIndices !== undefined) {
        setPerformerSelection(
          config.selectedPerformerIndices,
          config.selectedPerformerIndex ?? undefined
        );
      } else if (config.selectedPerformerIndex !== undefined) {
        if (config.selectedPerformerIndex === null) selectAllPerformers();
        else replacePerformerSelection(config.selectedPerformerIndex);
      }

      // `setDefaultProp` is the owner; its undo capture is already suppressed
      // by the enclosing `withoutUndo`, so this is exactly the inline write.
      const nextDefaultProp = asPropType(config.defaultProp);
      if (nextDefaultProp) setDefaultProp(nextDefaultProp);

      if (config.effectToggles) {
        for (const key of Object.keys(effectToggles)) delete effectToggles[key];
        Object.assign(effectToggles, config.effectToggles);
        persistEffectToggles({ ...effectToggles });
      }

      if (config.environmentId) applyEnvironmentId(config.environmentId);
      if (config.oceanVariant !== undefined) {
        oceanVariant = config.oceanVariant as OceanVariant;
        writeKey(STORAGE_KEY_OCEAN_VARIANT, oceanVariant);
      }

      // Camera-group fields. A fresh mount reads every one of these at
      // construct time, so a live apply that skipped them would diverge from
      // the same preset opened cold.
      if (config.navMode !== undefined) {
        navMode = config.navMode;
        persistNavMode(navMode);
      }
      if (config.activePreset !== undefined) {
        activePreset = config.activePreset;
        writeKey(STORAGE_KEY_PRESET, activePreset ?? "");
      }
      if (config.activeCameraPreset !== undefined) {
        activeCameraPreset = config.activeCameraPreset;
        writeKey(STORAGE_KEY_CAM_PRESET, activeCameraPreset);
      }
      if (config.showGridLabels !== undefined) {
        showGridLabels = config.showGridLabels;
        writeKey(STORAGE_KEY_GRID_LABELS, String(showGridLabels));
      }
      if (config.visiblePlanes) {
        const known = new Set<string>(Object.values(Plane));
        visiblePlanes = new Set(
          config.visiblePlanes.filter((v) => known.has(v)) as Plane[]
        );
        persistPlanes(visiblePlanes);
      }

      if (config.camera) {
        snapCameraTo(config.camera.position, config.camera.target);
      } else if (config.performers) {
        // No saved camera in this preset — reframe to fit the new cast.
        frameAllPerformers();
      }
    });
  }

  /**
   * Record the latest camera snapshot so descendant components (e.g. the
   * mini-map or a screenshot tool) can read camera state without coupling
   * directly to Three.js objects.
   */
  function updateCameraSnapshot(snapshot: CameraStateSnapshot) {
    cameraSnapshot = snapshot;
    persistCamera(snapshot);
  }

  /**
   * Liveness, tracked separately from `renderMode`. `renderMode` is a user
   * preference the viewer persists; it survives `dispose()` untouched, so it
   * cannot answer "are these performers still real?". A deferred caller (an
   * Undo toast outliving the mount that spawned it) needs that answer, because
   * `performerManager.destroy()` destroys each performer without emptying the
   * array — the cast looks intact and is not.
   */
  let _disposed = false;

  /**
   * Release all resources held by the character instance.
   * Call when the viewer component is unmounted.
   */
  function dispose() {
    _disposed = true;
    unsubscribeFromUndo();
    performerManager.destroy();
  }

  function _fireWelcome(): void {
    if (!_welcomeAnimationPending || !_snapToFn) return;
    _welcomeAnimationPending = false;
    const performers = performerManager.performers;
    if (performers.length === 0) return;
    const shot = computeViewerOpeningShot(performers);
    snapCameraTo(
      { x: shot.eye.x, y: shot.eye.y, z: shot.eye.z },
      { x: shot.target.x, y: shot.target.y, z: shot.target.z }
    );
  }

  /**
   * Register the snap-to callback from Viewer3DCamera so preset buttons
   * can animate the camera without direct coupling to Three.js objects.
   */
  function registerSnapTo(fn: CameraSnapTo) {
    _snapToFn = fn;
    if (_welcomeAnimationPending) {
      requestAnimationFrame(() => _fireWelcome());
    }
    // An old renderer can unmount after its replacement has registered.
    return () => {
      if (_snapToFn === fn) _snapToFn = null;
    };
  }

  /**
   * Animate the camera to a new position/target. No-ops if the camera
   * hasn't registered its snap callback yet.
   */
  function snapCameraTo(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    spherical?: { azimuth: number; polar: number },
    animate: boolean = true,
    transitionTiming?: TimedTransition
  ) {
    _snapToFn?.(position, target, spherical, animate, transitionTiming);
  }

  return {
    get webgl2Available() {
      return _webgl2Available;
    },
    get preferredMode() {
      return _persistedMode;
    },
    get persistedCamera() {
      return cameraSnapshot ?? _persistedCamera;
    },
    get renderMode() {
      return renderMode;
    },
    /** False until `dispose()`; a disposed viewer must not be written to. */
    get disposed() {
      return _disposed;
    },
    get oceanVariant() {
      return oceanVariant;
    },
    /** Environment rendered inside this viewer. */
    get environmentId(): SceneEnvironmentId {
      return environmentId;
    },
    setEnvironmentId: applyEnvironmentId,
    /**
     * Compatibility for older preview harnesses. Production controls use
     * `environmentId` and `setEnvironmentId` for every viewer.
     */
    get seededBackgroundType(): string | null {
      return persistent ? null : environmentId;
    },
    setSeededBackgroundType(value: string): boolean {
      if (persistent) return false;
      environmentId = normalizeSceneEnvironmentId(value, environmentId);
      return true;
    },
    /**
     * Whether this viewer orbits its camera on its own, and how fast. Unseeded
     * viewers never do — the real viewer's camera belongs to the user.
     */
    get seededAutoOrbit(): boolean {
      return seed?.autoOrbit ?? false;
    },
    get seededAutoOrbitSpeed(): number {
      return seed?.autoOrbitSpeed ?? 2.0;
    },
    /** Scene-feature toggles this viewer owns; `null` = use the shared key. */
    get seededSceneFeatures(): Record<string, boolean> | null {
      return seed?.sceneFeatures ?? null;
    },
    /**
     * Scene-feature toggles a shared link imposed on this viewer; `null` = use
     * the shared key. Same effect as `seededSceneFeatures` on the canvas, but
     * available to a real (non-preview) viewer.
     */
    get viewOnlySceneFeatures(): Record<string, boolean> | null {
      return options.viewOnlySceneFeatures ?? null;
    },
    setOceanVariant(v: OceanVariant) {
      oceanVariant = v;
      writeKey(STORAGE_KEY_OCEAN_VARIANT, v);
    },
    get activePopover() {
      return _activePopover;
    },
    openPopover,
    closePopover,
    get performerManager() {
      return performerManager;
    },
    get selectedPerformerIndex() {
      return !options.performerSelection &&
        localSelectedPerformerIndices === null
        ? null
        : primaryPerformerIndex();
    },
    get primaryPerformerIndex() {
      return primaryPerformerIndex();
    },
    get selectedPerformerIndices() {
      return selectedPerformerIndices();
    },
    get isAllPerformersSelected() {
      return allPerformersSelected();
    },
    get performerSelectionMode() {
      return performerSelectionMode;
    },
    setPerformerSelectionMode(value: boolean) {
      performerSelectionMode = value;
    },
    get isCameraDragging() {
      return isCameraDragging;
    },
    setCameraDragging(value: boolean) {
      isCameraDragging = value;
    },
    get navMode(): ViewerNavMode {
      return navMode;
    },
    setNavMode(value: ViewerNavMode) {
      navMode = value;
      persistNavMode(value);
    },
    scopedPerformers,
    selectPerformerScope,
    setPerformerSelection,
    replacePerformerSelection,
    togglePerformerSelection,
    clearPerformerSelection,
    selectAllPerformers,
    frameAllPerformers,
    focusSelectedPerformers,
    get propSizeLinked() {
      return propSizeLinked;
    },
    togglePropSizeLink,
    setCharacterScoped,
    setPropScoped,
    applyPerformerAppearanceAssignments,
    setPropBuildScoped,
    setEffortScoped,
    setEffectScoped,
    setHandEffectsScoped,
    setStaffLengthScoped,
    setHandPlaneScoped,
    loadSequenceScoped,
    clearSequenceScoped,
    resetPropScoped,
    resetPropBuildScoped,
    resetEffortScoped,
    resetEffectsScoped,
    resetPlanesScoped,
    resetAllOverridesScoped,
    get canUndo() {
      undoRevision;
      return sceneUndo.canUndo;
    },
    get canRedo() {
      undoRevision;
      return sceneUndo.canRedo;
    },
    get activeFormation() {
      return activeFormation;
    },
    spawnPerformerFromUI,
    removePerformerFromUI,
    setPerformerCountFromUI,
    applyFormationFromUI,
    beginSpatialEdit,
    endSpatialEdit,
    cancelSpatialEdit,
    markFormationCustom,
    sceneUndo,
    undo,
    redo,
    // Default settings cascade
    get defaultSettings() {
      return _defaultSettings;
    },
    setDefaultProp,
    setDefaultEffort,
    setDefaultPlaneMode,
    setDefaultHandPlane,
    overrideCountForCategory,
    resetAllPerformersProp,
    resetAllPerformersEffort,
    resetAllPerformersEffects,
    resetAllPerformersPlanes,
    get effectToggles() {
      return effectToggles;
    },
    get cameraSnapshot() {
      return cameraSnapshot;
    },
    get visiblePlanes() {
      return visiblePlanes;
    },
    get showGrid() {
      return visiblePlanes.size > 0;
    },
    get showGridLabels() {
      return showGridLabels;
    },
    toggleGridLabels() {
      sceneUndo.captureState("toggle-grid-labels", "Toggle grid labels");
      showGridLabels = !showGridLabels;
      writeKey(STORAGE_KEY_GRID_LABELS, String(showGridLabels));
      sceneUndo.commitState();
    },
    get activePreset() {
      return activePreset;
    },
    setActivePreset(id: string | null) {
      activePreset = id;
      writeKey(STORAGE_KEY_PRESET, id ?? "");
    },
    get activeCameraPreset() {
      return activeCameraPreset;
    },
    setActiveCameraPreset(id: string) {
      activeCameraPreset = id;
      writeKey(STORAGE_KEY_CAM_PRESET, id);
    },
    /**
     * Toggle a single grid plane on or off.
     */
    togglePlane(plane: Plane) {
      sceneUndo.captureState(
        "toggle-plane-visibility",
        `Toggle ${plane} plane`
      );
      const next = new Set(visiblePlanes);
      if (next.has(plane)) next.delete(plane);
      else next.add(plane);
      visiblePlanes = next;
      persistPlanes(visiblePlanes);
      sceneUndo.commitState();
    },
    /**
     * Show all three grid planes at once.
     */
    showAllPlanes() {
      visiblePlanes = new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]);
      persistPlanes(visiblePlanes);
    },
    /**
     * Hide all grid planes.
     */
    hideAllPlanes() {
      visiblePlanes = new Set();
      persistPlanes(visiblePlanes);
    },
    /**
     * Toggle between "all planes visible" and "no planes visible".
     * When turning on for the first time (or after hide-all), defaults to
     * wall-only since all current sequences use the wall plane.
     */
    toggleGrid(_sequenceData?: SequenceData | null) {
      if (visiblePlanes.size > 0) {
        // Already showing something - turn off everything
        visiblePlanes = new Set();
      } else {
        // Turn on - show only the planes the sequence actually uses.
        // Currently every sequence uses the wall plane, so we default to that.
        // When multi-plane sequences exist, read sequenceData.gridMode here.
        const defaultPlane = Plane.WALL;
        visiblePlanes = new Set([defaultPlane]);
      }
      persistPlanes(visiblePlanes);
    },
    get webglCanvas() {
      return webglCanvas;
    },
    setWebglCanvas(canvas: HTMLCanvasElement | null) {
      webglCanvas = canvas;
    },
    get stageGroundOffset() {
      return stageGroundOffset;
    },
    setStageGroundOffset(v: number) {
      stageGroundOffset = v;
    },
    // Threlte scene internals for offline export
    get threlteRenderer() {
      return threlteRenderer;
    },
    get threlteScene() {
      return threlteScene;
    },
    get threlteCamera() {
      return threlteCamera;
    },
    /**
     * Register Threlte internals from Viewer3DScene so the offline exporter
     * can drive the full render pipeline synchronously.
     */
    registerThrelteInternals(refs: {
      renderer: unknown;
      scene: unknown;
      camera: unknown;
      runFrame: (timeMs: number) => void;
      pauseAutoLoop: () => void;
      resumeAutoLoop: () => void;
    }) {
      threlteRegistrationOwner = refs.renderer;
      threlteRenderer = refs.renderer;
      threlteScene = refs.scene;
      threlteCamera = refs.camera;
      threlteRunFrame = refs.runFrame;
      threltePauseAutoLoop = refs.pauseAutoLoop;
      threlteResumeAutoLoop = refs.resumeAutoLoop;
      return () => {
        // A replacement legacy canvas can register before the old canvas's
        // effect cleanup runs. Only the owner of the current handles may clear
        // them, otherwise Record Scene can get stuck on "Preparing."
        if (threlteRegistrationOwner !== refs.renderer) return;
        threlteRegistrationOwner = null;
        threlteRenderer = null;
        threlteScene = null;
        threlteCamera = null;
        threlteRunFrame = null;
        threltePauseAutoLoop = null;
        threlteResumeAutoLoop = null;
        _loopPausedFor2D = false;
      };
    },
    get threlteRunFrame() {
      return threlteRunFrame;
    },
    get threltePauseAutoLoop() {
      return threltePauseAutoLoop;
    },
    get threlteResumeAutoLoop() {
      return threlteResumeAutoLoop;
    },
    get isExporting() {
      return isExporting;
    },
    set isExporting(value: boolean) {
      isExporting = value;
    },
    get exportCurrentStep() {
      return exportCurrentStep;
    },
    set exportCurrentStep(value: number | null) {
      exportCurrentStep = value;
    },
    get autoRenderEnabled() {
      return autoRenderEnabled;
    },
    pauseAutoRender() {
      autoRenderEnabled = false;
    },
    resumeAutoRender() {
      autoRenderEnabled = true;
    },
    get updateEffects() {
      return updateEffectsCallback;
    },
    set updateEffects(fn: ((dt: number) => void) | null) {
      updateEffectsCallback = fn;
    },
    get cameraChoreography() {
      return cameraChoreography;
    },
    get cameraRollDeg() {
      return cameraRollDeg;
    },
    set cameraRollDeg(value: number) {
      cameraRollDeg = value;
    },
    get showPerf() {
      return showPerf;
    },
    togglePerf() {
      showPerf = !showPerf;
    },
    get currentSequenceData() {
      return _currentSequenceData;
    },
    serialize,
    applyPersistConfig,
    enter3D,
    exit3D,
    toggleEffect,
    updateCameraSnapshot,
    registerSnapTo,
    snapCameraTo,
    dispose,
  };
}

export type Viewer3DState = ReturnType<typeof buildViewer3DState>;

export function createViewer3DState(
  seed?: Viewer3DStateSeed,
  options?: Viewer3DStateOptions
): Viewer3DState {
  return buildViewer3DState(seed, options);
}

/**
 * One-shot marker that the NEXT viewer mount was seeded by a saved preset
 * (applyScene3DLook). Consumed at construct; without it, a plain open
 * re-seeds prop identity from the app prop (domain/plain-open-policy.ts).
 * Same pattern as SCENE_BPM_INTENT_KEY.
 */
export const VIEWER3D_PRESET_INTENT_KEY = "tka-viewer3d-preset-intent";

export function markViewer3DPresetIntent(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(VIEWER3D_PRESET_INTENT_KEY, "1");
  } catch {
    // Quota/unavailable — worst case the next open follows the app prop.
  }
}

/**
 * Drop a pending marker without consuming it as a signal — for undoing an
 * apply, where the preset that wrote it no longer holds.
 */
export function clearViewer3DPresetIntent(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(VIEWER3D_PRESET_INTENT_KEY);
  } catch {
    // Unavailable storage means there was no marker to leave behind anyway.
  }
}

function consumeViewer3DPresetIntent(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const present = sessionStorage.getItem(VIEWER3D_PRESET_INTENT_KEY) === "1";
    sessionStorage.removeItem(VIEWER3D_PRESET_INTENT_KEY);
    return present;
  } catch {
    // Unreadable storage downgrades a preset open to a plain one. Acceptable:
    // the same failure already cost us the persisted keys the preset wrote, so
    // there is no verbatim look left to restore anyway.
    return false;
  }
}

/**
 * Serializable subset of viewer-3d-state that is backed by the scattered
 * `tka-viewer3d-*` localStorage keys. The save-a-3D-scene feature captures this
 * from the live state and re-seeds it before opening a fresh viewer (which reads
 * these keys at construct / enter3D time) — the same "seed then mount" pattern
 * open-tunnel-in-viewer uses. Kept in this module so it can reach the private
 * STORAGE_KEY_* constants.
 */
export interface Viewer3DPersistConfig {
  environmentId: SceneEnvironmentId;
  camera: CameraStateSnapshot | null;
  performers: StoredPerformerSnapshot[];
  selectedPerformerIndex: number | null;
  /** Ordered selection. Optional on scenes saved before multi-selection. */
  selectedPerformerIndices?: number[];
  activeFormation: FormationPreset | "manual" | "custom";
  defaultProp: string;
  oceanVariant: string;
  navMode: ViewerNavMode;
  activePreset: string | null;
  activeCameraPreset: string;
  showGridLabels: boolean;
  visiblePlanes: string[];
  /** Named visual-effect toggles (fire/led/trails/…). Optional for configs
   *  captured before effect persistence existed. */
  effectToggles?: Record<string, boolean>;
}

/**
 * Seed the localStorage keys a freshly-constructed viewer-3d-state reads, plus
 * force render mode to "3d". Only PROVIDED fields are written — omit a field to
 * leave the user's current persisted value alone (this is how the packing-list
 * group mask applies selectively). Best-effort per key so a single quota
 * failure doesn't abort the rest. Call BEFORE mounting the viewer.
 */
export function writeViewer3DConfig(
  config: Partial<Viewer3DPersistConfig>
): void {
  if (typeof localStorage === "undefined") return;
  const set = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota exceeded / unavailable — skip this key, keep going.
    }
  };
  set(STORAGE_KEY_MODE, "3d");
  if (config.environmentId !== undefined)
    set(STORAGE_KEY_ENVIRONMENT, config.environmentId);
  if (config.camera) set(STORAGE_KEY_CAMERA, JSON.stringify(config.camera));
  if (config.performers)
    set(STORAGE_KEY_PERFORMERS, JSON.stringify(config.performers));
  if (config.activeFormation !== undefined)
    set(STORAGE_KEY_ACTIVE_FORMATION, config.activeFormation);
  if (config.selectedPerformerIndex !== undefined) {
    set(
      STORAGE_KEY_SELECTED_INDEX,
      config.selectedPerformerIndex === null
        ? "null"
        : String(config.selectedPerformerIndex)
    );
  }
  if (config.selectedPerformerIndices !== undefined) {
    set(
      STORAGE_KEY_SELECTED_INDICES,
      JSON.stringify(config.selectedPerformerIndices)
    );
  }
  if (config.defaultProp !== undefined)
    set(STORAGE_KEY_DEFAULT_PROP, config.defaultProp);
  if (config.oceanVariant !== undefined)
    set(STORAGE_KEY_OCEAN_VARIANT, config.oceanVariant);
  if (config.navMode !== undefined) set(STORAGE_KEY_NAV_MODE, config.navMode);
  if (config.activePreset !== undefined)
    set(STORAGE_KEY_PRESET, config.activePreset ?? "");
  if (config.activeCameraPreset !== undefined)
    set(STORAGE_KEY_CAM_PRESET, config.activeCameraPreset);
  if (config.showGridLabels !== undefined)
    set(STORAGE_KEY_GRID_LABELS, String(config.showGridLabels));
  if (config.visiblePlanes)
    set(STORAGE_KEY_VISIBLE_PLANES, JSON.stringify(config.visiblePlanes));
  if (config.effectToggles) {
    set(STORAGE_KEY_EFFECT_TOGGLES, JSON.stringify(config.effectToggles));
  }
}

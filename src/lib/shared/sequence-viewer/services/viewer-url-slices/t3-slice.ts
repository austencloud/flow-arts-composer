/**
 * t3 slice — 3D viewer state <-> URL payload.
 * Capture: diff vs POST-NORMALIZE defaults (null at defaults), one sub-key per
 * encoded store. Seed: merge onto those same defaults (the sender diffed
 * against them).
 *
 * ## What the six candidate 3D stores turned out to be
 *
 * | key | owner | verdict |
 * | --- | --- | --- |
 * | `tka-viewer3d-environment` | `viewer-3d-state.svelte.ts`, per-mount factory built at orchestrator scope | ENCODE as `env` |
 * | `tka-scene-features` | `scene-feature-state.svelte.ts`, per-mount factory built inside `Viewer3DCanvas` | ENCODE as `features` |
 * | `tka-3d-quality-tier-override` | `QualityTierDetector` | EXCLUDE — device capability |
 * | `tka-3d-animator-state` | `scene3d-persister.ts` | EXCLUDE — dead key |
 * | `tka-3d-playback-state` | `createPlaybackState` default key | EXCLUDE — unreachable + transient |
 * | `tka-scene-audio-v1` | `sceneAudioState` singleton | EXCLUDE — device-personal, not visual |
 *
 * **Quality tier is deliberately never encoded.** `tka-3d-quality-tier-override`
 * describes the GPU in front of the sender, not the scene they composed. A
 * sender on a workstation must not push HIGH onto a phone (or LOW onto a
 * workstation) just by sharing a link; the recipient's own detection and
 * adaptive-DPR loop own that number. It is excluded in both directions.
 *
 * **`tka-3d-animator-state` is a dead key.** `scene3d-persister.ts` exports
 * `saveScene3DState`/`loadScene3DState`, `get-scene-3d-persister.ts` re-exports
 * them, and a repo-wide search finds no other importer of either module — so
 * nothing reads or writes that key at runtime. There is no live state to
 * snapshot and seeding it would change nothing on screen.
 *
 * **`tka-3d-playback-state` is never written either.** It is only
 * `createPlaybackState`'s DEFAULT storage key, and all three call sites pass an
 * explicit `persistenceKey`: `avatar-instance-state.svelte.ts` uses
 * `tka-3d-playback-${id}` (per performer) and the 3D workbench route uses its
 * own. Its contents are also the wrong kind of state for a link — `isPlaying`
 * is transient (the viewer's own playback controller owns whether a shared link
 * arrives playing), and per-performer `speed`/`loop` are keyed by an avatar id
 * the recipient's cast need not contain.
 *
 * **`tka-scene-audio-v1` is excluded as device-personal.** `masterVolume` and
 * `muted` describe the recipient's room and headphones, the same class of fact
 * as the GPU tier: a sender at full volume must not unmute a phone in a quiet
 * space. `playing` and `audioUnlocked` are transient runtime — browser autoplay
 * policy gates them behind a gesture the recipient has not made yet, so they
 * cannot be restored from a URL at all. That leaves `trackPreferences` (which
 * ambient track a scene variant plays) as the one durable, non-device field,
 * and this feature's contract is the viewer's VISUAL state; shipping a link
 * that carried a soundtrack choice while the volume it plays at stayed the
 * recipient's would be an incoherent half-encode. The whole store stays out.
 *
 * ## Deliberate omissions inside the two encoded stores
 *
 * From the scene-feature state: `readySet`, `progressMap`, `errorMap`,
 * `retryRequestMap` and `warmupProgress` are load-cycle runtime, not settings —
 * the store itself never persists them, and a recipient's assets load on their
 * own clock. Only the enabled map travels.
 *
 * From viewer-3d-state: the other twelve `tka-viewer3d-*` keys (camera,
 * performers, formation, planes, prop, nav mode, presets, effect toggles,
 * ocean variant, grid labels, selected index, render mode) are NOT in this
 * task's store list and stay out. `performers` in particular is the one that
 * would decide the payload's size — a full `StoredPerformerSnapshot[]` with
 * per-performer position, facing, planes and settings dwarfs everything else in
 * the blob, so adding it is a sizing decision, not a mechanical extension.
 *
 * ## Diff baselines
 *
 * Baselines are what a factory-fresh load actually HOLDS, never a raw constant
 * (the trap that stamped a bogus `fx=` onto untouched viewers).
 *
 * - `features`: a fresh `createSceneFeatureState()` with nothing stored resolves
 *   every key to its registry `defaultEnabled` — no forced or derived fields —
 *   so the registry IS the post-normalize default. `t3-slice.test.ts` proves it
 *   against a real isolated instance so a future normalize change fails loudly.
 * - `env`: the baseline is `DEFAULT_SCENE_ENVIRONMENT_ID`. A viewer whose
 *   environment is anything else emits it, INCLUDING a first-use value derived
 *   from the sender's own app background — the environment is the single most
 *   visible 3D choice, and a link that elided it would silently repaint the
 *   scene in the recipient's theme. The own-link rule still keeps that from
 *   flipping the sender's own reopened link into view-only: `isOverride`
 *   compares against `persistedT3SliceFromStorage`, which reproduces the same
 *   payload from the recipient's disk.
 *
 * No mirror-pair fields here (unlike fx's activeEffect/tipEffectMap or an's
 * effortPreset/tipEffortMap) — env and the feature toggles are independent.
 */
import {
  DEFAULT_SCENE_ENVIRONMENT_ID,
  VIEWER_3D_ENVIRONMENT_STORAGE_KEY,
  normalizeSceneEnvironmentId,
  type SceneEnvironmentId,
} from "#lib/shared/3d/environments/domain/scene-environment.js";
import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";
import { SCENE_FEATURES_STORAGE_KEY } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";

export interface T3SlicePayload {
  /** `tka-viewer3d-environment`, elided at `DEFAULT_SCENE_ENVIRONMENT_ID`. */
  env?: SceneEnvironmentId;
  /** `tka-scene-features`, only the keys that differ from registry defaults. */
  features?: Record<string, boolean>;
}

/** The live 3D state this slice reads, narrowed to the two encoded stores. */
export interface T3SliceSource {
  /** The viewer-3d state (`viewer3DState.environmentId`). */
  environmentId: SceneEnvironmentId;
  /** The mounted pane's scene-feature state (`isEnabled` is all this needs). */
  features: { isEnabled(key: string): boolean } | null;
}

/** What a factory-fresh feature state holds: every registry default. */
export function postNormalizeSceneFeatureDefaults(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  for (const feature of SCENE_FEATURES) {
    defaults[feature.key] = feature.defaultEnabled;
  }
  return defaults;
}

function captureFeatures(
  features: NonNullable<T3SliceSource["features"]>,
  full: boolean
): Record<string, boolean> | null {
  const patch: Record<string, boolean> = {};
  for (const feature of SCENE_FEATURES) {
    const live = features.isEnabled(feature.key);
    if (full || live !== feature.defaultEnabled) patch[feature.key] = live;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * `full` emits the environment and every registry feature (Share/Copy Link);
 * the default diff form elides what matches the baselines.
 */
export function captureT3Slice(
  source: T3SliceSource,
  options: { full?: boolean } = {}
): T3SlicePayload | null {
  const full = options.full === true;
  const payload: T3SlicePayload = {};

  if (full || source.environmentId !== DEFAULT_SCENE_ENVIRONMENT_ID) {
    payload.env = source.environmentId;
  }
  // A closed 3D pane has no feature state. The session's pass-through keeps
  // whatever the URL already held for `t3` while nothing is registered, so an
  // unmounted pane is silent rather than emitting a half payload. (The
  // orchestrator's full-snapshot fallback supplies the seed-or-disk feature
  // map for Share while the pane is closed.)
  if (source.features) {
    const features = captureFeatures(source.features, full);
    if (features) payload.features = features;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

export interface T3SliceSeed {
  environmentId: SceneEnvironmentId;
  /** ALWAYS the complete map, never a patch — see `seedFromT3Slice`. */
  sceneFeatures: Record<string, boolean>;
}

/**
 * Full store payloads ready for the view-only seam, merged onto the diff
 * baselines.
 *
 * `sceneFeatures` is deliberately the COMPLETE map even when the payload
 * carried no feature diff. `Viewer3DCanvas` treats a null feature override as
 * "use the shared key", which would hand a link-override session a state that
 * reads AND WRITES the recipient's `tka-scene-features` — a zero-write
 * violation. A complete map keeps that instance isolated in both directions.
 */
export function seedFromT3Slice(payload: T3SlicePayload): T3SliceSeed {
  return {
    environmentId: normalizeSceneEnvironmentId(
      payload.env,
      DEFAULT_SCENE_ENVIRONMENT_ID
    ),
    sceneFeatures: {
      ...postNormalizeSceneFeatureDefaults(),
      ...payload.features,
    },
  };
}

/**
 * The payload the recipient's OWN disk would produce, for the own-link rule.
 * Both sides of that comparison go through this module so a link built from a
 * visitor's own state is byte-identical to what their capture emits.
 *
 * Strictly read-only. `loadPersistedEnvironment` (viewer-3d-state) is NOT used
 * because it writes the normalized value back as a first-use migration; this
 * reproduces its result without the write, which is what the zero-write
 * contract requires before any override decision has been made.
 */
export function persistedT3SliceFromStorage(
  firstUseEnvironment: SceneEnvironmentId = DEFAULT_SCENE_ENVIRONMENT_ID,
  options: { full?: boolean } = {}
): T3SlicePayload | null {
  if (typeof localStorage === "undefined") return null;

  let storedEnvironment: string | null = null;
  let storedFeatures: Record<string, unknown> = {};
  try {
    storedEnvironment = localStorage.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY);
    const raw = localStorage.getItem(SCENE_FEATURES_STORAGE_KEY);
    if (raw) storedFeatures = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Unreadable storage reads as "nothing persisted": every seed then looks
    // like an override, which is the safe direction — it never writes.
  }

  const environmentId = normalizeSceneEnvironmentId(
    storedEnvironment,
    firstUseEnvironment
  );
  // Same three-tier resolution `createSceneFeatureState` runs, minus the
  // overrides tier a persistent viewer never supplies: stored > registry
  // default, and stale keys outside the registry are ignored.
  return captureT3Slice(
    {
      environmentId,
      features: {
        isEnabled(key: string): boolean {
          const stored = storedFeatures[key];
          if (typeof stored === "boolean") return stored;
          return SCENE_FEATURES.find((f) => f.key === key)?.defaultEnabled ?? false;
        },
      },
    },
    options
  );
}

/**
 * Full-snapshot source for the `t3` slice while the 3D pane is closed. A
 * seeded (view-only) session reports the seed it was built from, expanded
 * onto the defaults; a persistent session reports what its own disk holds.
 * Either way the payload is the complete state the pane WOULD show if
 * opened, which is what a copied link must pin.
 */
export function unmountedT3SliceSource(
  seed: T3SliceSeed | null,
  firstUseEnvironment: SceneEnvironmentId
): T3SliceSource | null {
  if (seed) {
    return {
      environmentId: seed.environmentId,
      features: {
        isEnabled: (key) => seed.sceneFeatures[key] ?? false,
      },
    };
  }
  if (typeof localStorage === "undefined") return null;
  let storedEnvironment: string | null = null;
  let storedFeatures: Record<string, unknown> = {};
  try {
    storedEnvironment = localStorage.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY);
    const raw = localStorage.getItem(SCENE_FEATURES_STORAGE_KEY);
    if (raw) storedFeatures = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Unreadable storage reads as "nothing persisted" — registry defaults.
  }
  return {
    environmentId: normalizeSceneEnvironmentId(
      storedEnvironment,
      firstUseEnvironment
    ),
    features: {
      isEnabled(key: string): boolean {
        const stored = storedFeatures[key];
        if (typeof stored === "boolean") return stored;
        return SCENE_FEATURES.find((f) => f.key === key)?.defaultEnabled ?? false;
      },
    },
  };
}

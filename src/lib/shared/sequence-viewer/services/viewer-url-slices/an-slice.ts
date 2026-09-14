/**
 * an slice — 2D animation settings <-> URL payload.
 * Capture: per-key diff vs POST-NORMALIZE defaults (null at defaults).
 * Seed: merge onto those same defaults (the sender diffed against them).
 *
 * Two stores, two sub-keys. `tka_trail_settings` is deliberately EXCLUDED: its
 * only reader is the per-engine `createAnimatorState()`, and
 * `TrailSettingsSynchronizer.handleSettingsChange` writes it only when no
 * external trail settings were supplied. Every viewer surface DOES supply them
 * (`AnimationPlayer.svelte` and `ViewerSplitPane.svelte` both pass
 * `animationSettings.trail`), so in the viewer that key is neither source nor
 * sink — it is shadowed by `tka_animation_settings.trail`. Encoding it would
 * put the same `TrailSettings` shape in the URL twice.
 *
 * Diff baselines are what a factory-fresh load actually HOLDS, not the raw
 * exported constants (the trap that stamped a bogus `fx=` onto untouched
 * viewers). For settings that happens to BE `DEFAULT_ANIMATION_SETTINGS`: the
 * forced-vivid block in `loadSettings()` writes exactly `DEFAULT_TRAIL_SETTINGS`
 * (asserted in `an-slice.test.ts`). For visibility it does not — `loadFromStorage`
 * forces `stepNumbers = true` and derives `tipEffortMap` from `effortPreset` — so
 * that baseline is read off a fresh ephemeral manager instead of a constant.
 *
 * `effortPreset` + `tipEffortMap` are ONE quantity, the same mirror-pair trap as
 * fx's `activeEffect`/`tipEffectMap`. Both are normalized before diffing and
 * always travel together.
 *
 * Capture overlays the viewer's effective path policy on the raw snapshot.
 * `pathPreview` preserves an explicit Arc override even when its values match
 * factory defaults. Restoration still uses the original user-owned snapshot.
 */
import type {
  AnimationSettings,
  AnimationSettingsState,
  TrailSettings,
} from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import {
  DEFAULT_ANIMATION_SETTINGS,
  DEFAULT_TRAIL_SETTINGS,
} from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import {
  AnimationVisibilityStateManager,
  type AnimationVisibilitySettings,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { TipEffortMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import { deepEqual } from "../viewer-url-state-codec";

/** `version` is schema metadata the loader always rewrites — never user state. */
interface AnimationSettingsPatch {
  bpm?: number;
  shouldLoop?: boolean;
  trail?: Partial<TrailSettings>;
}

export interface AnSlicePayload {
  pathPreview?: boolean;
  settings?: AnimationSettingsPatch;
  visibility?: Partial<AnimationVisibilitySettings>;
}

/** The live globals, narrowed to what this slice reads. */
export interface AnSliceStores {
  settings: Pick<AnimationSettingsState, "snapshot">;
  visibility: Pick<AnimationVisibilityStateManager, "snapshot"> &
    Partial<
      Pick<AnimationVisibilityStateManager, "getPathPolicy" | "getPathSession">
    >;
}

/** The `tipEffortMap` that `loadFromStorage` derives for a given preset. */
function canonicalTipEffortMap(effort: EffortId): TipEffortMap {
  return effort === "linear" ? {} : { "*": { effort } };
}

/** Collapses the effortPreset/tipEffortMap mirror pair into one comparable form. */
function normalizeEffort(
  settings: AnimationVisibilitySettings
): Pick<AnimationVisibilitySettings, "effortPreset" | "tipEffortMap"> {
  const map = settings.tipEffortMap ?? {};
  const effort = (map["*"]?.effort ?? settings.effortPreset) as EffortId;
  const canonical = canonicalTipEffortMap(effort);
  return {
    effortPreset: effort,
    // An exotic per-tip map is not representable by the preset alone, so it
    // rides along verbatim instead of being flattened away.
    tipEffortMap: deepEqual(map, canonical) ? canonical : map,
  };
}

function normalizedVisibility(
  settings: AnimationVisibilitySettings
): AnimationVisibilitySettings {
  return { ...settings, ...normalizeEffort(settings) };
}

let visibilityBaseline: AnimationVisibilitySettings | null = null;

/**
 * What the visibility manager holds after a factory-fresh load. Read off an
 * ephemeral instance so the baseline can never drift from `getDefaultSettings`.
 */
export function postNormalizeVisibilityDefaults(): AnimationVisibilitySettings {
  visibilityBaseline ??= normalizedVisibility(
    new AnimationVisibilityStateManager({ ephemeral: true }).snapshot()
  );
  return visibilityBaseline;
}

/** What the settings store holds after a factory-fresh `loadSettings()`. */
export function postNormalizeAnimationDefaults(): AnimationSettings {
  return {
    ...DEFAULT_ANIMATION_SETTINGS,
    trail: { ...DEFAULT_TRAIL_SETTINGS },
  };
}

function captureSettings(
  snapshot: AnimationSettings,
  full: boolean
): AnimationSettingsPatch | null {
  const base = postNormalizeAnimationDefaults();
  const patch: AnimationSettingsPatch = {};

  if (full || snapshot.bpm !== base.bpm) patch.bpm = snapshot.bpm;
  if (full || snapshot.shouldLoop !== base.shouldLoop) {
    patch.shouldLoop = snapshot.shouldLoop;
  }

  const trail: Partial<TrailSettings> = {};
  for (const key of Object.keys(base.trail) as (keyof TrailSettings)[]) {
    if (full || !deepEqual(snapshot.trail[key], base.trail[key])) {
      (trail as Record<string, unknown>)[key] = snapshot.trail[key];
    }
  }
  if (Object.keys(trail).length > 0) patch.trail = trail;

  return Object.keys(patch).length > 0 ? patch : null;
}

function captureVisibility(
  snapshot: AnimationVisibilitySettings,
  full: boolean
): Partial<AnimationVisibilitySettings> | null {
  const base = postNormalizeVisibilityDefaults();
  const live = normalizedVisibility(snapshot);
  const patch: Partial<AnimationVisibilitySettings> = {};

  for (const key of Object.keys(
    base
  ) as (keyof AnimationVisibilitySettings)[]) {
    // The mirror pair is one quantity, handled below: both fields or neither.
    if (key === "effortPreset" || key === "tipEffortMap") continue;
    if (full || !deepEqual(live[key], base[key])) {
      (patch as Record<string, unknown>)[key] = live[key];
    }
  }

  if (
    full ||
    live.effortPreset !== base.effortPreset ||
    !deepEqual(live.tipEffortMap, base.tipEffortMap)
  ) {
    patch.effortPreset = live.effortPreset;
    patch.tipEffortMap = live.tipEffortMap;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * `full` emits every settings and visibility key (Share/Copy Link); the
 * default diff form elides what matches the post-normalize baseline.
 */
export function captureAnSlice(
  stores: AnSliceStores,
  options: { full?: boolean } = {}
): AnSlicePayload | null {
  const full = options.full === true;
  const settings = captureSettings(stores.settings.snapshot(), full);
  const visibility = captureVisibility(
    {
      ...stores.visibility.snapshot(),
      ...stores.visibility.getPathPolicy?.(),
    },
    full
  );

  const payload: AnSlicePayload = {};
  if (stores.visibility.getPathSession?.()?.preview) payload.pathPreview = true;
  if (settings) payload.settings = settings;
  if (visibility) payload.visibility = visibility;

  return Object.keys(payload).length > 0 ? payload : null;
}

export interface AnSliceSeed {
  settings: AnimationSettings;
  visibility: AnimationVisibilitySettings;
}

/**
 * Merges only keys the target already has. The blob is user-editable JSON, and
 * `Object.assign` with an own `__proto__` key would re-parent the target.
 */
function assignKnownKeys<T extends object>(target: T, patch: object): void {
  for (const key of Object.keys(target)) {
    if (key in patch) {
      (target as Record<string, unknown>)[key] = (
        patch as Record<string, unknown>
      )[key];
    }
  }
}

/** Full store payloads ready for `replaceAll`, merged onto the diff baselines. */
export function seedFromAnSlice(payload: AnSlicePayload): AnSliceSeed {
  const settings = postNormalizeAnimationDefaults();
  if (payload.settings) {
    const { trail, ...top } = payload.settings;
    assignKnownKeys(settings, top);
    if (trail) assignKnownKeys(settings.trail, trail);
  }

  const visibility = structuredClone(postNormalizeVisibilityDefaults());
  if (payload.visibility) assignKnownKeys(visibility, payload.visibility);

  return { settings, visibility: normalizedVisibility(visibility) };
}

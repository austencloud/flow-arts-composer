/**
 * ex slice — export options <-> URL payload.
 * Capture: per-key diff vs POST-NORMALIZE defaults (null at defaults), one
 * sub-payload per export surface (`video`, `split`, `image`).
 * Seed: merge onto those same defaults (the sender diffed against them).
 *
 * Discovery: `createExportOptionsState()` (export-options-state.svelte.ts) is
 * NOT constructed per-mount. `getExportOptionsState()` lazily creates ONE
 * module-scope singleton and ~8 files call it directly with no injection
 * seam — AnimationSettings.svelte, ExportPopover.svelte, PostStudioPane.svelte,
 * PostStudio.svelte, PostShareSheet.svelte, export-orchestrator.ts,
 * export-coordinator.svelte.ts, create-scene-video-export.svelte.ts. Same
 * topology as the `an` slice's global stores, so this slice clones the `an`
 * MEMENTO pattern (borrow -> suspend -> apply seed -> restore -> resume) via
 * `setPersistenceSuspended`/`snapshot`/`replaceAll`, NOT the fx instance-seam
 * pattern (there is no `{ persist: false }` construction site to seed).
 *
 * Diff baselines are what a factory-fresh load actually HOLDS, never the raw
 * exported constants (the trap that stamped a bogus `fx=` onto untouched
 * viewers). Verified here: `loadFromStorage()`'s no-stored-entry branch
 * returns `DEFAULT_VIDEO_OPTIONS`/`DEFAULT_SPLIT_OPTIONS`/`DEFAULT_IMAGE_OPTIONS`
 * completely untouched — no forced fields, no derived values (unlike `an`'s
 * forced `stepNumbers`) — so those constants ARE the post-normalize defaults.
 * `ex-slice.test.ts` proves this against a real factory-fresh, non-injected
 * `createExportOptionsState()` instance so a future normalize change would
 * fail loudly instead of silently drifting.
 *
 * `split.quality` is excluded from the payload: `getSplitOptions()`,
 * `buildSnapshot()`, and `persist()` all hardcode it to `"standard"`
 * unconditionally — it is schema shape, never real user state, the same
 * reasoning `an-slice.ts` uses to exclude `version`. `split.resolution`,
 * `split.effectOverrides`, and `split.includeEndHold` DO stay in the payload
 * even though this manager exposes no public setter for them: they are live
 * `$state`, seeded from whatever was in storage at load (a legacy install
 * could hold a non-default value), and dropping them would silently lose
 * fidelity on an otherwise-complete state snapshot.
 *
 * No mirror-pair fields here (unlike fx's activeEffect/tipEffectMap or an's
 * effortPreset/tipEffortMap) — every field is independent.
 */
import type {
  ExportOptionsState,
  ExportOptionsStateManager,
  VideoExportOptions,
  SplitExportOptions,
  ImageExportOptions,
} from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
import {
  DEFAULT_VIDEO_OPTIONS,
  DEFAULT_SPLIT_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
} from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
import { deepEqual } from "../viewer-url-state-codec";

/** `quality` is hardcoded to "standard" everywhere on the split sub-store — schema shape, never user state. */
type SplitPatchSource = Omit<SplitExportOptions, "quality">;

export interface ExSlicePayload {
  video?: Partial<VideoExportOptions>;
  split?: Partial<SplitPatchSource>;
  image?: Partial<ImageExportOptions>;
}

/** The live global, narrowed to what this slice reads. */
export type ExSliceStore = Pick<ExportOptionsStateManager, "snapshot">;

function diffAgainstDefaults<T extends object>(
  live: T,
  base: T,
  full: boolean
): Partial<T> | null {
  const patch: Partial<T> = {};
  for (const key of Object.keys(base) as (keyof T)[]) {
    if (full || !deepEqual(live[key], base[key])) {
      patch[key] = live[key];
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

const SPLIT_DEFAULTS: SplitPatchSource = (() => {
  const { quality: _quality, ...rest } = DEFAULT_SPLIT_OPTIONS;
  return rest;
})();

/**
 * `full` emits every key of all three sub-stores (Share/Copy Link); the
 * default diff form elides what matches the defaults.
 */
export function captureExSlice(
  store: ExSliceStore,
  options: { full?: boolean } = {}
): ExSlicePayload | null {
  const full = options.full === true;
  const snap = store.snapshot();
  const { quality: _splitQuality, ...liveSplit } = snap.split;

  const video = diffAgainstDefaults(snap.video, DEFAULT_VIDEO_OPTIONS, full);
  const split = diffAgainstDefaults(liveSplit, SPLIT_DEFAULTS, full);
  const image = diffAgainstDefaults(snap.image, DEFAULT_IMAGE_OPTIONS, full);

  const payload: ExSlicePayload = {};
  if (video) payload.video = video;
  if (split) payload.split = split;
  if (image) payload.image = image;

  return Object.keys(payload).length > 0 ? payload : null;
}

/** Full store payload ready for `replaceAll`, merged onto the diff baselines. */
export function seedFromExSlice(payload: ExSlicePayload): ExportOptionsState {
  return {
    video: { ...DEFAULT_VIDEO_OPTIONS, ...payload.video },
    split: { ...DEFAULT_SPLIT_OPTIONS, ...payload.split, quality: "standard" },
    image: { ...DEFAULT_IMAGE_OPTIONS, ...payload.image },
  };
}

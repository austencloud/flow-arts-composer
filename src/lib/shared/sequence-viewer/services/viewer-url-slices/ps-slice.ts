/**
 * ps slice — Post Studio setup <-> URL payload.
 * Capture: per-field diff vs the LIVE per-session default (never a fixed
 * constant — see "Diff baseline" below). Seed: validate + pass through; unlike
 * fx/t3/tn/cd there is no "merge onto a full default object" step, because
 * every field independently falls through to `PostStudio.svelte`'s OWN
 * existing default-computation when absent (see "No merge step" below).
 *
 * ## What "setup" turned out to be
 *
 * `PostStudio.svelte` has no backing store of its own — its effects instance
 * is inherited from the sequence-viewer's `fx` context (see "fx inheritance"
 * below) and its whole video-composition layout (which source occupies which
 * slot, clip transforms, trims, tempo, playback mode — `createMediaCompositionState`)
 * is a per-mount object with NO existing seed seam. Wiring a seed into it
 * would mean designing a partial-patch/merge mechanism against a recursively
 * Zod-validated preset schema (`MediaCompositionPresetSchema`,
 * `media-layout-schema.ts`) — a materially bigger undertaking than any other
 * Phase B store, and a genuinely new mini-feature rather than "clone the
 * fx-slice pattern." That is EXCLUDED here as a scope/sizing decision, the
 * same call `t3-slice.ts` made for `performers` — not because the layout is
 * meaningless, but because encoding it is not a mechanical extension of this
 * task. It stays a candidate for a follow-up task.
 *
 * What remains — the component's OWN `$state` locals — is mostly transient UI
 * runtime (open pickers, focus, errors, measured/resizable panel geometry).
 * Three fields survive as genuine, durable, visual-setup choices a recipient
 * should see:
 *
 * ENCODED:
 * - `propType` — `selectedPropType`, the prop rendered across every preview
 *   in the studio. Diffed against THIS SESSION's own live default (see below),
 *   never written to `settingsService` by Post Studio (`setPropType` only
 *   reassigns the local `$state`), so seeding it costs zero writes.
 * - `audioMode` — `"original" | "instagram"`, captured only when
 *   `audioModeTouched` (the user explicitly picked one) — see "Touched-flag
 *   diffing" below. Never written to storage; `setAudioMode` only reassigns
 *   local `$state`.
 *
 * EXCLUDED, with reasons:
 * - `chosenPerformance`: references a locally-uploaded or user-library video
 *   the recipient's browser cannot resolve. Same class as a preset-by-id
 *   reference tn had to guard against, except there is no by-value form for a
 *   video — the source itself cannot travel in a URL. A recipient who has the
 *   same sequence still gets the sequence's own `performanceVideoUrl` (server
 *   data, not local); only the sender's LOCAL override is excluded.
 * - `performancePickerOpen`, `focusedPanel`: transient panel disclosure/focus,
 *   the same class as tn's excluded `lookEditorOpen`.
 * - `timingAdvanced`: transient panel disclosure (the advanced-timing section
 *   toggle) — same class as `lookEditorOpen`, not a saved preference.
 * - `performanceLibraryError`, `exportError`, `exportedUrl`, `exportProgress`,
 *   `exportCancelled`, `handLabelingPending`, `audioInspectionVersion`,
 *   `performanceHasAudio`, `bootedToPerformance`, `localPerformanceUrl`:
 *   transient runtime/error/bookkeeping state, never a setting.
 * - `workspaceWidth`, `workspaceHeight`, `viewportHeight`, `workspaceSizes`,
 *   `workspaceWasAdjusted`: measured, viewport-relative pixel geometry — the
 *   same "measured sizes" class this project excludes everywhere (t3's quality
 *   tier, an's device capability). A sender's panel split in THEIR pixels is
 *   not a portable choice for a recipient's viewport.
 * - the `fx` effects config: NOT re-encoded here. `PostStudio.svelte:98-101`
 *   reads `getEffectsConfigContext() ?? createEffectsConfigState(undefined,
 *   { persist: false })`. Inside the sequence viewer,
 *   `SequenceViewerOrchestrator.svelte` calls `setEffectsConfigContext` on the
 *   `fx`-sliced instance BEFORE `PostStudioPane`/`PostStudio` mount (it is a
 *   descendant, and Svelte context flows down), so that local fallback is
 *   unreachable in-viewer — the exact finding Task 5 recorded for
 *   `ViewerSplitPane`. The two standalone test routes
 *   (`/test/post-studio`, `/test/post-share-sheet`) mount `PostStudio` with no
 *   orchestrator and no session either, so the fallback firing there is
 *   correct and outside this slice's scope. Encoding effects again here would
 *   be the `fx` `activeEffect`/`tipEffectMap` mirror-pair trap at slice
 *   granularity — one visual fact, two owners.
 * - the media-composition layout (slot assignment, clip transforms/trims,
 *   tempo, playback mode, safe-zone toggle): see "What 'setup' turned out to
 *   be" above.
 *
 * ## Diff baseline: per-session live value, not a fixed constant
 *
 * `selectedPropType`'s fallback (`settingsService.settings.leftPropType ??
 * PropType.STAFF`) is PER-USER, not a fixed app default — unlike
 * `DEFAULT_EFFECTS_CONFIG.activeEffect` or `DEFAULT_TUNNEL_VIEW_STATE`. A
 * fixed-constant diff would be wrong in both directions: it would capture a
 * spurious override for every sender whose own prop preference differs from
 * `PropType.STAFF` (even though they never touched Post Studio's prop
 * picker), and a seeded viewer would need to out-rank the recipient's own
 * preference regardless. So `capturePsSlice` diffs `propType` against
 * `defaultPropType`, which callers MUST pass as the live
 * `settingsService.settings.leftPropType ?? PropType.STAFF` read at capture
 * time in THAT SAME session — never a stored/cached value. Because
 * `selectedPropType` is itself initialized from that identical expression
 * (absent a seed), a truly untouched mount always diffs to itself and never
 * emits `propType` — only an explicit `setPropType` call produces a diff.
 *
 * ## Touched-flag diffing (`audioMode`)
 *
 * `audioMode`'s own default is not a constant either — it is
 * `canKeepOriginalAudio ? "original" : "instagram"`, an async-derived value
 * (`canKeepOriginalAudio` depends on `hasDecodableAudioTrack`, a real decode
 * probe on the performance video) that is not knowable synchronously at
 * capture time. Recomputing it here to diff against would require redoing
 * that probe. `PostStudio.svelte` already tracks the distinction with
 * `audioModeTouched` — true only after an explicit `setAudioMode` call — so
 * capture uses THAT as the diff signal instead of the value: touched means
 * "the sender explicitly chose this, regardless of what auto-detection would
 * have picked," and untouched never emits a payload field, matching the
 * async-baseline the sender saw with no re-derivation needed.
 *
 * ## No merge step on seed
 *
 * fx/t3/tn/cd's seed functions merge a payload onto a COMPLETE default object,
 * because their live stores need a complete value to construct with. Post
 * Studio's `$state` locals need no such thing: `propType` and `audioMode` are
 * two independent local variables, and each already has its own
 * default-computation `PostStudio.svelte` runs when nothing seeds it (the
 * settingsService read, the async audio-mode effect). `seedFromPsSlice`
 * therefore only validates and narrows the decoded
 * payload — filtering unrecognized enum strings from a hand-edited URL — and
 * leaves an absent field absent, letting the component's own logic run
 * unchanged for anything the sender did not touch.
 *
 * ## Own-link rule
 *
 * Every encoded field is pure per-mount state with no persisted disk form (no
 * `localStorage` key, no `settingsService` write — see the EXCLUDED write
 * paths above). `persistedPsSlice()` therefore always returns `null`: there is
 * no on-disk snapshot to reproduce for the comparison. Since `capturePsSlice`
 * on a truly untouched mount ALSO always returns `null` (see "Diff baseline"
 * and "Touched-flag diffing" above), `null` correctly reproduces what this
 * session's own fresh mount would capture — the own-link rule degenerates to
 * "any non-null seed is always an override," which is the right behavior:
 * reopening your OWN Post-Studio link should still show your chosen
 * prop/audio/mirror, because there is no disk state for it to fall back to
 * instead.
 */
import {
  PropType,
  type PropType as PropTypeValue,
} from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export type PsAudioMode = "original" | "instagram";

export interface PsSlicePayload {
  /** `selectedPropType`, elided when it matches this session's own live default. */
  propType?: PropTypeValue;
  /** Present only when the sender explicitly picked a track (`audioModeTouched`). */
  audioMode?: PsAudioMode;
}

/** The live component state this slice reads, narrowed to the three encoded fields. */
export interface PsSliceSource {
  propType: PropTypeValue;
  /**
   * What THIS session's own fresh mount would resolve `propType` to absent
   * any seed — read live (`settingsService.settings.leftPropType ??
   * PropType.STAFF`) by the caller at capture time, never a stored constant.
   * See the module doc comment, "Diff baseline".
   */
  defaultPropType: PropTypeValue;
  audioMode: PsAudioMode;
  audioModeTouched: boolean;
}

/**
 * `full` always emits `propType` (Share/Copy Link — the recipient's own prop
 * preference must not leak into a borrowed view). `audioMode` stays gated on
 * the touched flag in both modes: its untouched value is an async probe
 * result the recipient re-derives from the same video.
 */
export function capturePsSlice(
  source: PsSliceSource,
  options: { full?: boolean } = {}
): PsSlicePayload | null {
  const full = options.full === true;
  const payload: PsSlicePayload = {};

  if (full || source.propType !== source.defaultPropType) {
    payload.propType = source.propType;
  }
  // Touched-flag diffing, not value diffing — see the module doc comment.
  if (source.audioModeTouched) {
    payload.audioMode = source.audioMode;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

const VALID_PROP_TYPES = new Set<string>(Object.values(PropType));
const VALID_AUDIO_MODES: readonly PsAudioMode[] = ["original", "instagram"];

export interface PsSliceSeed {
  propType?: PropTypeValue;
  audioMode?: PsAudioMode;
}

/**
 * Validates and narrows a decoded payload. There is no merge-onto-defaults
 * step here — see the module doc comment, "No merge step on seed". An
 * unrecognized `propType`/`audioMode` string (a hand-edited URL) is dropped
 * rather than applied, so `PostStudio.svelte`'s own default-computation runs
 * for that field exactly as if nothing had seeded it.
 */
export function seedFromPsSlice(payload: PsSlicePayload): PsSliceSeed {
  const seed: PsSliceSeed = {};
  if (payload.propType && VALID_PROP_TYPES.has(payload.propType)) {
    seed.propType = payload.propType;
  }
  if (payload.audioMode && VALID_AUDIO_MODES.includes(payload.audioMode)) {
    seed.audioMode = payload.audioMode;
  }
  return seed;
}

/**
 * The own-link comparison baseline — always `null`. See the module doc
 * comment, "Own-link rule": every encoded field has no persisted disk form,
 * so there is nothing to reproduce, and `null` is exactly what this session's
 * own untouched capture would also produce.
 */
export function persistedPsSlice(): PsSlicePayload | null {
  return null;
}

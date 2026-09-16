/**
 * cd slice — choreo-card composition <-> URL payload.
 * Capture: per-key diff vs POST-NORMALIZE defaults (null at defaults), plus the
 * viewed sequence length's per-length choices.
 * Seed: merge onto those same defaults (the sender diffed against them), with
 * the excluded fields kept at the RECIPIENT's live values.
 *
 * Discovery: the card's column count has no separate owner. The
 * `columnCount: null` in `viewer-orchestrator-context-state.svelte.ts` is a
 * hardcoded "no explicit prop" pass-through; `ChoreoCard.svelte` then falls back
 * to `compositionManager.getColumnCountForStepCount(stepCount)`. Every writer
 * agrees — `ExportImagePanel.setColumns`, the card context menu
 * (`card-menu-section.ts`), and `choreo-card-layout-state` all read and write
 * that one manager ("The composition manager is the one owner for columns. It
 * persists a choice per sequence length"). So this slice owns both halves of
 * Task 12: `cols` is that manager's per-length column choice, and the blob
 * carries the rest of its state.
 *
 * `getImageCompositionManager()` is a module singleton (preserved across HMR)
 * that ~10 files call directly with no injection seam, so this slice clones the
 * `an`/`ex` MEMENTO pattern rather than fx's instance seam.
 *
 * Every write path of that store, and how each is gated while borrowed:
 *   1. `writeLocalCopy()` -> `tka-image-composition-settings`. Suspended.
 *   2. `writeScopedColumnPreference()` -> `…:column-preferences-v1:<owner>`.
 *      Suspended.
 *   3. `pushAccountSettings()` -> `settingsService.updateSetting("imageExport")`
 *      -> FIRESTORE + the account-settings mirror. Suspended. This is the one
 *      that matters most: a link must never write the sender's card settings
 *      into the recipient's account.
 *   4. `saveToStorage()` — the funnel every setter uses. Suspended, and it also
 *      stops recording session-identity bookkeeping, so a recipient's tweaks
 *      during the session cannot later outrank their own account snapshot.
 *   5. `settingsService.onRemoteSettingsApplied` / `onAuthStateChanged` — async
 *      identity work that can land MID-session (auth restore is concurrent with
 *      a cold link load, so this is the common path, not an edge case). Queued
 *      by `runOrDefer` and run after the snapshot is restored, so it neither
 *      writes during the session nor clobbers the link's card with the
 *      recipient's own settings.
 *   6. The one-shot `…:notesDefaultMigrated` marker in `loadSettings()`. Not
 *      gated and not a session write: it runs once inside the constructor,
 *      which fires before any viewer borrows the store, and it records the
 *      RECIPIENT's own boot migration.
 *
 * ENCODED (flat): addWord, addStepNumbers, addDifficultyLevel,
 * includeStartPlacement, customName, showLoopGlyph, showNotes, customNotesText,
 * showQRCode, showMandala, startPlacementLayout — plus, for the viewed sequence
 * length only, `cols` (headline param), `startLayout` and `infoCell`. This is
 * a wire contract: captureCdSlice only ever emits these exact keys.
 *
 * seedFromCdSlice additionally accepts, READ-ONLY, the pre-rename
 * `includeStartPosition` / `startPositionLayout` names inside `rest.settings`
 * for share links minted before the position -> placement rename shipped.
 * They are never added to ENCODED_FIELDS and captureCdSlice never writes them.
 *
 * EXCLUDED, with reasons:
 * - `darkMode`: a MIRROR of `AnimationVisibilityManager`, which this store
 *   observes and copies. The `an` slice already owns it; encoding it here would
 *   be the fx `activeEffect`/`tipEffectMap` trap across two slices, and the
 *   seeded value would immediately be overwritten by the visibility observer.
 *   It is also why the diff baseline can be the raw constant: a factory-fresh
 *   load takes `darkMode` from that manager, not from the constant.
 * - `addUserInfo`: derived. `createSettings()` forces `addUserInfo === showNotes`
 *   on every load, so it carries no state of its own.
 * - `columnCountPreferenceOwner` / `columnCountPreferenceVersion`: identity
 *   provenance. The owner string is literally `user:<sender uid>` — a UID must
 *   never travel in a shareable URL — and a foreign owner would be sanitized to
 *   Auto on arrival anyway (`sanitizeColumnCountPreference`).
 * - `columnCountOverrides` as a map: per-length and identity-gated. Only the
 *   viewed sequence's length is meaningful in a link that carries that
 *   sequence, so it rides the single `cols` headline param instead.
 * - `startPlacementLayoutOverrides` / `infoCellChoiceOverrides` as maps: same
 *   per-length argument, encoded as `startLayout` / `infoCell` for the viewed
 *   length only. `infoCell` is encoded ONLY when an explicit override exists;
 *   the derived value would duplicate showQRCode/showMandala.
 */
import type { InfoCellChoice } from "$lib/shared/sequence-viewer/services/info-cell-display";
import type { ImageCompositionSettings } from "$lib/shared/share/state/image-composition-state.svelte";
import { DEFAULT_IMAGE_COMPOSITION_SETTINGS } from "$lib/shared/share/state/image-composition-state.svelte";
import { deepEqual } from "../viewer-url-state-codec";

/** The flat fields that are real, length-independent user state. */
const ENCODED_FIELDS = [
  "addWord",
  "addStepNumbers",
  "addDifficultyLevel",
  "includeStartPlacement",
  "customName",
  "showLoopGlyph",
  "showNotes",
  "customNotesText",
  "showQRCode",
  "showMandala",
  "startPlacementLayout",
] as const satisfies readonly (keyof ImageCompositionSettings)[];

type EncodedField = (typeof ENCODED_FIELDS)[number];

export type CdSliceSettingsPatch = Partial<
  Pick<ImageCompositionSettings, EncodedField>
>;

/**
 * Position -> placement rename, read-side only. Share links minted before the
 * rename shipped can still carry `rest.settings.includeStartPosition` /
 * `startPositionLayout` under these pre-rename names. seedFromCdSlice reads
 * them as a fallback when the current-name field is absent; captureCdSlice
 * never writes them and they are intentionally NOT part of ENCODED_FIELDS —
 * the wire contract above stays unchanged.
 */
type LegacyCdSliceSettingsPatch = {
  includeStartPosition?: boolean;
  startPositionLayout?: "row" | "column";
};

export interface CdSlicePayload {
  /** Headline `cols` param: the column choice for the viewed sequence length. */
  cols?: number;
  /** Compressed blob half. */
  rest?: {
    settings?: CdSliceSettingsPatch;
    startLayout?: "row" | "column";
    infoCell?: InfoCellChoice;
  };
}

/** The live global, narrowed to what this slice reads. */
export interface CdSliceStore {
  getSettings(): ImageCompositionSettings;
}

/**
 * `full` emits every encoded flat field (Share/Copy Link); the default diff
 * form elides what matches the defaults. The per-length choices are the same
 * in both modes: `cols` only when a real number (Auto is the absence of a
 * key, which the seed writes as an explicit null), `startLayout`/`infoCell`
 * only when an explicit override exists (the derived value would duplicate
 * showQRCode/showMandala). `customName` has no default and is emitted only
 * when the sender set one.
 */
export function captureCdSlice(
  store: CdSliceStore,
  stepCount: number,
  options: { full?: boolean } = {}
): CdSlicePayload | null {
  const full = options.full === true;
  const live = store.getSettings();
  const key = String(stepCount);

  const settings: CdSliceSettingsPatch = {};
  for (const field of ENCODED_FIELDS) {
    if (full && live[field] === undefined) continue;
    if (full || !deepEqual(live[field], DEFAULT_IMAGE_COMPOSITION_SETTINGS[field])) {
      (settings as Record<string, unknown>)[field] = live[field];
    }
  }

  const payload: CdSlicePayload = {};
  const cols = live.columnCountOverrides?.[key];
  // `null` and a missing key both mean Auto; only a real number is state.
  if (typeof cols === "number") payload.cols = cols;

  const rest: NonNullable<CdSlicePayload["rest"]> = {};
  if (Object.keys(settings).length > 0) rest.settings = settings;
  const startLayout = live.startPlacementLayoutOverrides?.[key];
  if (startLayout) rest.startLayout = startLayout;
  const infoCell = live.infoCellChoiceOverrides?.[key];
  if (infoCell) rest.infoCell = infoCell;
  if (Object.keys(rest).length > 0) payload.rest = rest;

  return Object.keys(payload).length > 0 ? payload : null;
}

/**
 * Full store payload ready for `replaceAll`. Encoded fields merge onto the
 * post-normalize defaults; excluded fields keep `current` (the recipient's live
 * state) so a link never resets their dark mode, their column-preference
 * identity, or their choices for other sequence lengths.
 */
export function seedFromCdSlice(
  payload: CdSlicePayload,
  stepCount: number,
  current: ImageCompositionSettings
): ImageCompositionSettings {
  const key = String(stepCount);
  const startPlacementLayoutOverrides = {
    ...(current.startPlacementLayoutOverrides ?? {}),
  };
  const infoCellChoiceOverrides = {
    ...(current.infoCellChoiceOverrides ?? {}),
  };

  const startLayout = payload.rest?.startLayout;
  if (startLayout) startPlacementLayoutOverrides[key] = startLayout;
  else delete startPlacementLayoutOverrides[key];

  const infoCell = payload.rest?.infoCell;
  if (infoCell) infoCellChoiceOverrides[key] = infoCell;
  else delete infoCellChoiceOverrides[key];

  const rawSettings = payload.rest?.settings as
    | (CdSliceSettingsPatch & LegacyCdSliceSettingsPatch)
    | undefined;
  const encoded: CdSliceSettingsPatch = rawSettings ? { ...rawSettings } : {};
  if (
    encoded.includeStartPlacement === undefined &&
    rawSettings?.includeStartPosition !== undefined
  ) {
    encoded.includeStartPlacement = rawSettings.includeStartPosition;
  }
  if (
    encoded.startPlacementLayout === undefined &&
    rawSettings?.startPositionLayout !== undefined
  ) {
    encoded.startPlacementLayout = rawSettings.startPositionLayout;
  }
  delete (encoded as LegacyCdSliceSettingsPatch).includeStartPosition;
  delete (encoded as LegacyCdSliceSettingsPatch).startPositionLayout;
  const showNotes =
    encoded.showNotes ?? DEFAULT_IMAGE_COMPOSITION_SETTINGS.showNotes;
  // `customName` is absent from the defaults, so a sender who never set one
  // leaves the key off entirely and the recipient's own name is not shown.
  const next: ImageCompositionSettings = {
    ...DEFAULT_IMAGE_COMPOSITION_SETTINGS,
    ...encoded,
    darkMode: current.darkMode,
    columnCountPreferenceVersion: current.columnCountPreferenceVersion,
    columnCountPreferenceOwner: current.columnCountPreferenceOwner,
    // Explicit Auto for the viewed length when the sender is at Auto: the
    // recipient's own numeric choice must not leak into a borrowed view.
    columnCountOverrides: {
      ...(current.columnCountOverrides ?? {}),
      [key]: payload.cols ?? null,
    },
    startPlacementLayoutOverrides,
    infoCellChoiceOverrides,
    // Derived alias, never encoded — kept consistent the way createSettings does.
    addUserInfo: showNotes,
  };
  return next;
}

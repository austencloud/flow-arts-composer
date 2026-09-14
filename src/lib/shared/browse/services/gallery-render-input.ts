/**
 * Gallery render-input builder
 *
 * Single source of truth for the ThumbnailRenderInput a gallery card produces.
 * Both PropAwareThumbnail (live cards) and the gallery-thumbnail-warmer call
 * this, so the cache key the warmer renders under is byte-identical to the key
 * a live card 404s on. Duplicating this logic in the warmer would risk the
 * key-drift / cache-poisoning class of bug the June 2026 incident was about.
 *
 * The QR / mandala / start-layout gating below MUST stay in lockstep with the
 * canonical defaults in thumbnail-key-deriver.ts (checkInputUsesDefaults) and
 * image-composition-state. See reference_thumbnail_cache_lockstep memory.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  resolveInfoCellDisplay,
  type InfoCellChoice,
} from "$lib/shared/sequence-viewer/services/info-cell-display";
import type {
  ThumbnailRenderInput,
  ThumbnailVariant,
  ThumbnailVisibilitySettings,
} from "./thumbnail-key-deriver";

/**
 * The subset of the image-composition manager the input builder reads. The live
 * card passes the real manager; the warmer passes a fixed product-defaults
 * source so it populates the SHARED (usesDefaults) cloud cache, not the admin's
 * personal settings.
 */
export interface GalleryCompositionSource {
  getStartPositionLayoutForStepCount(stepCount: number): "row" | "column";
  /**
   * Per-step-count QR/Mandala/None pick for a card with a single empty info
   * cell. The gallery grid must honor this the same way the viewer ChoreoCard
   * and the export path do — otherwise the grid ignores the user's per-length
   * choice and keeps rendering the QR-preferential default.
   */
  getInfoCellChoiceForStepCount(stepCount: number): InfoCellChoice;
  readonly showQRCode: boolean;
  readonly showMandala: boolean;
}

export interface BuildGalleryRenderInputParams {
  sequence: SequenceData;
  leftPropType?: PropType;
  rightPropType?: PropType;
  catDogModeEnabled?: boolean;
  /** Chosen hand palette. Leave unset for the shared default-color class. */
  primaryPropColors?: { left: string; right: string } | null;
  lightMode?: boolean;
  variant?: ThumbnailVariant;
  // Composition overrides (undefined = variant defaults)
  addWord?: boolean;
  addStepNumbers?: boolean;
  includeStartPosition?: boolean;
  startPositionLayout?: "row" | "column";
  addDifficultyLevel?: boolean;
  addUserInfo?: boolean;
  showNotes?: boolean;
  customNotesText?: string;
  /** Show the LOOP transform icon strip in the card header (default true) */
  showLoopGlyph?: boolean;
  // Visibility overrides
  visibility?: ThumbnailVisibilitySettings;
  handPathMode?: boolean;
  showLeftMotion?: boolean;
  showRightMotion?: boolean;
  /** Grid cards pass true; a prepared QR still needs a spare info cell. */
  allowQR?: boolean;
  cardMode?: boolean;
  // Ambient state (passed in so this function stays pure/testable)
  compositionManager: GalleryCompositionSource;
  isAuthenticated: boolean;
}

/**
 * Gallery cards may prepare a missing QR only for a signed-in reader. Guests
 * can still draw public artwork that was prepared earlier, but never trigger
 * scan-cell warming or short-code allocation while they scroll.
 */
export type GalleryQrPolicy = "background" | "prepared-only" | undefined;

export interface GalleryThumbnailRequestIdentity {
  keyHash: string;
  qrPolicy: GalleryQrPolicy;
}

export function galleryQrPolicy({
  variant = "gallery",
  cardMode,
  isAuthenticated,
}: Pick<
  BuildGalleryRenderInputParams,
  "variant" | "cardMode" | "isAuthenticated"
>): GalleryQrPolicy {
  if (variant !== "gallery" || cardMode) return undefined;
  return isAuthenticated ? "background" : "prepared-only";
}

/**
 * Authentication does not change a gallery image key, but it does change
 * whether a visible card may prepare a missing QR. Keep that scheduling state
 * beside the cache key so an auth hydration update retries the same preview.
 */
export function galleryThumbnailRequestChanged(
  current: GalleryThumbnailRequestIdentity | null,
  next: GalleryThumbnailRequestIdentity
): boolean {
  return (
    current === null ||
    current.keyHash !== next.keyHash ||
    current.qrPolicy !== next.qrPolicy
  );
}

/**
 * Beat count used for QR gating (>1 → a spare cell exists) and start-position
 * layout selection. Mirrors PropAwareThumbnail: steps length wins over the
 * stored sequenceLength; empty steps (Community sequences) fall through to it.
 */
export function galleryStepCount(sequence: SequenceData): number {
  return sequence.steps?.length || sequence.sequenceLength || 4;
}

/**
 * Runtime-generated sequences can be complete without having been named yet.
 * Their rendered cards still need a stable cache identity, otherwise the live
 * thumbnail waits forever instead of starting a render.
 */
export function deriveThumbnailSequenceName(sequence: SequenceData): string {
  return (
    sequence.word ||
    sequence.name ||
    deriveWord(sequence) ||
    sequence.id ||
    "Untitled sequence"
  );
}

/**
 * Resolve the effective visibility object for a gallery card. Always returns
 * EXPLICIT showQRCode + showMandala values (never undefined) — the renderer
 * falls back to its own hardcoded defaults on undefined, which can diverge from
 * the user's actual settings while the cache key still reads "defaults",
 * poisoning the shared cloud cache.
 */
export function buildGalleryVisibility(
  p: BuildGalleryRenderInputParams
): ThumbnailVisibilitySettings | undefined {
  const {
    visibility,
    handPathMode = false,
    showLeftMotion = true,
    showRightMotion = true,
    allowQR = true,
    variant = "gallery",
    cardMode = false,
    isAuthenticated,
    compositionManager,
  } = p;
  const stepCount = galleryStepCount(p.sequence);

  const needsMotionFilter = showLeftMotion !== true || showRightMotion !== true;
  const motionOverrides = needsMotionFilter
    ? { showLeftMotion, showRightMotion }
    : {};

  // One-count cards have no spare cell. Guests can request public prepared
  // artwork only from the gallery's prepared-only path; other card contexts
  // retain the existing authentication gate before they can generate a QR.
  const guestPreparedGallery = variant === "gallery" && !cardMode;
  const qrAllowed =
    allowQR && stepCount > 1 && (isAuthenticated || guestPreparedGallery);

  if (visibility) {
    const qrGated = qrAllowed
      ? visibility
      : { ...visibility, showQRCode: false };
    return handPathMode || needsMotionFilter || !qrAllowed
      ? {
          ...qrGated,
          ...(handPathMode && { handPathMode: true }),
          ...motionOverrides,
        }
      : qrGated;
  }

  // Route the globals through the same one-spot info-cell resolver the viewer
  // ChoreoCard and the export path use, so a per-length "mandala"/"none" pick on
  // a single-info-cell card (e.g. a 4-count) suppresses the QR-preferential
  // default. No-op on non-contended cards (multi-cell, QR already off, hidden
  // start position), which fall straight back to the globals.
  const resolved = resolveInfoCellDisplay({
    stepCount,
    // Grid cards render with the start position (the gallery default); geometry
    // must match so the info-cell count is correct.
    includeStartPosition: p.includeStartPosition ?? true,
    startPositionLayout:
      p.startPositionLayout ??
      compositionManager.getStartPositionLayoutForStepCount(stepCount),
    columnCount: null, // Gallery thumbnails always render the auto layout table.
    showQRCode: qrAllowed && compositionManager.showQRCode,
    showMandala: compositionManager.showMandala,
    infoCellChoice: compositionManager.getInfoCellChoiceForStepCount(stepCount),
    isAuthenticated: isAuthenticated || guestPreparedGallery,
  });
  // Cache-key guard: when QR still wins the single info cell, the renderer
  // reserves that cell for the QR (getMandalaPlacements → EMPTY), so the image
  // is QR-only whether or not the mandala flag is set. Keep showMandala at the
  // global there so the key stays byte-identical to the warmer's usesDefaults
  // `_qr` bake — flipping it false would drift the whole QR population off the
  // shared cloud cache (the June 2026 starvation class of bug). Only when the
  // choice suppresses QR do we honor the resolver's mandala value, which lands
  // on the warmer's no-QR (mandala) class.
  return {
    showQRCode: resolved.showQRCode,
    showMandala: resolved.showQRCode
      ? compositionManager.showMandala
      : resolved.showMandala,
    ...(handPathMode && { handPathMode: true }),
    ...motionOverrides,
  };
}

/**
 * Build the full ThumbnailRenderInput for a gallery card. Faithful extraction of
 * the logic previously inline in PropAwareThumbnail so the warmer and the live
 * card produce identical cache keys.
 */
export function buildGalleryRenderInput(
  p: BuildGalleryRenderInputParams
): ThumbnailRenderInput {
  const {
    sequence,
    leftPropType,
    rightPropType,
    catDogModeEnabled = false,
    primaryPropColors,
    lightMode = false,
    variant = "gallery",
    addWord,
    addStepNumbers,
    includeStartPosition,
    startPositionLayout,
    addDifficultyLevel,
    addUserInfo,
    showNotes,
    customNotesText,
    showLoopGlyph,
    cardMode = false,
    compositionManager,
  } = p;

  const stepCount = galleryStepCount(sequence);
  const effectiveStartPositionLayout =
    startPositionLayout ??
    compositionManager.getStartPositionLayoutForStepCount(stepCount);

  const sequenceName = deriveThumbnailSequenceName(sequence);
  return {
    sequenceName,
    sequenceId: sequence.id,
    leftPropType,
    rightPropType,
    catDogModeEnabled,
    primaryPropColors,
    lightMode,
    variant,
    loopType: sequence.loopType ?? null,
    showLoopGlyph,
    addWord,
    addStepNumbers,
    includeStartPosition,
    startPositionLayout: effectiveStartPositionLayout,
    addDifficultyLevel,
    addUserInfo,
    showNotes,
    customNotesText,
    visibility: buildGalleryVisibility(p),
    cardMode: cardMode || undefined,
  };
}

/**
 * Product-default composition source for the warm pass. Renders target the
 * SHARED (usesDefaults=true) cloud cache: row layout, mandala on. QR is driven
 * per-combo via an explicit visibility override, not this source.
 */
export const DEFAULT_GALLERY_COMPOSITION: GalleryCompositionSource = {
  getStartPositionLayoutForStepCount: () => "row",
  // QR-preferential, matching the derived default when both toggles are on. The
  // warmer passes an explicit `visibility` override so it never routes through
  // this, but the interface requires it.
  getInfoCellChoiceForStepCount: () => "qr",
  showQRCode: false,
  showMandala: true,
};

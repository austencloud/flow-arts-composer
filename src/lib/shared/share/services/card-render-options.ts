/**
 * card-render-options.ts
 *
 * Single source of truth for mapping the user's saved card settings
 * (ImageCompositionManager + VisibilityStateManager) into renderer options.
 *
 * Every card image/download/share path builds its `renderSequenceToBlob` options
 * here. The reason this exists: the card PREVIEW (ChoreoCard) and the exported
 * PNG are two separate renderers, and each caller used to hand-build a partial
 * options object — so a panel toggle could reach the preview but silently skip
 * the export (LOOP glyph, mandala, QR, grid, columns, start-layout all drifted
 * this way). Funnelling every caller through one builder makes that class of bug
 * impossible: add a toggle here once and all paths honor it.
 */

import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import {
  getStepColumnsForLayout,
  type ResolvedAutoLayout,
} from "$lib/shared/render/services/container-aware-layout";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import { resolveInfoCellDisplay } from "$lib/shared/sequence-viewer/services/info-cell-display";
import { getAuthSync } from "$lib/shared/auth/firebase";
import { toMandalaPathShape } from "$lib/shared/mandala/services/mandala-path-policy";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import {
  cardPresentationFromFooterSettings,
  resolveCardFooter,
  type CardPresentation,
} from "$lib/shared/share/domain/models/card-presentation";

export interface CardRenderOptionsInput {
  propConfig?: ResolvedPropConfig;
  /**
   * Theme. The viewer passes its export-panel value (exportOptions.imageDarkMode);
   * the share/download paths pass the composition manager's darkMode. Explicit so
   * each caller keeps its own canonical source and preview/export stay in lockstep.
   */
  darkMode: boolean;
  /**
   * Hand-path visualization (HAND props + float arrows). When true the difficulty
   * badge, LOOP glyph + its header band, TKA overlays and reversal arrows are
   * suppressed to match the on-screen hand-path card — all are meaningless for a
   * single-hand path view.
   */
  isHandPath?: boolean;
  /**
   * Winning geometry measured by the live Download Card preview. Auto has no
   * fixed shape: the compositor reuses this result so the PNG matches the card
   * the user configured.
   */
  resolvedAutoLayout?: ResolvedAutoLayout | null;
  /** Current card or one-share override. Omitted means account defaults. */
  cardPresentation?: CardPresentation;
}

/**
 * Whether the card's grid is on Auto for a sequence of this length — the user
 * has pinned no step-column count, so the shape is decided by whatever
 * container the card is drawn into.
 *
 * `buildCardRenderOptions` below always emits a CONCRETE `columnCount` and
 * `startPositionLayout`, because the compositor renders to a bare canvas with
 * no container to measure and needs the geometry handed to it. A surface that
 * has its own container must ask this FIRST: the Post Studio slot is half a
 * 9:16 frame — wider than tall — while the Card pane that resolved those
 * numbers is tall. Passing the pane's answer through pinned a 16-step card to
 * start-on-top inside a container where start-on-the-left fits a third larger.
 * On Auto, hand the live card nothing and let it re-fit; honor the pins only
 * when they really are pins.
 */
export function isCardLayoutAutomatic(stepCount: number): boolean {
  return (
    getImageCompositionManager().getColumnCountForStepCount(stepCount) === null
  );
}

/**
 * Build the complete `renderSequenceToBlob` options from the user's card settings.
 * Output excludes pure output-format concerns (stepSize/format/quality) — the
 * caller spreads those in.
 */
export function buildCardRenderOptions(
  sequence: SequenceData,
  input: CardRenderOptionsInput
): Partial<SequenceExportOptions> {
  const ic = getImageCompositionManager();
  const vm = getVisibilityStateManager();
  const stepCount = sequence.steps?.length ?? 0;
  const isHandPath = input.isHandPath ?? false;
  // One-count cards (single beat + start) have no spare cell for a QR — it would
  // land on the start position. One-count cards never carry a QR (matches the
  // canvas backstop in findEmptyCellForQR and the gallery thumbnail gate).
  const oneCount = stepCount <= 1;
  const isAuthenticated = !!getAuthSync().currentUser;
  const footer = resolveCardFooter(
    input.cardPresentation ??
      sequence.cardPresentation ??
      cardPresentationFromFooterSettings(ic.showNotes, ic.customNotesText)
  );

  // Auto owns both axes: it chooses the total grid columns and whether the start
  // consumes a row or a column. The live Download Card preview evaluates the
  // container; the export path consumes that exact winner.
  const stepColumns = ic.getColumnCountForStepCount(stepCount);
  const automaticLayout =
    stepColumns === null && input.resolvedAutoLayout?.stepCount === stepCount
      ? input.resolvedAutoLayout
      : null;
  const startPositionLayout =
    automaticLayout && automaticLayout.startPlacement !== "none"
      ? automaticLayout.startPlacement
      : ic.getStartPositionLayoutForStepCount(stepCount);

  const columnCount =
    stepColumns != null
      ? stepColumns +
        (ic.includeStartPosition && startPositionLayout === "column" ? 1 : 0)
      : automaticLayout
        ? automaticLayout.cols
        : undefined;
  const infoCellStepColumns =
    stepColumns ??
    (automaticLayout ? getStepColumnsForLayout(automaticLayout) : null);

  // One-spot info-cell resolution: a card with a single empty info cell + both QR
  // and mandala on routes through the user's per-length choice. No-op otherwise,
  // so multi-cell cards keep both. oneCount already forces QR off (no spare cell).
  const effectiveInfoCell = resolveInfoCellDisplay({
    stepCount,
    includeStartPosition: ic.includeStartPosition,
    startPositionLayout,
    columnCount: infoCellStepColumns,
    showQRCode: oneCount ? false : ic.showQRCode,
    showMandala: ic.showMandala,
    infoCellChoice: ic.getInfoCellChoiceForStepCount(stepCount),
    isAuthenticated,
  });

  const props =
    input.propConfig ?? resolveViewingProps(getSettings(), sequence).config;
  return {
    ...(!isHandPath && {
      leftPropTypeOverride: props.leftPropType,
      rightPropTypeOverride: props.rightPropType,
    }),
    includeStartPosition: ic.includeStartPosition,
    startPositionLayout,
    columnCount,
    addStepNumbers: ic.addStepNumbers,
    addWord: ic.addWord,
    addDifficultyLevel: isHandPath ? false : ic.addDifficultyLevel,
    showLoopGlyph: isHandPath ? false : ic.showLoopGlyph,
    addUserInfo: footer.show,
    showNotes: footer.show,
    customNotesText: footer.text,
    notes: footer.text,
    addReversalSymbols: !isHandPath,
    // Whatever the animation is currently drawing, the exported card draws
    // too — see toMandalaPathShape.
    mandalaPathShape: toMandalaPathShape(
      getAnimationVisibilityManager().getPathPolicy()
    ),
    visibilityOverrides: {
      primaryPropColors: getSettings().primaryPropColors ?? null,
      darkMode: input.darkMode,
      showQRCode: effectiveInfoCell.showQRCode,
      showGrid: vm.getGridVisibility(),
      showMandala: effectiveInfoCell.showMandala,
      handPathMode: isHandPath,
      // Match the preview's hand-path overlay suppression. Left undefined for
      // normal cards so the composer inherits TKA/reversal visibility from the
      // global VisibilityStateManager.
      ...(isHandPath ? { showTKA: false, showReversals: false } : {}),
    },
  };
}

/**
 * build-front-compose-options
 *
 * Single source of truth for the card-FRONT compose options + frame geometry.
 * `PrintCardRenderer.renderFront`, the composition worker (via the parity
 * harness), and any future print path all call this one builder, so the
 * main-thread and worker renders are byte-identical by construction instead of
 * by hand-mirrored option objects (which drift).
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { PrintRenderOptions } from "./types";
import { buildCanonicalCardVisibility } from "../domain/canonical-card-visibility";
import { getCardFrameContentInset } from "./card-front-frame";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// MPC poker card defaults (822x1122 at 300 DPI with 36px bleed).
const MPC_WIDTH = 822;
const MPC_HEIGHT = 1122;
const MPC_BLEED = 36;

/** Concrete frame geometry/colors for `wrapContentInCardFrame`. */
export interface FrontCardFrame {
  canvasWidth: number;
  canvasHeight: number;
  bleedPx: number;
  accent: string;
  dark: string;
  palette?: readonly string[];
}

export interface FrontComposeResult {
  composeOptions: Partial<SequenceExportOptions>;
  frame: FrontCardFrame;
}

/**
 * Build the front compose options + frame from a sequence and its print
 * options.
 */
export function buildFrontComposeOptions(
  sequence: SequenceData,
  options: PrintRenderOptions
): FrontComposeResult {
  const canvasW = options.canvasWidth ?? MPC_WIDTH;
  const canvasH = options.canvasHeight ?? MPC_HEIGHT;
  const bleed = options.bleedPx ?? MPC_BLEED;
  // Border (colored frame) is thicker than the bleed so it stays visible after
  // an imprecise cut. Content insets by `border`, not `bleed`.
  const border = getCardFrameContentInset(bleed);
  const contentW = canvasW - border * 2;
  const contentH = canvasH - border * 2;

  const accent =
    options.frontFrameColors?.accent ??
    options.tndElement?.accentColor ??
    "#999999";
  const dark =
    options.frontFrameColors?.dark ??
    options.tndElement?.darkComplement ??
    "#444444";

  // Source word + pictograph visibility from the canonical locked profile.
  const canonical = buildCanonicalCardVisibility({
    tndElement: options.tndElement,
    leftPropType: options.leftPropType,
    rightPropType: options.rightPropType,
  });
  const isHandPath = options.cardProfile === "hand-path";

  const composeOptions: Partial<SequenceExportOptions> = {
    deckCard: { contentWidth: contentW, contentHeight: contentH },
    includeStartPlacement: options.includeStartPlacement,
    startPlacementLayout: options.startPlacementLayout ?? "row",
    ...(options.totalGridColumns !== undefined && {
      columnCount: options.totalGridColumns,
    }),
    // Four-step TnD cards devote a full lane to the centered Start and QR
    // cells. The usual pictograph-label compensation pushes that mixed grid
    // visibly right, so these cards keep equal physical gutters instead.
    ...(options.tndElement && { gridCentering: "geometric" as const }),
    addStepNumbers: true,
    addWord: isHandPath ? true : canonical.addWord,
    customName: options.customName,
    renderWordAsText: isHandPath,
    addDifficultyLevel: !isHandPath,
    stepSize: 300,
    stepScale: 1,
    margin: 0,
    format: "PNG",
    quality: 1,
    scale: 1,
    rightVisible: true,
    leftVisible: true,
    addReversalSymbols: !isHandPath,
    combinedGrids: false,
    notes: options.notes ?? "",
    showNotes: !!(
      options.notes ||
      options.leftLabel ||
      options.rightLabel ||
      options.iconPath
    ),
    leftLabel: options.leftLabel,
    rightLabel: options.rightLabel,
    iconPath: options.iconPath,
    accentColor: options.tndElement?.accentColor,
    accentTintOpacity: options.tndElement?.cardTintOpacity,
    loopType: sequence.loopType ?? undefined,
    showLoopGlyph: !isHandPath,
    ...(isHandPath
      ? {
          leftPropTypeOverride: PropType.HAND,
          rightPropTypeOverride: PropType.HAND,
        }
      : {
          ...(options.leftPropType && {
            leftPropTypeOverride: options.leftPropType,
          }),
          ...(options.rightPropType && {
            rightPropTypeOverride: options.rightPropType,
          }),
        }),
    ...(options.deckId && { deckId: options.deckId }),
    ...(options.deckName && { deckName: options.deckName }),
    visibilityOverrides: {
      ...canonical.visibilityOverrides,
      // showMandala stays deck-config (mandala fills in empty cells).
      showMandala: options.showMandala ?? false,
      // Explicit QR override (shop preview fan drops it); unset = canonical.
      ...(options.showQRCode !== undefined && {
        showQRCode: options.showQRCode,
      }),
      ...(isHandPath && {
        leftPropType: PropType.HAND,
        rightPropType: PropType.HAND,
        handPathMode: true,
        showTKA: false,
        showReversals: false,
        showQRCode: options.showQRCode ?? true,
        showMandala: false,
      }),
    },
  };

  return {
    composeOptions,
    frame: {
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      bleedPx: bleed,
      accent,
      dark,
      ...(options.frontFrameColors?.palette && {
        palette: options.frontFrameColors.palette,
      }),
    },
  };
}

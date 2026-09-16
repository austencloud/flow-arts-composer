import {
  TND_BY_FAMILY,
  resolveSequenceElementFramePalette,
} from "../domain/tnd-element";
import { getCatalogLayoutPolicy } from "../domain/catalog-layout-policy";
import type { FestivalSamplerCardManifest } from "./festival-sampler-manifest";
import type { PrintRenderOptions } from "./types";
import { getCardFrameContentInset } from "./card-front-frame";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { pickBestFitLayout } from "$lib/shared/render/services/container-aware-layout";

export const FESTIVAL_SAMPLER_NAME = "Festival Sampler 2026";

const CARD_CANVAS_WIDTH = 822;
const CARD_CANVAS_HEIGHT = 1122;
const CARD_BLEED = 36;
const THEME = "rainbow";
const ELEMENT_NEUTRAL_PALETTE = ["#111111", "#ffffff"] as const;

export function buildFestivalSamplerRenderOptions(
  card: FestivalSamplerCardManifest,
  sequence: SequenceData
): PrintRenderOptions {
  const element = card.familyId ? TND_BY_FAMILY[card.familyId] : undefined;
  const center = element
    ? `${element.name} · ${element.element} · ${card.ratio}`
    : FESTIVAL_SAMPLER_NAME;

  const frameInset = getCardFrameContentInset(CARD_BLEED);
  const layout = pickBestFitLayout({
    stepCount: sequence.steps.length,
    stepDurations: sequence.steps.map((step) => step.duration ?? 1),
    includeStartPlacement: true,
    containerWidth: CARD_CANVAS_WIDTH - frameInset * 2,
    containerHeight: CARD_CANVAS_HEIGHT - frameInset * 2,
    showHeader: true,
    showFooter: true,
    showQRCode: true,
  });
  const startPlacementLayout =
    layout?.startPlacement === "row" || layout?.startPlacement === "column"
      ? layout.startPlacement
      : getCatalogLayoutPolicy(sequence.steps.length);

  let frontFrameColors: PrintRenderOptions["frontFrameColors"];
  if (!element) {
    const elementalPalette = resolveSequenceElementFramePalette(sequence);
    // Type 2-only cards have no TnD element by definition. Keep them visibly
    // neutral with ink-and-paper bands instead of inventing an element or
    // returning to the old gray frame.
    const palette =
      elementalPalette.length > 0 ? elementalPalette : ELEMENT_NEUTRAL_PALETTE;
    frontFrameColors = {
      accent: palette[0]!,
      dark: palette[1] ?? palette[0]!,
      palette,
    };
  }

  return {
    canvasWidth: CARD_CANVAS_WIDTH,
    canvasHeight: CARD_CANVAS_HEIGHT,
    bleedPx: CARD_BLEED,
    includeStartPlacement: true,
    startPlacementLayout,
    ...(layout && { totalGridColumns: layout.cols }),
    showMandala: true,
    showQRCode: true,
    theme: THEME,
    tndElement: element,
    ...(frontFrameColors && { frontFrameColors }),
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    leftLabel: element?.element,
    rightLabel: element
      ? card.turnIntensity === 0
        ? "no turns"
        : `${card.turnIntensity} turn`
      : undefined,
    notes: center,
    iconPath: element?.iconPath,
    deckId: "festival-sampler-2026",
    deckName: FESTIVAL_SAMPLER_NAME,
  };
}

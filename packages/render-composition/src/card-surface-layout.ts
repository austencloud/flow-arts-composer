import {
  calculateHeaderHeight,
  calculateFooterHeight,
  CARD_FRONT_INDICATOR_SIZE_SCALE,
} from "./dimensions.js";

export interface CardSurfaceOptions {
  columns: number;
  rows: number;
  cellSize: number;
  showHeader: boolean;
  showFooter: boolean;
  deckCard?: { contentWidth: number; contentHeight: number };
  gridCentering?: "optical" | "geometric";
}

/** The same content geometry is used by browser exports and portable MCP cards. */
export function calculateCardSurface(options: CardSurfaceOptions) {
  const { columns, rows, deckCard } = options;
  const headerHeight = options.showHeader
    ? deckCard
      ? Math.floor(deckCard.contentWidth * 0.133)
      : calculateHeaderHeight(options.cellSize, columns)
    : 0;
  const footerHeight = options.showFooter
    ? deckCard
      ? Math.floor(deckCard.contentWidth * 0.067)
      : calculateFooterHeight(options.cellSize, columns)
    : 0;
  const cellSize = deckCard
    ? Math.floor(
        Math.min(
          deckCard.contentWidth / columns,
          (deckCard.contentHeight - headerHeight - footerHeight) / rows
        )
      )
    : options.cellSize;
  const width = deckCard?.contentWidth ?? columns * cellSize;
  const height =
    deckCard?.contentHeight ?? rows * cellSize + headerHeight + footerHeight;
  // Cell annotations sit further left than the prop ink. Printed cards compensate
  // for that difference unless their mixed Start/QR lane requires equal gutters.
  const opticalShift =
    deckCard && options.gridCentering !== "geometric"
      ? Math.round((((175 - 50) / 950) * cellSize) / 2)
      : 0;
  return {
    width,
    height,
    cellSize,
    headerHeight,
    footerHeight,
    gridStartX: deckCard
      ? Math.floor((width - columns * cellSize) / 2) + opticalShift
      : 0,
    gridStartY: deckCard
      ? headerHeight +
        Math.floor((height - headerHeight - footerHeight - rows * cellSize) / 2)
      : headerHeight,
    indicatorSizeScale: deckCard ? CARD_FRONT_INDICATOR_SIZE_SCALE : undefined,
  };
}

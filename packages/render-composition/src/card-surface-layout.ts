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
  // Printed cards keep equal left and right gutters. An earlier optical shift
  // nudged the grid right to balance cell annotations, but on a card with
  // accent side bands the unequal gutters read as a misprint.
  return {
    width,
    height,
    cellSize,
    headerHeight,
    footerHeight,
    gridStartX: deckCard ? Math.floor((width - columns * cellSize) / 2) : 0,
    gridStartY: deckCard
      ? headerHeight +
        Math.floor((height - headerHeight - footerHeight - rows * cellSize) / 2)
      : headerHeight,
    indicatorSizeScale: deckCard ? CARD_FRONT_INDICATOR_SIZE_SCALE : undefined,
  };
}

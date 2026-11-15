import type { ChoreoCardCell } from "./choreo-card-render-engine";

export interface CardLoadingPresentationInput {
  isLoading: boolean;
  isRefreshing: boolean;
  cells: readonly Pick<ChoreoCardCell, "isLoaded" | "renderFailed" | "live">[];
  exportPresentation: boolean;
  /**
   * The preview stack's own reveal condition holds: it has a contained box and
   * a cell width (or scrolls), so its inline `visibility: hidden` is off. The
   * render engine holds the cell width back for the whole first batch, so this
   * is what keeps the card unseen until every cell is in.
   */
  stackVisible: boolean;
  /** The card has been on screen before (latched by the caller from `seen`). */
  seenBefore: boolean;
  /** The card's first render has ended at least once. */
  firstRenderEnded: boolean;
}

export interface CardLoadingPresentation {
  /** Nothing has been seen yet: the card's loading state holds its slot. */
  loading: boolean;
  /** A redraw over a card the visitor has already seen. */
  refreshing: boolean;
  /** The card is on screen now, or has been. The caller latches it. */
  seen: boolean;
}

/**
 * Which waiting state the card shows.
 *
 * A first render fills `cells` with empty placeholders before any picture
 * arrives, and keeps the whole stack hidden until the batch is in, so neither
 * "there are cells" nor "one cell loaded" means the card is on screen. Read
 * either way, a cold scan showed "Updating" over an empty card. The loading
 * state holds the slot until the frame the stack itself becomes visible with
 * a picture in it; "Updating" is only for a redraw after that, once the first
 * render has ended. After the first reveal the loading state never returns,
 * so a later redraw that briefly re-measures the box keeps "Updating".
 * A live cell draws itself, and a failed cell shows its failure, so both count
 * as a picture.
 */
export function resolveCardLoadingPresentation(
  input: CardLoadingPresentationInput
): CardLoadingPresentation {
  const hasCells = input.cells.length > 0;
  const hasPicture = input.cells.some(
    (cell) => cell.isLoaded || cell.renderFailed === true || cell.live != null
  );
  const seen = input.seenBefore || (hasCells && input.stackVisible && hasPicture);
  return {
    loading:
      (input.isLoading && !hasCells) ||
      (!input.exportPresentation && hasCells && !seen),
    refreshing:
      !input.exportPresentation &&
      input.isRefreshing &&
      seen &&
      input.firstRenderEnded,
    seen,
  };
}

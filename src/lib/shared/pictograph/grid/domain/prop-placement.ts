import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface PropPlacementChange {
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  activeHand: HandSide | null;
  complete: boolean;
  /** Whether there is a previous placement to step back to. A host that renders
   *  the move/undo controls itself (see `renderTray`) needs this to know when to
   *  offer Undo; the grid's own history is not otherwise visible from outside. */
  canUndo: boolean;
}

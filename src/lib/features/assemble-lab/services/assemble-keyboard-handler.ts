import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export interface KeyboardContext {
  gridMode: GridMode;
  showCenter: boolean;
  isModalOpen: boolean;
  isInputFocused: boolean;
}

export type KeyboardAction =
  | { type: "position"; location: GridLocation }
  | { type: "turnUp" }
  | { type: "turnDown" }
  | { type: "toggleRotation" }
  | { type: "cycleOrientation" }
  | { type: "switchHand" }
  | { type: "undo" }
  | { type: "finish" };

export interface AssembleNumpadPosition {
  readonly code: string;
  readonly key: string;
  readonly label: string;
  readonly location: GridLocation;
}

/** The visible numpad map and keyboard parser share this single layout. */
export const ASSEMBLE_NUMPAD_POSITIONS: readonly AssembleNumpadPosition[] = [
  { code: "Numpad7", key: "7", label: "NW", location: GridLocation.NORTHWEST },
  { code: "Numpad8", key: "8", label: "N", location: GridLocation.NORTH },
  { code: "Numpad9", key: "9", label: "NE", location: GridLocation.NORTHEAST },
  { code: "Numpad4", key: "4", label: "W", location: GridLocation.WEST },
  { code: "Numpad5", key: "5", label: "Center", location: GridLocation.CENTER },
  { code: "Numpad6", key: "6", label: "E", location: GridLocation.EAST },
  { code: "Numpad1", key: "1", label: "SW", location: GridLocation.SOUTHWEST },
  { code: "Numpad2", key: "2", label: "S", location: GridLocation.SOUTH },
  { code: "Numpad3", key: "3", label: "SE", location: GridLocation.SOUTHEAST },
] as const;

const NUMPAD_TO_LOCATION = new Map(
  ASSEMBLE_NUMPAD_POSITIONS.map(({ code, location }) => [code, location])
);

const CARDINAL: Set<GridLocation> = new Set([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const INTERCARDINAL: Set<GridLocation> = new Set([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);

export function isAssembleKeyboardLocationAvailable(
  location: GridLocation,
  mode: GridMode,
  showCenter: boolean
): boolean {
  if (location === GridLocation.CENTER) return showCenter;
  switch (mode) {
    case GridMode.DIAMOND:
      return CARDINAL.has(location);
    case GridMode.BOX:
      return INTERCARDINAL.has(location);
    case GridMode.SKEWED:
      return true;
    default:
      return true;
  }
}

export function handleAssembleKeyDown(
  e: KeyboardEvent,
  context: KeyboardContext
): KeyboardAction | null {
  if (context.isInputFocused || context.isModalOpen) return null;

  const location = NUMPAD_TO_LOCATION.get(e.code);
  if (location !== undefined) {
    if (
      !isAssembleKeyboardLocationAvailable(
        location,
        context.gridMode,
        context.showCenter
      )
    )
      return null;
    return { type: "position", location };
  }

  switch (e.code) {
    case "NumpadAdd":
      return { type: "turnUp" };
    case "NumpadSubtract":
      return { type: "turnDown" };
    case "NumpadMultiply":
      return { type: "toggleRotation" };
    case "NumpadDivide":
      return { type: "cycleOrientation" };
    case "Numpad0":
      return { type: "switchHand" };
    case "NumpadDecimal":
      return { type: "undo" };
    case "NumpadEnter":
      return { type: "finish" };
    default:
      return null;
  }
}

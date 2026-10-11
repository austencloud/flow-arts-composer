import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { normalizeOrientationForLocation } from "#lib/shared/pictograph/grid/domain/orientation-from-drag.js";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  cloneStartPoses,
  handLabel,
  type AssembleDocumentState,
} from "./assemble-document-state.svelte";
import type { AssembleHistoryController } from "./assemble-history-controller";
import type { BuilderStartPose } from "./assemble-state-types";

export interface AssembleSettingsController {
  reset(): void;
  setStartPoses(poses: Record<HandSide, BuilderStartPose>): void;
  setRotationDirection(direction: RotationDirection): void;
  setTurnCount(turns: number): void;
  setOrientation(orientation: Orientation): void;
  setGridMode(mode: GridMode): void;
  setShowCenter(show: boolean): void;
  toggleKeyboardMode(): void;
}

export function createAssembleSettingsController(
  document: AssembleDocumentState,
  history: AssembleHistoryController,
  cancelPendingAction: () => void
): AssembleSettingsController {
  let arrowTimeout: ReturnType<typeof setTimeout> | null = null;

  function reset(): void {
    const hasContent =
      document.leftSteps.length > 0 ||
      document.rightSteps.length > 0 ||
      Object.keys(document.startPoses).length > 0;
    if (!hasContent) return;
    const before = history.takeSnapshot();
    cancelPendingAction();
    document.phase = "idle";
    document.activeHand = HandSide.LEFT;
    document.leftSteps = [];
    document.rightSteps = [];
    document.startPoses = {};
    document.currentPosition = null;
    document.currentOrientation = Orientation.IN;
    document.rotationDirection = RotationDirection.CLOCKWISE;
    document.turnCount = 0;
    document.gridMode = GridMode.DIAMOND;
    document.showCenter = false;
    document.selectedStepIndex = null;
    document.stepEditMode = null;
    history.notifyDocumentChange();
    history.recordSnapshot("Clear sequence", before);
  }

  function setStartPoses(poses: Record<HandSide, BuilderStartPose>): void {
    if (
      document.phase === "animating" ||
      document.phase === "complete" ||
      document.leftSteps.length > 0 ||
      document.rightSteps.length > 0
    ) {
      return;
    }

    const left = poses[HandSide.LEFT];
    const right = poses[HandSide.RIGHT];
    if (
      !left ||
      !right ||
      !isLocationValidForMode(
        left.location,
        document.gridMode,
        document.showCenter
      ) ||
      !isLocationValidForMode(
        right.location,
        document.gridMode,
        document.showCenter
      )
    ) {
      return;
    }

    const nextPoses: Record<HandSide, BuilderStartPose> = {
      [HandSide.LEFT]: {
        location: left.location,
        orientation: normalizeOrientationForLocation(
          left.orientation,
          left.location
        ),
      },
      [HandSide.RIGHT]: {
        location: right.location,
        orientation: normalizeOrientationForLocation(
          right.orientation,
          right.location
        ),
      },
    };
    if (JSON.stringify(document.startPoses) === JSON.stringify(nextPoses)) {
      return;
    }

    const before = history.takeSnapshot();
    document.startPoses = nextPoses;
    document.activeHand = HandSide.LEFT;
    document.currentPosition = nextPoses[HandSide.LEFT].location;
    document.currentOrientation = nextPoses[HandSide.LEFT].orientation;
    document.phase = "placing";
    document.selectedStepIndex = null;
    document.stepEditMode = null;
    document.showOrientationArrow = false;
    history.notifyDocumentChange();
    history.recordSnapshot("Set start position", before);
  }

  function setRotationDirection(direction: RotationDirection): void {
    document.rotationDirection = direction;
  }

  function setTurnCount(turns: number): void {
    document.turnCount = turns;
  }

  function setOrientation(orientation: Orientation): void {
    let nextOrientation = orientation;
    if (document.currentPosition === GridLocation.CENTER) {
      const radialToCenterAtNorth: Record<string, Orientation> = {
        [Orientation.IN]: Orientation.CENTER_S,
        [Orientation.OUT]: Orientation.CENTER_N,
        [Orientation.CLOCK]: Orientation.CENTER_E,
        [Orientation.COUNTER]: Orientation.CENTER_W,
      };
      nextOrientation =
        radialToCenterAtNorth[nextOrientation] ?? nextOrientation;
    }
    if (nextOrientation === document.currentOrientation) return;

    const before = history.takeSnapshot();
    document.currentOrientation = nextOrientation;
    if (document.phase === "placing" && document.currentPosition !== null) {
      document.startPoses = {
        ...document.startPoses,
        [document.activeHand]: {
          location: document.currentPosition,
          orientation: nextOrientation,
        },
      };
    }

    if (document.currentPosition !== null) {
      document.arrowOrientation = nextOrientation;
      document.showOrientationArrow = true;
      if (arrowTimeout) clearTimeout(arrowTimeout);
      arrowTimeout = setTimeout(() => {
        document.showOrientationArrow = false;
        arrowTimeout = null;
      }, 1000);
    }
    if (document.phase === "placing") {
      history.notifyDocumentChange();
      history.recordSnapshot(
        `Turn ${handLabel(document.activeHand)} start`,
        before
      );
    }
  }

  function setGridMode(mode: GridMode): void {
    if (mode === document.gridMode || !document.canChangeGridMode) return;
    const before =
      Object.keys(document.startPoses).length > 0
        ? history.takeSnapshot()
        : null;
    const nextPoses = cloneStartPoses(document.startPoses);
    for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
      const pose = nextPoses[hand];
      if (
        pose &&
        !isLocationValidForMode(pose.location, mode, document.showCenter)
      ) {
        delete nextPoses[hand];
      }
    }
    document.startPoses = nextPoses;
    document.gridMode = mode;
    document.syncActiveCursor();
    history.notifyDocumentChange();
    if (before) history.recordSnapshot("Change grid", before);
  }

  function setShowCenter(show: boolean): void {
    if (show === document.showCenter || !document.canChangeGridMode) return;
    const before =
      Object.keys(document.startPoses).length > 0
        ? history.takeSnapshot()
        : null;
    if (!show) {
      const nextPoses = cloneStartPoses(document.startPoses);
      for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
        if (nextPoses[hand]?.location === GridLocation.CENTER) {
          delete nextPoses[hand];
        }
      }
      document.startPoses = nextPoses;
    }
    document.showCenter = show;
    document.syncActiveCursor();
    history.notifyDocumentChange();
    if (before) {
      history.recordSnapshot(
        show ? "Show center point" : "Hide center point",
        before
      );
    }
  }

  function toggleKeyboardMode(): void {
    document.keyboardMode = !document.keyboardMode;
  }

  return {
    reset,
    setStartPoses,
    setRotationDirection,
    setTurnCount,
    setOrientation,
    setGridMode,
    setShowCenter,
    toggleKeyboardMode,
  };
}

function isLocationValidForMode(
  location: GridLocation,
  mode: GridMode,
  centerEnabled: boolean
): boolean {
  if (location === GridLocation.CENTER) return centerEnabled;
  const cardinal: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];
  const intercardinal: GridLocation[] = [
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];
  switch (mode) {
    case GridMode.DIAMOND:
      return cardinal.includes(location);
    case GridMode.BOX:
      return intercardinal.includes(location);
    case GridMode.SKEWED:
      return cardinal.includes(location) || intercardinal.includes(location);
    default:
      return true;
  }
}

import { untrack } from "svelte";
import type { GridLocation, GridMode } from "../domain/enums/grid-enums";
import type { PropPlacementChange } from "../domain/prop-placement";
import type { PlacementGridPoint } from "../services/placement-grid-points";
import {
  HandSide,
  type Orientation,
} from "../../shared/domain/enums/pictograph-enums";
import { normalizeOrientationForLocation } from "../domain/orientation-from-drag";

interface PlacementSnapshot {
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  activeHand: HandSide | null;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
}

interface PropPlacementStateInputs {
  getGridMode: () => GridMode;
  getShowCenter: () => boolean;
  getInitialLeftLocation: () => GridLocation | null;
  getInitialRightLocation: () => GridLocation | null;
  getResetEpoch: () => number;
  getDisabled: () => boolean;
  getEditAfterCompletion: () => boolean;
  getShowUndo: () => boolean;
  getAllowUndoAfterComplete: () => boolean;
  getLeftOrientation: () => Orientation;
  getRightOrientation: () => Orientation;
  getLeftNoun: () => string;
  getRightNoun: () => string;
  getActivePoints: () => PlacementGridPoint[];
  /** "left" keeps one blue hand, "right" one red hand; the other is never asked for. */
  getHands?: () => "both" | "left" | "right";
  /** A one-hand grid moves its hand to any point pressed, without picking it up first. */
  getTapToMove?: () => boolean;
  /** A press picks a point for the hand (onPick) and leaves the hand where it is. */
  getPickOnly?: () => boolean;
}

interface PropPlacementStateDependencies {
  triggerHaptic: () => void;
  onPick?: (hand: HandSide, location: GridLocation) => void;
  onChange: (change: PropPlacementChange) => void;
  onPlacementComplete: (
    leftLocation: GridLocation,
    rightLocation: GridLocation
  ) => void;
  onOrientationChange: (color: HandSide, orientation: Orientation) => void;
}

function buildInitializationKey(inputs: PropPlacementStateInputs): string {
  return `${inputs.getGridMode()}:${inputs.getShowCenter()}:${inputs.getInitialLeftLocation() ?? ""}:${inputs.getInitialRightLocation() ?? ""}:${inputs.getResetEpoch()}:${inputs.getHands?.() ?? "both"}`;
}

export type PropPlacementState = ReturnType<typeof createPropPlacementState>;

export function createPropPlacementState(
  inputs: PropPlacementStateInputs,
  dependencies: PropPlacementStateDependencies
) {
  const leftOnly = () => inputs.getHands?.() === "left";
  const rightOnly = () => inputs.getHands?.() === "right";

  function initialActiveHand(): HandSide | null {
    if (rightOnly())
      return inputs.getInitialRightLocation() ? null : HandSide.RIGHT;
    if (!inputs.getInitialLeftLocation()) return HandSide.LEFT;
    if (leftOnly() || inputs.getInitialRightLocation()) return null;
    return HandSide.RIGHT;
  }

  let leftLocation = $state<GridLocation | null>(
    inputs.getInitialLeftLocation()
  );
  let rightLocation = $state<GridLocation | null>(
    inputs.getInitialRightLocation()
  );
  let activeHand = $state<HandSide | null>(initialActiveHand());
  let history = $state<PlacementSnapshot[]>([]);
  let liveAnnouncement = $state("");
  let initializationKey = buildInitializationKey(inputs);

  function isComplete(): boolean {
    if (rightOnly()) return rightLocation !== null;
    return leftLocation !== null && (leftOnly() || rightLocation !== null);
  }

  function changeCanUndo(): boolean {
    return (
      !inputs.getDisabled() &&
      history.length > 0 &&
      (inputs.getAllowUndoAfterComplete() || !isComplete())
    );
  }

  function publishChange(placedHand: HandSide | null = null): void {
    dependencies.onChange({
      leftLocation,
      rightLocation,
      activeHand,
      placedHand,
      complete: isComplete(),
      canUndo: changeCanUndo(),
    });

    if (leftLocation && rightLocation) {
      dependencies.onPlacementComplete(leftLocation, rightLocation);
    }
  }

  function committedOrientationFor(color: HandSide): Orientation {
    return color === HandSide.LEFT
      ? inputs.getLeftOrientation()
      : inputs.getRightOrientation();
  }

  function pushHistory(): void {
    history = [
      ...history,
      {
        leftLocation,
        rightLocation,
        activeHand,
        leftOrientation: leftLocation
          ? normalizeOrientationForLocation(
              inputs.getLeftOrientation(),
              leftLocation
            )
          : inputs.getLeftOrientation(),
        rightOrientation: rightLocation
          ? normalizeOrientationForLocation(
              inputs.getRightOrientation(),
              rightLocation
            )
          : inputs.getRightOrientation(),
      },
    ];
  }

  function normalizePlacedOrientation(
    color: HandSide,
    location: GridLocation
  ): void {
    const current = committedOrientationFor(color);
    const normalized = normalizeOrientationForLocation(current, location);
    if (normalized !== current) {
      dependencies.onOrientationChange(color, normalized);
    }
  }

  function labelForLocation(location: GridLocation | null): string {
    return (
      inputs.getActivePoints().find((point) => point.location === location)
        ?.label ?? "unknown point"
    );
  }

  function selectPoint(
    location: GridLocation,
    color: HandSide | null = activeHand
  ): void {
    if (inputs.getDisabled() || color === null) return;
    if (color === HandSide.RIGHT && leftOnly()) return;
    if (color === HandSide.LEFT && rightOnly()) return;

    const label = labelForLocation(location);
    if (inputs.getPickOnly?.()) {
      const noun =
        color === HandSide.LEFT ? inputs.getLeftNoun() : inputs.getRightNoun();
      dependencies.triggerHaptic();
      liveAnnouncement = `${noun}: ${label} picked.`;
      dependencies.onPick?.(color, location);
      return;
    }
    pushHistory();
    normalizePlacedOrientation(color, location);

    if (color === HandSide.LEFT) {
      const previous = leftLocation;
      leftLocation = location;
      activeHand =
        rightLocation === null && !leftOnly() ? HandSide.RIGHT : null;
      dependencies.triggerHaptic();
      liveAnnouncement = leftOnly()
        ? `${inputs.getLeftNoun()} ${previous === null ? "placed at" : "moved to"} ${label}.`
        : rightLocation === null
          ? `${inputs.getLeftNoun()} placed at ${label}. Place the ${inputs.getRightNoun()}.`
          : `${inputs.getLeftNoun()} moved to ${label}. Position ready.`;
    } else {
      const previous = rightLocation;
      rightLocation = location;
      activeHand = leftLocation === null && !rightOnly() ? HandSide.LEFT : null;
      dependencies.triggerHaptic();
      liveAnnouncement = rightOnly()
        ? `${inputs.getRightNoun()} ${previous === null ? "placed at" : "moved to"} ${label}.`
        : leftLocation === null
          ? `${inputs.getRightNoun()} placed at ${label}. Place the ${inputs.getLeftNoun()}.`
          : `${inputs.getRightNoun()} placed at ${label}. ${inputs.getLeftNoun()} at ${labelForLocation(leftLocation)}, ${inputs.getRightNoun()} at ${label}. Position ready.`;
    }

    publishChange(color);
  }

  function edit(color: HandSide): void {
    if (inputs.getDisabled() || !inputs.getEditAfterCompletion()) return;
    activeHand = color;
    const noun =
      color === HandSide.LEFT ? inputs.getLeftNoun() : inputs.getRightNoun();
    liveAnnouncement = `Choose a new location for the ${noun}.`;
    dependencies.triggerHaptic();
    publishChange();
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;

    leftLocation = previous.leftLocation;
    rightLocation = previous.rightLocation;
    activeHand = previous.activeHand;
    history = history.slice(0, -1);
    if (inputs.getLeftOrientation() !== previous.leftOrientation) {
      dependencies.onOrientationChange(HandSide.LEFT, previous.leftOrientation);
    }
    if (inputs.getRightOrientation() !== previous.rightOrientation) {
      dependencies.onOrientationChange(
        HandSide.RIGHT,
        previous.rightOrientation
      );
    }
    dependencies.triggerHaptic();
    liveAnnouncement =
      activeHand === HandSide.RIGHT
        ? `${inputs.getLeftNoun()} placement restored. Place the ${inputs.getRightNoun()}.`
        : activeHand === HandSide.LEFT
          ? `Place the ${inputs.getLeftNoun()}.`
          : "Previous position restored.";
    publishChange();
  }

  function reset(): void {
    leftLocation = null;
    rightLocation = null;
    activeHand = rightOnly() ? HandSide.RIGHT : HandSide.LEFT;
    history = [];
    liveAnnouncement = "";
    publishChange();
  }

  function synchronizeInputs(): void {
    const nextInitializationKey = buildInitializationKey(inputs);
    if (nextInitializationKey === initializationKey) return;

    untrack(() => {
      initializationKey = nextInitializationKey;
      leftLocation = inputs.getInitialLeftLocation();
      rightLocation = inputs.getInitialRightLocation();
      activeHand = initialActiveHand();
      history = [];
      liveAnnouncement = "";
    });
  }

  return {
    get leftLocation() {
      return leftLocation;
    },
    get rightLocation() {
      return rightLocation;
    },
    get activeHand() {
      return activeHand;
    },
    get isComplete() {
      return isComplete();
    },
    get canPlace() {
      return !inputs.getDisabled() && activeHand !== null;
    },
    get canEdit() {
      return !inputs.getDisabled() && inputs.getEditAfterCompletion();
    },
    get canUndo() {
      return inputs.getShowUndo() && changeCanUndo();
    },
    /** The hand a press on any point moves there now; null when presses pick up or place as usual. */
    get tapHand(): HandSide | null {
      if (!inputs.getTapToMove?.() || activeHand !== null || !isComplete())
        return null;
      if (inputs.getDisabled() || !inputs.getEditAfterCompletion()) return null;
      if (leftOnly()) return HandSide.LEFT;
      if (rightOnly()) return HandSide.RIGHT;
      return null;
    },
    get historyLength() {
      return history.length;
    },
    get liveAnnouncement() {
      return liveAnnouncement;
    },
    committedOrientationFor,
    selectPoint,
    edit,
    undo,
    reset,
    synchronizeInputs,
  };
}

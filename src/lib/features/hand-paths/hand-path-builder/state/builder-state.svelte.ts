/**
 * Builder State - Hand Path Builder
 *
 * Three-phase construction: left hand → right hand → complete.
 * Pure spatial paths: no rotation direction, no turn counts.
 * Each tap adds a location; min 2 locations per hand to proceed.
 * Right hand must match left hand length before completing.
 *
 * Path names follow the TKA naming convention:
 *   Cardinals uppercase (N, E, S, W)
 *   Intercardinals title-case (Ne, Se, Sw, Nw)
 *   Concatenated: ["n", "ne", "s"] → "NNeS"
 */

import { GridLocation, GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { handPathToName } from "$lib/shared/foundation/services/hand-path-namer";

export type BuilderPhase = "left" | "right" | "complete";

// Active grid locations per grid mode
const DIAMOND_LOCATIONS = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const BOX_LOCATIONS = new Set<GridLocation>([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);

const SKEWED_LOCATIONS = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
]);

function getActiveLocations(mode: GridMode): GridLocation[] {
  switch (mode) {
    case GridMode.DIAMOND: return [...DIAMOND_LOCATIONS];
    case GridMode.BOX: return [...BOX_LOCATIONS];
    default: return [...SKEWED_LOCATIONS];
  }
}

function isLocationActive(location: GridLocation, mode: GridMode): boolean {
  switch (mode) {
    case GridMode.DIAMOND: return DIAMOND_LOCATIONS.has(location);
    case GridMode.BOX: return BOX_LOCATIONS.has(location);
    default: return SKEWED_LOCATIONS.has(location);
  }
}

/** Describes a hand movement from one grid location to another */
export interface HandMove {
  from: GridLocation;
  to: GridLocation;
}

export interface BuilderState {
  readonly phase: BuilderPhase;
  readonly gridMode: GridMode;
  readonly leftLocations: GridLocation[];
  readonly rightLocations: GridLocation[];
  readonly leftPathName: string;
  readonly rightPathName: string;
  readonly availableLocations: GridLocation[];
  readonly canSwitchToRight: boolean;
  readonly canComplete: boolean;
  readonly activeLocations: GridLocation[];
  readonly lastLocation: GridLocation | null;
  readonly canUndo: boolean;
  readonly isAnimating: boolean;
  addLocation(loc: GridLocation): Promise<void>;
  setAnimationCallback(cb: (move: HandMove) => Promise<void>): void;
  undo(): void;
  switchToRight(): void;
  complete(): void;
  reset(): void;
  setGridMode(mode: GridMode): void;
}

export function createBuilderState(): BuilderState {
  let phase = $state<BuilderPhase>("left");
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let leftLocations = $state<GridLocation[]>([]);
  let rightLocations = $state<GridLocation[]>([]);
  let isAnimating = $state(false);
  let pathRevision = 0;

  // Animation callback - set by HandPathBuilderLab to animate hand movement
  let animationCallback: ((move: HandMove) => Promise<void>) | null = null;

  // Derived path names - live-update as locations are tapped
  const leftPathName = $derived(
    leftLocations.length > 0 ? handPathToName(leftLocations) : ""
  );
  const rightPathName = $derived(
    rightLocations.length > 0 ? handPathToName(rightLocations) : ""
  );

  // Which locations the grid should render as tappable
  const availableLocations = $derived(getActiveLocations(gridMode));

  // Phase gate conditions
  const canSwitchToRight = $derived(
    !isAnimating && phase === "left" && leftLocations.length >= 2
  );
  const canComplete = $derived(
    !isAnimating &&
    phase === "right" &&
    rightLocations.length >= 2 &&
    rightLocations.length === leftLocations.length
  );

  // The locations being built in the current phase
  const activeLocations = $derived(
    phase === "left" ? leftLocations : rightLocations
  );

  // Most-recently tapped location (for visual highlight)
  const lastLocation = $derived(
    activeLocations.length > 0
      ? activeLocations[activeLocations.length - 1]!
      : null
  );

  // Can undo when there are locations in the active phase
  const canUndo = $derived(
    !isAnimating && phase !== "complete" && activeLocations.length > 0
  );

  async function addLocation(loc: GridLocation): Promise<void> {
    // Ignore taps outside the active grid mode
    if (!isLocationActive(loc, gridMode)) return;
    // Block during animation
    if (isAnimating || phase === "complete") return;

    // Don't allow the right path to exceed the left path's length.
    if (phase === "right" && rightLocations.length >= leftLocations.length) return;

    const revision = pathRevision;
    const currentLocs = phase === "left" ? leftLocations : rightLocations;
    const previousLoc = currentLocs.length > 0
      ? currentLocs[currentLocs.length - 1]!
      : null;

    // If there's a previous location and an animation callback, animate first
    if (previousLoc && animationCallback) {
      isAnimating = true;
      try {
        await animationCallback({ from: previousLoc, to: loc });
      } finally {
        if (revision === pathRevision) isAnimating = false;
      }
    }

    // Reset and grid changes discard pending additions, including their animations.
    if (revision !== pathRevision) return;

    // After animation completes, add the location
    if (phase === "left") {
      leftLocations = [...leftLocations, loc];
    } else if (phase === "right") {
      rightLocations = [...rightLocations, loc];
    }
  }

  function setAnimationCallback(cb: (move: HandMove) => Promise<void>): void {
    animationCallback = cb;
  }

  function undo(): void {
    if (!canUndo) return;
    if (phase === "left" && leftLocations.length > 0) {
      leftLocations = leftLocations.slice(0, -1);
    } else if (phase === "right" && rightLocations.length > 0) {
      rightLocations = rightLocations.slice(0, -1);
    }
  }

  function switchToRight(): void {
    if (!canSwitchToRight) return;
    phase = "right";
  }

  function complete(): void {
    if (!canComplete) return;
    phase = "complete";
  }

  function reset(): void {
    pathRevision++;
    isAnimating = false;
    phase = "left";
    leftLocations = [];
    rightLocations = [];
  }

  function setGridMode(mode: GridMode): void {
    gridMode = mode;
    reset();
  }

  return {
    get phase() { return phase; },
    get gridMode() { return gridMode; },
    get leftLocations() { return leftLocations; },
    get rightLocations() { return rightLocations; },
    get leftPathName() { return leftPathName; },
    get rightPathName() { return rightPathName; },
    get availableLocations() { return availableLocations; },
    get canSwitchToRight() { return canSwitchToRight; },
    get canComplete() { return canComplete; },
    get activeLocations() { return activeLocations; },
    get lastLocation() { return lastLocation; },
    get canUndo() { return canUndo; },
    get isAnimating() { return isAnimating; },

    addLocation,
    setAnimationCallback,
    undo,
    switchToRight,
    complete,
    reset,
    setGridMode,
  };
}

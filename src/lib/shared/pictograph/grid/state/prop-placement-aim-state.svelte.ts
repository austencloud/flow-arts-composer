import type { GridLocation, GridMode } from "../domain/enums/grid-enums";
import {
  aimDirectionsFor,
  normalizeOrientationForLocation,
  orientationFromDrag,
} from "../domain/orientation-from-drag";
import type { PlacementGridPoint } from "../services/placement-grid-points";
import {
  calculatePlacementBetaOffsets,
  type PlacementBetaOffsets,
} from "../services/prop-placement-view-model";
import type { PropType } from "../../prop/domain/enums/prop-type";
import {
  HandSide,
  type Orientation,
} from "../../shared/domain/enums/pictograph-enums";
import type { PropPlacementState } from "./prop-placement-state.svelte";

interface PropPlacementAimInputs {
  getGridMode: () => GridMode;
  getActivePoints: () => PlacementGridPoint[];
  getCanAim: () => boolean;
  getCanDragLocations?: () => boolean;
  getEditAfterCompletion: () => boolean;
  getLeftOrientation: () => Orientation;
  getRightOrientation: () => Orientation;
  getLeftPropType: () => PropType;
  getRightPropType: () => PropType;
  getBetaSwapped: () => boolean;
  /**
   * Each hand's points on its own grid when the two hands draw on joined
   * grids; null (or absent) when both hands share one grid.
   */
  getHandPoints?: () => Readonly<Record<HandSide, PlacementGridPoint[]>> | null;
}

interface PropPlacementAimDependencies {
  triggerHaptic: () => void;
  onOrientationChange: (color: HandSide, orientation: Orientation) => void;
}

interface PendingOrientation {
  color: HandSide;
  orientation: Orientation;
}

export type PropPlacementAimState = ReturnType<
  typeof createPropPlacementAimState
>;

export function createPropPlacementAimState(
  placement: PropPlacementState,
  inputs: PropPlacementAimInputs,
  dependencies: PropPlacementAimDependencies
) {
  let overlayElement: SVGSVGElement | null = null;
  let gridWrapper: HTMLDivElement | null = null;
  let dragPointerId: number | null = null;
  let dragHand = $state<HandSide | null>(null);
  let dragLocation = $state<GridLocation | null>(null);
  let dragAim = $state<Orientation | null>(null);
  let pendingOrientation = $state<PendingOrientation | null>(null);
  let pointerHandledPress = false;
  let hoverHand = $state<HandSide | null>(null);
  let hoverOutline = $state<string | null>(null);
  let locationDrag = $state<{
    pointerId: number;
    color: HandSide;
    start: { x: number; y: number };
    origin: { x: number; y: number };
    clientStart: { x: number; y: number };
    delta: { x: number; y: number };
    moved: boolean;
    initialLeft: GridLocation | null;
    initialRight: GridLocation | null;
  } | null>(null);
  let landing = $state<{ point: PlacementGridPoint; color: HandSide } | null>(
    null
  );
  const locationTarget = $derived.by(() => {
    if (!locationDrag?.moved) return null;
    return nearestDropPoint(
      {
        x: locationDrag.start.x + locationDrag.delta.x,
        y: locationDrag.start.y + locationDrag.delta.y,
      },
      locationDrag.color
    );
  });

  /** True when each hand draws on its own grid. */
  function isJoined(): boolean {
    return Boolean(inputs.getHandPoints?.());
  }

  /** The points a hand is placed on: its own grid's when joined. */
  function pointsFor(color: HandSide): PlacementGridPoint[] {
    return inputs.getHandPoints?.()?.[color] ?? inputs.getActivePoints();
  }

  function locationOf(color: HandSide): GridLocation | null {
    return color === HandSide.LEFT
      ? placement.leftLocation
      : placement.rightLocation;
  }

  // The visible target and the committed drop must use the same decision.
  function nearestDropPoint(
    pointer: { x: number; y: number } | null,
    color: HandSide
  ) {
    if (
      !pointer ||
      pointer.x < 0 ||
      pointer.x > 950 ||
      pointer.y < 0 ||
      pointer.y > 950
    )
      return null;
    return pointsFor(color).reduce<PlacementGridPoint | null>(
      (best, point) =>
        !best ||
        Math.hypot(point.x - pointer.x, point.y - pointer.y) <
          Math.hypot(best.x - pointer.x, best.y - pointer.y)
          ? point
          : best,
      null
    );
  }

  function committedOrientationFor(color: HandSide): Orientation {
    return color === HandSide.LEFT
      ? inputs.getLeftOrientation()
      : inputs.getRightOrientation();
  }

  function shownOrientationFor(color: HandSide): Orientation {
    if (pendingOrientation?.color === color) {
      return pendingOrientation.orientation;
    }

    const location =
      color === HandSide.LEFT
        ? placement.leftLocation
        : placement.rightLocation;
    const orientation = committedOrientationFor(color);
    return location
      ? normalizeOrientationForLocation(orientation, location)
      : orientation;
  }

  function betaOffsets(): PlacementBetaOffsets {
    // Joined hands sit on separate grids, so the renderer gives them no beta.
    if (isJoined()) return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    return calculatePlacementBetaOffsets({
      gridMode: inputs.getGridMode(),
      leftLocation: placement.leftLocation,
      rightLocation: placement.rightLocation,
      leftOrientation: shownOrientationFor(HandSide.LEFT),
      rightOrientation: shownOrientationFor(HandSide.RIGHT),
      leftPropType: inputs.getLeftPropType(),
      rightPropType: inputs.getRightPropType(),
      betaSwapped: inputs.getBetaSwapped(),
    });
  }

  function propCenter(color: HandSide): { x: number; y: number } | null {
    const location = locationOf(color);
    if (location === null) return null;

    const point = pointsFor(color).find((entry) => entry.location === location);
    if (!point) return null;

    const offsets = betaOffsets();
    const offset = color === HandSide.LEFT ? offsets.left : offsets.right;
    return { x: point.x + offset.x, y: point.y + offset.y };
  }

  function propElement(color: HandSide): SVGGraphicsElement | null {
    const selector =
      color === HandSide.LEFT ? ".left-prop-svg" : ".right-prop-svg";
    return gridWrapper?.querySelector<SVGGraphicsElement>(selector) ?? null;
  }

  const SHAPE_TOLERANCE = 26;

  function shapeDepth(color: HandSide, event: MouseEvent): number | null {
    const element = propElement(color);
    if (!element) return null;

    try {
      const matrix = element.getScreenCTM();
      if (!matrix) return null;
      const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse()
      );
      const box = element.getBBox();
      if (box.width === 0 || box.height === 0) return null;
      const insetX = Math.min(local.x - box.x, box.x + box.width - local.x);
      const insetY = Math.min(local.y - box.y, box.y + box.height - local.y);
      return Math.min(insetX, insetY) + SHAPE_TOLERANCE;
    } catch {
      return null;
    }
  }

  function propOutline(color: HandSide): string | null {
    const element = propElement(color);
    if (!element || !overlayElement) return null;

    try {
      const propMatrix = element.getScreenCTM();
      const overlayMatrix = overlayElement.getScreenCTM();
      if (!propMatrix || !overlayMatrix) return null;

      const toOverlay = overlayMatrix.inverse().multiply(propMatrix);
      const box = element.getBBox();
      if (box.width === 0 || box.height === 0) return null;
      const pad = 12;
      const corners: Array<[number, number]> = [
        [box.x - pad, box.y - pad],
        [box.x + box.width + pad, box.y - pad],
        [box.x + box.width + pad, box.y + box.height + pad],
        [box.x - pad, box.y + box.height + pad],
      ];

      return corners
        .map(([x, y]) => {
          const point = new DOMPoint(x, y).matrixTransform(toOverlay);
          return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        })
        .join(" ");
    } catch {
      return null;
    }
  }

  function colorUnderPointer(event: MouseEvent): HandSide | null {
    const left = shapeDepth(HandSide.LEFT, event);
    const right = shapeDepth(HandSide.RIGHT, event);
    const leftHit = left !== null && left > 0;
    const rightHit = right !== null && right > 0;

    if (leftHit && rightHit) {
      return (right as number) > (left as number)
        ? HandSide.RIGHT
        : HandSide.LEFT;
    }
    if (leftHit) return HandSide.LEFT;
    if (rightHit) return HandSide.RIGHT;
    return null;
  }

  function toSvgPoint(event: MouseEvent): { x: number; y: number } | null {
    const matrix = overlayElement?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse()
    );
    return { x: point.x, y: point.y };
  }

  // `hand` is set for a joined target, which is one hand's point on that
  // hand's own grid; one-grid targets serve both hands and leave it unset.
  function resolvePressColor(
    location: GridLocation,
    event: MouseEvent | null = null,
    hand?: HandSide
  ): HandSide | null {
    if (placement.activeHand !== null) {
      return hand === undefined || hand === placement.activeHand
        ? placement.activeHand
        : null;
    }
    if (!inputs.getEditAfterCompletion()) return null;

    return occupiedColor(location, event, hand);
  }

  /**
   * The hand a press acts on, and the location it names in that hand's grid.
   * A joined press can land on the other hand's prop where the two grids'
   * points meet, and then acts on that hand at its own location.
   */
  function resolvePress(
    location: GridLocation,
    event: MouseEvent | null,
    hand?: HandSide
  ): { color: HandSide; location: GridLocation } | null {
    const color = resolvePressColor(location, event, hand);
    if (color === null) return null;
    if (hand === undefined || color === hand) return { color, location };
    const own = locationOf(color);
    return own === null ? null : { color, location: own };
  }

  /**
   * A joined target is one hand's point. Where both hands' props sit on one
   * spot (two grids meeting hand to hand), the press goes to the prop under
   * the pointer, as it does on a point both hands share on one grid.
   */
  function joinedOccupiedColor(
    location: GridLocation,
    event: MouseEvent | null,
    hand: HandSide
  ): HandSide | null {
    if (locationOf(hand) !== location) return null;
    const other = hand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;
    const mine = propCenter(hand);
    const theirs = propCenter(other);
    if (
      !event ||
      !mine ||
      !theirs ||
      Math.hypot(mine.x - theirs.x, mine.y - theirs.y) > 1
    ) {
      return hand;
    }
    return colorUnderPointer(event) ?? hand;
  }

  function occupiedColor(
    location: GridLocation,
    event: MouseEvent | null = null,
    hand?: HandSide
  ): HandSide | null {
    if (hand !== undefined) return joinedOccupiedColor(location, event, hand);
    const leftHere = placement.leftLocation === location;
    const rightHere = placement.rightLocation === location;

    if (leftHere && rightHere && event) {
      const onProp = colorUnderPointer(event);
      if (onProp !== null) return onProp;

      const pointer = toSvgPoint(event);
      const left = propCenter(HandSide.LEFT);
      const right = propCenter(HandSide.RIGHT);
      if (pointer && left && right) {
        const toLeft = (pointer.x - left.x) ** 2 + (pointer.y - left.y) ** 2;
        const toRight = (pointer.x - right.x) ** 2 + (pointer.y - right.y) ** 2;
        return toRight < toLeft ? HandSide.RIGHT : HandSide.LEFT;
      }
    }

    if (leftHere) return HandSide.LEFT;
    if (rightHere) return HandSide.RIGHT;
    return null;
  }

  function isPressable(location: GridLocation, hand?: HandSide): boolean {
    if (placement.canPlace) return true;
    return (
      (inputs.getCanAim() || placement.canEdit) &&
      resolvePressColor(location, null, hand) !== null
    );
  }

  function clearHover(): void {
    hoverHand = null;
    hoverOutline = null;
  }

  function updateHover(
    event: PointerEvent,
    location: GridLocation,
    hand?: HandSide
  ): void {
    if (
      !inputs.getCanAim() ||
      dragPointerId !== null ||
      event.pointerType === "touch"
    ) {
      return;
    }

    const color = resolvePressColor(location, event, hand);
    hoverHand = color;
    hoverOutline = color === null ? null : propOutline(color);
  }

  function handlePointerDown(
    event: PointerEvent,
    location: GridLocation,
    hand?: HandSide
  ): void {
    landing = null;
    pointerHandledPress = false;
    if (startLocationDrag(event, occupiedColor(location, event, hand))) return;
    if (!inputs.getCanAim() || dragPointerId !== null) return;
    const press = resolvePress(location, event, hand);
    if (press === null) return;

    clearHover();
    pointerHandledPress = true;
    placement.selectPoint(press.location, press.color);
    dragPointerId = event.pointerId;
    dragHand = press.color;
    dragLocation = press.location;
    dragAim = normalizeOrientationForLocation(
      committedOrientationFor(press.color),
      press.location
    );
  }

  function handlePointerMove(event: PointerEvent): void {
    if (locationDrag?.pointerId === event.pointerId) {
      const pointer = toSvgPoint(event);
      if (!pointer || !locationDragValid()) {
        cancelLocationDrag();
        return;
      }
      const moved =
        locationDrag.moved ||
        Math.hypot(
          event.clientX - locationDrag.clientStart.x,
          event.clientY - locationDrag.clientStart.y
        ) >= 6;
      const previousTarget = locationTarget?.location;
      locationDrag = {
        ...locationDrag,
        moved,
        delta: {
          x: pointer.x - locationDrag.start.x,
          y: pointer.y - locationDrag.start.y,
        },
      };
      if (moved && locationTarget && locationTarget.location !== previousTarget)
        dependencies.triggerHaptic();
      if (moved) event.preventDefault();
      return;
    }
    if (event.pointerId !== dragPointerId) return;
    if (dragHand === null || dragLocation === null) return;

    const pointer = toSvgPoint(event);
    const origin = pointsFor(dragHand).find(
      (point) => point.location === dragLocation
    );
    if (!pointer || !origin) return;

    const aimed = orientationFromDrag({
      location: dragLocation,
      gridMode: inputs.getGridMode(),
      dx: pointer.x - origin.x,
      dy: pointer.y - origin.y,
    });
    if (!aimed || aimed === dragAim) return;

    dragAim = aimed;
    pendingOrientation = { color: dragHand, orientation: aimed };
    dependencies.triggerHaptic();
  }

  function handlePointerUp(event: PointerEvent): void {
    if (locationDrag?.pointerId === event.pointerId) {
      const drag = locationDrag;
      const valid = locationDragValid();
      const pointer = toSvgPoint(event);
      locationDrag = null;
      if (!drag.moved) return; // A tap retains the existing select/place behavior.
      pointerHandledPress = true;
      const nearest = valid ? nearestDropPoint(pointer, drag.color) : null;
      if (nearest) {
        placement.selectPoint(nearest.location, drag.color);
        landing = { point: nearest, color: drag.color };
      }
      return;
    }
    if (event.pointerId !== dragPointerId) return;
    const color = dragHand;
    const aimed = dragAim;

    dragPointerId = null;
    dragHand = null;
    dragLocation = null;
    dragAim = null;

    if (color === null || aimed === null) return;
    if (aimed === committedOrientationFor(color)) return;
    dependencies.triggerHaptic();
    dependencies.onOrientationChange(color, aimed);
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (locationDrag?.pointerId === event.pointerId) {
      cancelLocationDrag();
      return;
    }
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = null;
    dragHand = null;
    dragLocation = null;
    dragAim = null;
    pendingOrientation = null;
  }

  function locationDragValid(): boolean {
    return Boolean(
      locationDrag &&
      placement.canEdit &&
      inputs.getCanDragLocations?.() &&
      placement.leftLocation === locationDrag.initialLeft &&
      placement.rightLocation === locationDrag.initialRight
    );
  }

  function startLocationDrag(
    event: PointerEvent,
    color: HandSide | null
  ): boolean {
    if (locationDrag) return true;
    if (
      !inputs.getCanDragLocations?.() ||
      inputs.getCanAim() ||
      !placement.canEdit ||
      event.button !== 0 ||
      color === null
    )
      return false;
    const pointer = toSvgPoint(event);
    if (!pointer) return false;
    locationDrag = {
      pointerId: event.pointerId,
      color,
      start: pointer,
      origin: propCenter(color) ?? pointer,
      clientStart: { x: event.clientX, y: event.clientY },
      delta: { x: 0, y: 0 },
      moved: false,
      initialLeft: placement.leftLocation,
      initialRight: placement.rightLocation,
    };
    landing = null;
    clearHover();
    dependencies.triggerHaptic();
    (event.currentTarget as Element | null)?.setPointerCapture?.(
      event.pointerId
    );
    return true;
  }

  function handleBoardPointerDown(event: PointerEvent): void {
    if (!inputs.getCanDragLocations?.() || inputs.getCanAim()) return;
    if (locationDrag) return;
    pointerHandledPress = false;
    startLocationDrag(event, colorUnderPointer(event));
  }

  function cancelLocationDrag(): void {
    if (locationDrag?.moved) pointerHandledPress = true;
    locationDrag = null;
    landing = null;
  }

  function handleEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !locationDrag) return;
    event.preventDefault();
    cancelLocationDrag();
  }

  function selectOrEdit(
    location: GridLocation,
    event: MouseEvent | null = null,
    hand?: HandSide
  ): void {
    if (
      !inputs.getCanAim() &&
      placement.canEdit &&
      placement.activeHand === null
    ) {
      const color = resolvePressColor(location, event, hand);
      if (color !== null) placement.edit(color);
      return;
    }
    placement.selectPoint(location);
  }

  function handleClick(
    location: GridLocation,
    event?: MouseEvent,
    hand?: HandSide
  ): void {
    if (pointerHandledPress) {
      pointerHandledPress = false;
      return;
    }
    landing = null;
    selectOrEdit(location, event, hand);
  }

  function handleKeydown(
    event: KeyboardEvent,
    location: GridLocation,
    hand?: HandSide
  ): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    landing = null;
    selectOrEdit(location, null, hand);
  }

  function retireCommittedPreview(): void {
    const pending = pendingOrientation;
    if (!pending) return;
    if (committedOrientationFor(pending.color) !== pending.orientation) return;
    pendingOrientation = null;
  }

  return {
    get grabbedLocationColor() {
      return locationDrag?.color ?? null;
    },
    get locationDragOrigin() {
      return locationDrag?.origin ?? null;
    },
    get locationDragCenter() {
      if (!locationDrag) return null;
      return {
        x:
          locationDrag.origin.x +
          (locationDrag.moved ? locationDrag.delta.x : 0),
        y:
          locationDrag.origin.y +
          (locationDrag.moved ? locationDrag.delta.y : 0),
      };
    },
    get locationTarget() {
      return locationTarget;
    },
    get landing() {
      return landing;
    },
    handleEscape,
    get locationDragColor() {
      return locationDrag?.moved ? locationDrag.color : null;
    },
    get locationDragDelta() {
      return locationDrag?.moved ? locationDrag.delta : { x: 0, y: 0 };
    },
    handleBoardPointerDown,
    cancelLocationDrag,
    get overlayElement() {
      return overlayElement;
    },
    set overlayElement(value: SVGSVGElement | null) {
      overlayElement = value;
    },
    get gridWrapper() {
      return gridWrapper;
    },
    set gridWrapper(value: HTMLDivElement | null) {
      gridWrapper = value;
    },
    get dragHand() {
      return dragHand;
    },
    get dragAim() {
      return dragAim;
    },
    get dragPoint() {
      return dragLocation === null || dragHand === null
        ? null
        : (pointsFor(dragHand).find(
            (point) => point.location === dragLocation
          ) ?? null);
    },
    get pendingOrientation() {
      return pendingOrientation;
    },
    get shownLeftOrientation() {
      return shownOrientationFor(HandSide.LEFT);
    },
    get shownRightOrientation() {
      return shownOrientationFor(HandSide.RIGHT);
    },
    get isBeta() {
      return (
        !isJoined() &&
        placement.leftLocation !== null &&
        placement.leftLocation === placement.rightLocation
      );
    },
    get highlightColor() {
      return dragHand ?? hoverHand;
    },
    get highlightCenter() {
      const color = dragHand ?? hoverHand;
      return color === null ? null : propCenter(color);
    },
    get highlightStroke() {
      return (dragHand ?? hoverHand) === HandSide.RIGHT
        ? "var(--prop-red, #ef4444)"
        : "var(--prop-blue, #3b82f6)";
    },
    get hoverOutline() {
      return hoverOutline;
    },
    get hoverHand() {
      return hoverHand;
    },
    get aimDirections() {
      return dragLocation === null
        ? []
        : aimDirectionsFor(dragLocation, inputs.getGridMode());
    },
    isPressable,
    updateHover,
    clearHover,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
    handleKeydown,
    retireCommittedPreview,
  };
}

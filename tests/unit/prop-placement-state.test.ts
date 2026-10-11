import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
import { createPropPlacementState } from "#lib/shared/pictograph/grid/state/prop-placement-state.svelte.js";
import { createPropPlacementAimState } from "#lib/shared/pictograph/grid/state/prop-placement-aim-state.svelte.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

function createHarness() {
  const values = {
    gridMode: GridMode.DIAMOND,
    showCenter: false,
    initialLeftLocation: null as GridLocation | null,
    initialRightLocation: null as GridLocation | null,
    resetEpoch: 0,
    disabled: false,
    editAfterCompletion: true,
    showUndo: true,
    allowUndoAfterComplete: true,
    leftOrientation: Orientation.IN,
    rightOrientation: Orientation.IN,
    dragLocations: false,
    canAim: false,
  };
  const onChange = vi.fn();
  const onPlacementComplete = vi.fn();
  const onOrientationChange = vi.fn();
  const triggerHaptic = vi.fn();
  const state = createPropPlacementState(
    {
      getGridMode: () => values.gridMode,
      getShowCenter: () => values.showCenter,
      getInitialLeftLocation: () => values.initialLeftLocation,
      getInitialRightLocation: () => values.initialRightLocation,
      getResetEpoch: () => values.resetEpoch,
      getDisabled: () => values.disabled,
      getEditAfterCompletion: () => values.editAfterCompletion,
      getShowUndo: () => values.showUndo,
      getAllowUndoAfterComplete: () => values.allowUndoAfterComplete,
      getLeftOrientation: () => values.leftOrientation,
      getRightOrientation: () => values.rightOrientation,
      getLeftNoun: () => "left prop",
      getRightNoun: () => "right prop",
      getActivePoints: () =>
        getPlacementGridPoints(values.gridMode, values.showCenter),
    },
    {
      triggerHaptic,
      onChange,
      onPlacementComplete,
      onOrientationChange,
    }
  );
  return {
    aim: createPropPlacementAimState(
      state,
      {
        getGridMode: () => values.gridMode,
        getActivePoints: () => getPlacementGridPoints(values.gridMode),
        getCanAim: () => values.canAim,
        getCanDragLocations: () => values.dragLocations,
        getEditAfterCompletion: () => values.editAfterCompletion,
        getLeftOrientation: () => values.leftOrientation,
        getRightOrientation: () => values.rightOrientation,
        getLeftPropType: () => PropType.HAND,
        getRightPropType: () => PropType.HAND,
        getBetaSwapped: () => false,
      },
      { triggerHaptic, onOrientationChange }
    ),
    values,
    state,
    onChange,
    onPlacementComplete,
    onOrientationChange,
    triggerHaptic,
  };
}

describe("prop placement state", () => {
  afterEach(() => vi.unstubAllGlobals());

  function dragHarness() {
    vi.stubGlobal(
      "DOMPoint",
      class {
        constructor(
          public x: number,
          public y: number
        ) {}
        matrixTransform() {
          return this;
        }
      }
    );
    const harness = createHarness();
    harness.values.dragLocations = true;
    harness.aim.overlayElement = {
      getScreenCTM: () => ({ inverse: () => ({}) }),
    } as unknown as SVGSVGElement;
    harness.state.selectPoint(GridLocation.NORTH);
    harness.state.selectPoint(GridLocation.SOUTH);
    return harness;
  }
  function pointer(type: string, x: number, y: number) {
    return Object.assign(
      new MouseEvent(type, { clientX: x, clientY: y, button: 0 }),
      { pointerId: 1 }
    ) as PointerEvent;
  }
  it("previews dragging without grading or adding history, and commits exactly one drop", () => {
    const { state, aim } = dragHarness();
    const north = getPlacementGridPoints(GridMode.DIAMOND).find(
      (p) => p.location === GridLocation.NORTH
    )!;
    const east = getPlacementGridPoints(GridMode.DIAMOND).find(
      (p) => p.location === GridLocation.EAST
    )!;
    aim.handlePointerDown(
      pointer("pointerdown", north.x, north.y),
      GridLocation.NORTH
    );
    aim.handlePointerMove(pointer("pointermove", east.x, east.y));
    expect(aim.locationDragColor).toBe(HandSide.LEFT);
    expect(aim.locationTarget?.location).toBe(GridLocation.EAST);
    expect(state.leftLocation).toBe(GridLocation.NORTH);
    expect(state.historyLength).toBe(2);
    aim.handlePointerUp(pointer("pointerup", east.x, east.y));
    aim.handleClick(GridLocation.NORTH); // Browser's post-drag click must not edit again.
    expect(state.leftLocation).toBe(GridLocation.EAST);
    expect(state.activeHand).toBeNull();
    expect(state.historyLength).toBe(3);
    expect(aim.landing?.point.location).toBe(state.leftLocation);
    expect(aim.locationTarget).toBeNull();
    state.undo();
    expect(state.leftLocation).toBe(GridLocation.NORTH);
  });
  it("updates the landing preview without extra commits or repeated target haptics", () => {
    const { state, aim, triggerHaptic } = dragHarness();
    aim.handlePointerDown(pointer("pointerdown", 475, 300), GridLocation.NORTH);
    triggerHaptic.mockClear();
    aim.handlePointerMove(pointer("pointermove", 600, 475));
    expect(aim.locationTarget?.location).toBe(GridLocation.EAST);
    aim.handlePointerMove(pointer("pointermove", 610, 480));
    expect(triggerHaptic).toHaveBeenCalledTimes(1);
    aim.handlePointerMove(pointer("pointermove", -10, 475));
    expect(aim.locationTarget).toBeNull();
    expect(state.historyLength).toBe(2);
    aim.handlePointerMove(pointer("pointermove", 475, 650));
    expect(aim.locationTarget?.location).toBe(GridLocation.SOUTH);
    aim.handleEscape(new KeyboardEvent("keydown", { key: "Escape" }));
    aim.handlePointerUp(pointer("pointerup", 475, 650));
    expect(aim.grabbedLocationColor).toBeNull();
    expect(aim.locationTarget).toBeNull();
    expect(aim.landing).toBeNull();
    expect(state.leftLocation).toBe(GridLocation.NORTH);
    expect(state.historyLength).toBe(2);
  });
  it.each(["cancel", "outside", "reset"])(
    "does not commit a %s drag",
    (reason) => {
      const { state, aim } = dragHarness();
      aim.handlePointerDown(
        pointer("pointerdown", 475, 300),
        GridLocation.NORTH
      );
      aim.handlePointerMove(pointer("pointermove", 600, 475));
      if (reason === "cancel")
        aim.handlePointerCancel(pointer("pointercancel", 600, 475));
      if (reason === "reset") {
        state.reset();
        aim.cancelLocationDrag();
      }
      aim.handlePointerUp(
        pointer("pointerup", reason === "outside" ? -20 : 600, 475)
      );
      expect(state.leftLocation).toBe(
        reason === "reset" ? null : GridLocation.NORTH
      );
      expect(state.historyLength).toBe(reason === "reset" ? 0 : 2);
    }
  );
  it("keeps short taps and orientation aiming separate from location dragging", () => {
    const { state, aim, values } = dragHarness();
    aim.handlePointerDown(pointer("pointerdown", 475, 300), GridLocation.NORTH);
    aim.handlePointerUp(pointer("pointerup", 475, 300));
    aim.handleClick(GridLocation.NORTH);
    expect(state.activeHand).toBe(HandSide.LEFT);
    expect(state.historyLength).toBe(2);
    values.canAim = true;
    aim.handlePointerDown(pointer("pointerdown", 475, 300), GridLocation.NORTH);
    aim.handleBoardPointerDown(pointer("pointerdown", 475, 300));
    aim.handlePointerUp(pointer("pointerup", 475, 300));
    aim.handleClick(GridLocation.NORTH);
    expect(state.historyLength).toBe(3);
    expect(aim.locationDragColor).toBeNull();
  });
  it("selects an occupied hand directly without changing placement or undo history", () => {
    const { state, aim } = createHarness();
    state.selectPoint(GridLocation.NORTH);
    state.selectPoint(GridLocation.SOUTH);
    expect(aim.isPressable(GridLocation.NORTH)).toBe(true);
    expect(aim.isPressable(GridLocation.EAST)).toBe(false);
    aim.handleClick(GridLocation.NORTH);
    expect(state.activeHand).toBe(HandSide.LEFT);
    expect(state.historyLength).toBe(2);
    aim.handleClick(GridLocation.EAST);
    expect(state.leftLocation).toBe(GridLocation.EAST);
    expect(state.rightLocation).toBe(GridLocation.SOUTH);
    state.undo();
    expect(state.leftLocation).toBe(GridLocation.NORTH);
  });

  it("supports keyboard hand selection and respects disabled editing", () => {
    const { state, aim, values } = createHarness();
    state.selectPoint(GridLocation.NORTH);
    state.selectPoint(GridLocation.SOUTH);
    values.disabled = true;
    expect(aim.isPressable(GridLocation.SOUTH)).toBe(false);
    aim.handleClick(GridLocation.SOUTH);
    expect(state.activeHand).toBeNull();
    values.disabled = false;
    aim.handleKeydown(
      new KeyboardEvent("keydown", { key: "Enter" }),
      GridLocation.SOUTH
    );
    expect(state.activeHand).toBe(HandSide.RIGHT);
  });
  it("places blue then red and publishes a complete position", () => {
    const harness = createHarness();

    harness.state.selectPoint(GridLocation.NORTH);
    harness.state.selectPoint(GridLocation.SOUTH);

    expect(harness.state.leftLocation).toBe(GridLocation.NORTH);
    expect(harness.state.rightLocation).toBe(GridLocation.SOUTH);
    expect(harness.state.activeHand).toBeNull();
    expect(harness.state.isComplete).toBe(true);
    expect(harness.state.historyLength).toBe(2);
    expect(harness.onPlacementComplete).toHaveBeenCalledWith(
      GridLocation.NORTH,
      GridLocation.SOUTH
    );
    expect(harness.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ complete: true, canUndo: true })
    );
  });

  it("restores the previous placement and active color on undo", () => {
    const harness = createHarness();
    harness.state.selectPoint(GridLocation.NORTH);
    harness.state.selectPoint(GridLocation.SOUTH);

    harness.state.undo();

    expect(harness.state.leftLocation).toBe(GridLocation.NORTH);
    expect(harness.state.rightLocation).toBeNull();
    expect(harness.state.activeHand).toBe(HandSide.RIGHT);
    expect(harness.state.historyLength).toBe(1);
    expect(harness.state.liveAnnouncement).toContain("right prop");
  });

  it("synchronizes new initial inputs only when their reset key changes", () => {
    const harness = createHarness();
    harness.state.selectPoint(GridLocation.NORTH);
    harness.values.initialLeftLocation = GridLocation.WEST;
    harness.values.initialRightLocation = GridLocation.EAST;
    harness.values.resetEpoch += 1;

    harness.state.synchronizeInputs();

    expect(harness.state.leftLocation).toBe(GridLocation.WEST);
    expect(harness.state.rightLocation).toBe(GridLocation.EAST);
    expect(harness.state.activeHand).toBeNull();
    expect(harness.state.historyLength).toBe(0);
  });

  it("keeps external move commands inert when completion editing is disabled", () => {
    const harness = createHarness();
    harness.values.editAfterCompletion = false;

    harness.state.edit(HandSide.RIGHT);

    expect(harness.state.activeHand).toBe(HandSide.LEFT);
    expect(harness.onChange).not.toHaveBeenCalled();
  });
});

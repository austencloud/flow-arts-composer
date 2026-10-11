// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { dispatchAssembleKeyboardAction } from "./assemble-keyboard-dispatcher";
import type { AssembleState } from "../state/assemble-state.svelte";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * Minimal mutable stand-in for AssembleState. Only the fields the dispatcher
 * reads/calls are modelled; methods are spies so we can assert routing.
 */
function makeState(overrides: Partial<AssembleState> = {}) {
  const state = {
    phase: "building",
    activeHand: HandSide.LEFT,
    currentPosition: GridLocation.NORTH,
    currentOrientation: Orientation.IN,
    rotationDirection: RotationDirection.CLOCKWISE,
    turnCount: 0,
    stepEditMode: null,
    canFinishHand: true,
    handlePointClick: vi.fn(),
    setTurnCount: vi.fn(),
    setRotationDirection: vi.fn(),
    setOrientation: vi.fn(),
    switchToHand: vi.fn(),
    undoStep: vi.fn().mockReturnValue(true),
    finishHand: vi.fn(),
    ...overrides,
  };
  return state as unknown as AssembleState & typeof state;
}

describe("dispatchAssembleKeyboardAction", () => {
  describe("position", () => {
    it("places the prop at the action location", () => {
      const s = makeState();
      dispatchAssembleKeyboardAction(s, { type: "position", location: GridLocation.EAST });
      expect(s.handlePointClick).toHaveBeenCalledWith(GridLocation.EAST);
    });

    it("fires onPositionKeydown before placing (timing capture)", () => {
      const s = makeState();
      const onPositionKeydown = vi.fn();
      dispatchAssembleKeyboardAction(s, { type: "position", location: GridLocation.EAST }, { onPositionKeydown });
      expect(onPositionKeydown).toHaveBeenCalledOnce();
      expect(s.handlePointClick).toHaveBeenCalledWith(GridLocation.EAST);
    });

    it("blocks the add (and timing) when the step cap is exceeded", () => {
      const s = makeState({ phase: "building", currentPosition: GridLocation.NORTH });
      const onPositionKeydown = vi.fn();
      dispatchAssembleKeyboardAction(
        s,
        { type: "position", location: GridLocation.EAST },
        { onStepCapExceeded: () => true, onPositionKeydown },
      );
      expect(s.handlePointClick).not.toHaveBeenCalled();
      expect(onPositionKeydown).not.toHaveBeenCalled();
    });

    it("does NOT gate the first placement (idle, no current position)", () => {
      const s = makeState({ phase: "idle", currentPosition: null });
      const onStepCapExceeded = vi.fn(() => true);
      dispatchAssembleKeyboardAction(
        s,
        { type: "position", location: GridLocation.NORTH },
        { onStepCapExceeded },
      );
      expect(onStepCapExceeded).not.toHaveBeenCalled();
      expect(s.handlePointClick).toHaveBeenCalledWith(GridLocation.NORTH);
    });

    it("does not apply the step cap while replacing a destination", () => {
      const s = makeState({ stepEditMode: "replace" });
      const onStepCapExceeded = vi.fn(() => true);

      dispatchAssembleKeyboardAction(
        s,
        { type: "position", location: GridLocation.EAST },
        { onStepCapExceeded }
      );

      expect(onStepCapExceeded).not.toHaveBeenCalled();
      expect(s.handlePointClick).toHaveBeenCalledWith(GridLocation.EAST);
    });
  });

  describe("turn cycling", () => {
    it("turnUp from 0 advances to 0.5", () => {
      const s = makeState({ turnCount: 0 });
      dispatchAssembleKeyboardAction(s, { type: "turnUp" });
      expect(s.setTurnCount).toHaveBeenCalledWith(0.5);
    });

    it("turnUp from float (-0.5) lands on 0", () => {
      const s = makeState({ turnCount: -0.5 });
      dispatchAssembleKeyboardAction(s, { type: "turnUp" });
      expect(s.setTurnCount).toHaveBeenCalledWith(0);
    });

    it("turnUp from top (3) wraps to 0", () => {
      const s = makeState({ turnCount: 3 });
      dispatchAssembleKeyboardAction(s, { type: "turnUp" });
      expect(s.setTurnCount).toHaveBeenCalledWith(0);
    });

    it("turnDown from 0 steps down to float (-0.5)", () => {
      const s = makeState({ turnCount: 0 });
      dispatchAssembleKeyboardAction(s, { type: "turnDown" });
      expect(s.setTurnCount).toHaveBeenCalledWith(-0.5);
    });

    it("turnDown from float (-0.5) wraps to top (3)", () => {
      const s = makeState({ turnCount: -0.5 });
      dispatchAssembleKeyboardAction(s, { type: "turnDown" });
      expect(s.setTurnCount).toHaveBeenCalledWith(3);
    });
  });

  describe("control actions", () => {
    it("toggleRotation flips CW -> CCW", () => {
      const s = makeState({ rotationDirection: RotationDirection.CLOCKWISE });
      dispatchAssembleKeyboardAction(s, { type: "toggleRotation" });
      expect(s.setRotationDirection).toHaveBeenCalledWith(RotationDirection.COUNTER_CLOCKWISE);
    });

    it("cycleOrientation advances IN -> OUT", () => {
      const s = makeState({ currentOrientation: Orientation.IN });
      dispatchAssembleKeyboardAction(s, { type: "cycleOrientation" });
      expect(s.setOrientation).toHaveBeenCalledWith(Orientation.OUT);
    });

    it("switchHand swaps BLUE -> RED", () => {
      const s = makeState({ activeHand: HandSide.LEFT });
      dispatchAssembleKeyboardAction(s, { type: "switchHand" });
      expect(s.switchToHand).toHaveBeenCalledWith(HandSide.RIGHT);
    });

    it("undo calls undoStep", () => {
      const s = makeState();
      dispatchAssembleKeyboardAction(s, { type: "undo" });
      expect(s.undoStep).toHaveBeenCalledOnce();
    });

    it("finish calls finishHand", () => {
      const s = makeState();
      dispatchAssembleKeyboardAction(s, { type: "finish" });
      expect(s.finishHand).toHaveBeenCalledOnce();
    });
  });
});

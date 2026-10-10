// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  handleAssembleKeyDown,
  type KeyboardContext,
} from "./assemble-keyboard-handler";
import { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function makeEvent(code: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { code });
}

function makeContext(overrides: Partial<KeyboardContext> = {}): KeyboardContext {
  return {
    gridMode: GridMode.SKEWED,
    showCenter: true,
    isModalOpen: false,
    isInputFocused: false,
    ...overrides,
  };
}

describe("handleAssembleKeyDown", () => {
  describe("position keys", () => {
    it("maps Numpad8 to NORTH", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad8"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.NORTH });
    });

    it("maps Numpad2 to SOUTH", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad2"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.SOUTH });
    });

    it("maps Numpad4 to WEST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad4"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.WEST });
    });

    it("maps Numpad6 to EAST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad6"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.EAST });
    });

    it("maps Numpad7 to NORTHWEST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad7"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.NORTHWEST });
    });

    it("maps Numpad9 to NORTHEAST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad9"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.NORTHEAST });
    });

    it("maps Numpad1 to SOUTHWEST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad1"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.SOUTHWEST });
    });

    it("maps Numpad3 to SOUTHEAST", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad3"), makeContext());
      expect(result).toEqual({ type: "position", location: GridLocation.SOUTHEAST });
    });

    it("maps Numpad5 to CENTER when showCenter is true", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad5"), makeContext({ showCenter: true }));
      expect(result).toEqual({ type: "position", location: GridLocation.CENTER });
    });

    it("returns null for Numpad5 when showCenter is false", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad5"), makeContext({ showCenter: false }));
      expect(result).toBeNull();
    });
  });

  describe("grid mode filtering", () => {
    it("blocks intercardinal keys in DIAMOND mode", () => {
      const ctx = makeContext({ gridMode: GridMode.DIAMOND });
      expect(handleAssembleKeyDown(makeEvent("Numpad7"), ctx)).toBeNull();
      expect(handleAssembleKeyDown(makeEvent("Numpad9"), ctx)).toBeNull();
      expect(handleAssembleKeyDown(makeEvent("Numpad1"), ctx)).toBeNull();
      expect(handleAssembleKeyDown(makeEvent("Numpad3"), ctx)).toBeNull();
    });

    it("allows cardinal keys in DIAMOND mode", () => {
      const ctx = makeContext({ gridMode: GridMode.DIAMOND });
      expect(handleAssembleKeyDown(makeEvent("Numpad8"), ctx)).toEqual({ type: "position", location: GridLocation.NORTH });
      expect(handleAssembleKeyDown(makeEvent("Numpad6"), ctx)).toEqual({ type: "position", location: GridLocation.EAST });
    });

    it("blocks cardinal keys in BOX mode", () => {
      const ctx = makeContext({ gridMode: GridMode.BOX });
      expect(handleAssembleKeyDown(makeEvent("Numpad8"), ctx)).toBeNull();
      expect(handleAssembleKeyDown(makeEvent("Numpad4"), ctx)).toBeNull();
    });

    it("allows intercardinal keys in BOX mode", () => {
      const ctx = makeContext({ gridMode: GridMode.BOX });
      expect(handleAssembleKeyDown(makeEvent("Numpad7"), ctx)).toEqual({ type: "position", location: GridLocation.NORTHWEST });
    });

    it("allows all keys in SKEWED mode", () => {
      const ctx = makeContext({ gridMode: GridMode.SKEWED });
      expect(handleAssembleKeyDown(makeEvent("Numpad8"), ctx)).not.toBeNull();
      expect(handleAssembleKeyDown(makeEvent("Numpad7"), ctx)).not.toBeNull();
    });
  });

  describe("control keys", () => {
    it("maps NumpadAdd to turnUp", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadAdd"), makeContext());
      expect(result).toEqual({ type: "turnUp" });
    });

    it("maps NumpadSubtract to turnDown", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadSubtract"), makeContext());
      expect(result).toEqual({ type: "turnDown" });
    });

    it("maps NumpadMultiply to toggleRotation", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadMultiply"), makeContext());
      expect(result).toEqual({ type: "toggleRotation" });
    });

    it("maps NumpadDivide to cycleOrientation", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadDivide"), makeContext());
      expect(result).toEqual({ type: "cycleOrientation" });
    });

    it("maps Numpad0 to switchHand", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad0"), makeContext());
      expect(result).toEqual({ type: "switchHand" });
    });

    it("maps NumpadDecimal to undo", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadDecimal"), makeContext());
      expect(result).toEqual({ type: "undo" });
    });

    it("maps NumpadEnter to finish", () => {
      const result = handleAssembleKeyDown(makeEvent("NumpadEnter"), makeContext());
      expect(result).toEqual({ type: "finish" });
    });
  });

  describe("input guards", () => {
    it("returns null when input is focused", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad8"), makeContext({ isInputFocused: true }));
      expect(result).toBeNull();
    });

    it("returns null when modal is open", () => {
      const result = handleAssembleKeyDown(makeEvent("Numpad8"), makeContext({ isModalOpen: true }));
      expect(result).toBeNull();
    });

    it("returns null for non-numpad keys", () => {
      const result = handleAssembleKeyDown(makeEvent("KeyA"), makeContext());
      expect(result).toBeNull();
    });
  });
});

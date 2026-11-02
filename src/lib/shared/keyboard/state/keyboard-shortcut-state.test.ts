// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createKeyboardShortcutState } from "./keyboard-shortcut-state.svelte";

beforeEach(() => {
  localStorage.clear();
});

describe("keyboard shortcut help launch state", () => {
  it("carries a filtered launch request into the shortcut center", () => {
    const state = createKeyboardShortcutState();

    state.openHelp({ view: "current", query: "Alt+" });

    expect(state.showHelp).toBe(true);
    expect(state.helpLaunch).toEqual({ view: "current", query: "Alt+" });
    expect(state.helpLaunchVersion).toBe(1);
  });

  it("resets omitted launch options and advances repeated requests", () => {
    const state = createKeyboardShortcutState();

    state.openHelp({ view: "changed", query: "Mirror" });
    state.closeHelp();
    state.openHelp();

    expect(state.helpLaunch).toEqual({ view: "current", query: "" });
    expect(state.helpLaunchVersion).toBe(2);
  });
});

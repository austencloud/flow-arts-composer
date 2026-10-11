import { beforeEach, describe, expect, it, vi } from "vitest";

const handleModuleChange = vi.fn(async () => {});
const openHelp = vi.fn();
const logKeyboardShortcutSettingsOpened = vi.fn();

vi.mock(
  "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js",
  () => ({ handleModuleChange })
);
vi.mock("#lib/shared/keyboard/state/keyboard-shortcut-state.svelte.js", () => ({
  keyboardShortcutState: {
    context: "create",
    openHelp,
  },
}));
vi.mock("#lib/shared/keyboard/keyboard-shortcut-analytics.js", () => ({
  logKeyboardShortcutSettingsOpened,
}));

describe("openShortcutSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records its source and navigates to the Keyboard settings destination", async () => {
    const { openShortcutSettings } =
      await import("#lib/shared/keyboard/open-shortcut-settings.js");

    await openShortcutSettings("keyboard_shortcut", {
      view: "current",
      query: "Rotate",
    });

    expect(openHelp).toHaveBeenCalledWith({
      view: "current",
      query: "Rotate",
    });
    expect(logKeyboardShortcutSettingsOpened).toHaveBeenCalledWith(
      "create",
      "keyboard_shortcut"
    );
    expect(handleModuleChange).toHaveBeenCalledWith("settings", "keyboard");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { Shortcut } from "#lib/shared/keyboard/domain/models/shortcut.js";
import { keyboardShortcutState } from "#lib/shared/keyboard/state/keyboard-shortcut-state.svelte.js";
import { ShortcutCustomizer } from "#lib/shared/keyboard/services/shortcut-customizer.js";
import { ShortcutRegistry } from "#lib/shared/keyboard/services/shortcut-registry.js";

function createShortcut(
  id: string,
  key: string,
  alternateKey?: string
): Shortcut {
  return new Shortcut({
    id,
    label: id,
    key,
    modifiers: ["ctrl"],
    alternateBindings: alternateKey
      ? [{ key: alternateKey, modifiers: ["ctrl"] }]
      : [],
    context: "global",
    scope: "editing",
    priority: "medium",
    preventDefault: true,
    stopPropagation: false,
    action: () => {},
    enabled: true,
    isSingleKey: false,
    forceExecute: false,
    preserveDrawers: false,
  });
}

describe("shortcut alternate bindings", () => {
  beforeEach(() => {
    localStorage.clear();
    keyboardShortcutState.resetAllCustomBindings();
  });

  it("matches an alternate default binding", () => {
    const redo = createShortcut("global.redo", "z", "y");

    expect(redo.matches("y", ["ctrl"], true)).toBe(true);
    expect(redo.matches("y", [], false)).toBe(false);
  });

  it("includes alternate defaults in conflict detection", () => {
    const registry = new ShortcutRegistry();
    registry.add(createShortcut("global.undo", "z"));
    registry.add(createShortcut("global.redo", "z", "y"));
    registry.add(createShortcut("other.action", "q"));
    const customizer = new ShortcutCustomizer(registry);

    expect(customizer.detectConflict("other.action", "ctrl+y")).toMatchObject({
      existingShortcutId: "global.redo",
      keyCombo: "ctrl+y",
      severity: "error",
    });
  });

  it("lets a custom binding replace the whole default binding family", () => {
    const registry = new ShortcutRegistry();
    registry.add(createShortcut("global.redo", "z", "y"));
    const customizer = new ShortcutCustomizer(registry);

    expect(customizer.setCustomBinding("global.redo", "ctrl+r")).toBeNull();
    expect(registry.findMatches("y", ["ctrl"], true, "global")).toHaveLength(0);
    expect(registry.findMatches("r", ["ctrl"], true, "global")[0]?.id).toBe(
      "global.redo"
    );
  });
});

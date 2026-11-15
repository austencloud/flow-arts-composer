// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { isPropActive } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import type { KeyboardShortcutManager } from "../services/keyboard-shortcut-manager";
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";
import type { createKeyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";

const updateSettings = vi.fn().mockResolvedValue(undefined);
let currentProp: PropType = PropType.STAFF;

vi.mock("#lib/shared/application/state/app-state.svelte.js", () => ({
  getSettings: () => ({ leftPropType: currentProp }),
  updateSettings: (...args: unknown[]) => updateSettings(...args),
}));
vi.mock("../../settings/state/settings-state.svelte", () => ({
  settingsService: {
    get settings() {
      return { leftPropType: currentProp };
    },
    updateSettings: (...args: unknown[]) => updateSettings(...args),
  },
}));
vi.mock("#lib/shared/keyboard/keyboard-shortcut-analytics.js", () => ({
  logKeyboardShortcutExecuted: vi.fn(),
  logKeyboardShortcutFailed: vi.fn(),
}));

import { registerCreateShortcuts } from "./register-create-shortcuts";
import { registerGlobalShortcuts } from "./register-global-shortcuts";

function register(
  fn: (
    s: KeyboardShortcutManager,
    st: ReturnType<typeof createKeyboardShortcutState>
  ) => void
) {
  const registered = new Map<string, ShortcutRegistrationOptions>();
  const service = {
    register: (options: ShortcutRegistrationOptions) => {
      registered.set(options.id, options);
      return () => {};
    },
  } as unknown as KeyboardShortcutManager;
  const state = {
    settings: { enableSingleKeyShortcuts: true },
    isMac: false,
  } as unknown as ReturnType<typeof createKeyboardShortcutState>;
  fn(service, state);
  return registered;
}

describe("prop shortcuts skip deactivated props", () => {
  beforeEach(() => updateSettings.mockClear());

  it("Shift+P steps from a saved contact ball to a prop that can be picked", async () => {
    currentProp = PropType.CONTACTBALL;
    const shortcuts = register(registerGlobalShortcuts);
    await shortcuts.get("global.cycle-prop-type")!.action(new KeyboardEvent("keydown"));
    const patch = updateSettings.mock.calls[0]![0] as {
      leftPropType: PropType;
    };
    expect(isPropActive(patch.leftPropType)).toBe(true);
  });

  it("Shift+P never lands on the contact ball family", async () => {
    const shortcuts = register(registerGlobalShortcuts);
    for (const prop of [
      PropType.TORCH,
      PropType.CHICKEN,
      PropType.DOUBLESTAR,
      PropType.EIGHTRINGS,
    ]) {
      currentProp = prop;
      updateSettings.mockClear();
      await shortcuts.get("global.cycle-prop-type")!.action(new KeyboardEvent("keydown"));
      const patch = updateSettings.mock.calls[0]![0] as {
        leftPropType: PropType;
      };
      expect(isPropActive(patch.leftPropType), prop).toBe(true);
    }
  });

  it("the random prop shortcut only picks props that can be picked", async () => {
    currentProp = PropType.STAFF;
    const shortcuts = register(registerCreateShortcuts);
    for (let i = 0; i < 80; i += 1) {
      updateSettings.mockClear();
      await shortcuts.get("create.shuffle-prop")!.action(new KeyboardEvent("keydown"));
      const patch = updateSettings.mock.calls[0]![0] as {
        leftPropType: PropType;
      };
      expect(isPropActive(patch.leftPropType)).toBe(true);
    }
  });
});

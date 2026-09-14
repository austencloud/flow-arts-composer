// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
import { animationShortcutRegistrar } from "../animation-shortcut-registrar";

/**
 * The play/pause binding was registered as a raw " " for a long time and could
 * never fire: NormalizedKeyboardEvent rewrites " " to "Space" before
 * ShortcutRegistry.findMatches compares, so the raw character matches nothing
 * while the help panel keeps advertising "Space" to the user. Nothing about
 * that failure is visible from the registrar on its own, so this pin drives a
 * real keydown through the real manager, registry, and normalizer instead of
 * asserting on the string.
 */

function mount() {
  const manager = new KeyboardShortcutManager(new ShortcutRegistry());
  manager.initialize();

  const onPlaybackToggle = vi.fn();
  const onStepFullBeatForward = vi.fn();

  // Registered exactly as AnimationShareDrawer.setupKeyboardShortcuts() does.
  const unregister = animationShortcutRegistrar.register(manager, {
    onPlaybackToggle,
    onStepHalfBeatForward: vi.fn(),
    onStepHalfBeatBackward: vi.fn(),
    onStepFullBeatForward,
    onStepFullBeatBackward: vi.fn(),
    onClose: vi.fn(),
    onShowHelp: vi.fn(),
  });
  manager.setContext("animation-panel");

  return { manager, unregister, onPlaybackToggle, onStepFullBeatForward };
}

function pressKey(key: string) {
  // document.body is not an interactive target, so shouldIgnore() lets the
  // shortcut through the same way it would with the panel focused.
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}

describe("animation panel play/pause shortcut", () => {
  let teardown: (() => void) | null = null;
  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  it("fires on a real Space keydown", () => {
    const { manager, unregister, onPlaybackToggle } = mount();
    teardown = () => {
      unregister();
      manager.dispose();
    };

    pressKey(" ");

    expect(onPlaybackToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the arrow bindings working, so the Space case is not a dead harness", () => {
    const { manager, unregister, onStepFullBeatForward } = mount();
    teardown = () => {
      unregister();
      manager.dispose();
    };

    pressKey("ArrowRight");

    expect(onStepFullBeatForward).toHaveBeenCalledTimes(1);
  });

  it("declares the same key the help panel advertises", () => {
    const advertised = animationShortcutRegistrar.shortcuts.find(
      (s) => s.label === "Play / Pause"
    );

    expect(advertised?.key).toBe("Space");
  });
});

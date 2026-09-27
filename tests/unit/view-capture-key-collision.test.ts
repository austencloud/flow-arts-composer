// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import type { ShortcutRegistrationOptions } from "$lib/shared/keyboard/domain/types/keyboard-types";
import { VIEW_CAPTURE_KEY_CODE } from "$lib/shared/review/view-capture";
import { registerGlobalShortcuts } from "$lib/shared/keyboard/registration/register-global-shortcuts";
import { registerCreateShortcuts } from "$lib/shared/keyboard/registration/register-create-shortcuts";
import { registerChoreoShortcuts } from "$lib/shared/keyboard/registration/register-choreo-shortcuts";
import { registerStageShortcuts } from "$lib/shared/keyboard/registration/register-stage-shortcuts";
import { register3DViewerShortcuts } from "$lib/shared/keyboard/registration/register-3d-viewer-shortcuts";
import { registerEscapeShortcut } from "$lib/shared/keyboard/registration/register-escape-shortcut";
import { registerSaveShortcut } from "$lib/shared/keyboard/registration/register-save-shortcut";
import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
import { AnimationShortcutRegistrar } from "$lib/shared/animation-engine/services/animation-shortcut-registrar";

/**
 * Regression test for the bare-P collision.
 *
 * The global view-capture listener and the app's own shortcut registry each
 * listen on window independently, so any feature that binds the same bare
 * key fires alongside it on every press. Bare P silently overwrote the
 * clipboard with a debug capture on top of opening the prop-picker drawer,
 * and nobody noticed, because nothing ever checked the two catalogs against
 * each other.
 *
 * This calls the real registration functions - the same ones that build the
 * app's actual shortcut catalog and the "?" help overlay - with the smallest
 * fake state each one reads during registration (the same shape
 * register-create-shortcuts.test.ts already uses), and asserts none of them
 * claims the view-capture key without a modifier held.
 */

const VIEW_CAPTURE_LETTER = VIEW_CAPTURE_KEY_CODE.replace(/^Key/, "").toLowerCase();

function collectingService() {
  const registered: ShortcutRegistrationOptions[] = [];
  const service = {
    register: (options: ShortcutRegistrationOptions) => {
      registered.push(options);
      return () => {};
    },
    // A couple of registration files skip re-registering an id that is
    // already there, guarding against a double-mount race.
    isRegistered: (id: string) => registered.some((shortcut) => shortcut.id === id),
  } as unknown as KeyboardShortcutManager;
  return { service, registered };
}

describe("the view-capture key is not claimed by any registered shortcut", () => {
  it("stays free of every bare-key binding in the app's own shortcut catalog", () => {
    const { service, registered } = collectingService();

    registerGlobalShortcuts(
      service,
      { isMac: false, openCommandPalette: () => {} } as unknown as Parameters<
        typeof registerGlobalShortcuts
      >[1]
    );
    registerCreateShortcuts(
      service,
      { settings: { enableSingleKeyShortcuts: true } } as unknown as Parameters<
        typeof registerCreateShortcuts
      >[1]
    );
    registerChoreoShortcuts(service);
    registerStageShortcuts(service);
    register3DViewerShortcuts(service);
    registerEscapeShortcut(service);
    registerSaveShortcut(service, false);
    registerEditHistoryShortcuts(service, false);
    new AnimationShortcutRegistrar().register(service, {
      onPlaybackToggle: () => {},
      onStepHalfBeatForward: () => {},
      onStepHalfBeatBackward: () => {},
      onStepFullBeatForward: () => {},
      onStepFullBeatBackward: () => {},
      onClose: () => {},
      onShowHelp: () => {},
    });

    // A guard against the test passing for the wrong reason: if a signature
    // change made every call above silently no-op, "zero collisions" would
    // be meaningless. This proves the catalog actually got built.
    expect(registered.length).toBeGreaterThan(20);

    const bareCollisions = registered.filter((shortcut) => {
      const bindings = [
        { key: shortcut.key, modifiers: shortcut.modifiers ?? [] },
        ...(shortcut.alternateBindings ?? []),
      ];
      return bindings.some(
        (binding) =>
          binding.modifiers.length === 0 &&
          binding.key.toLowerCase() === VIEW_CAPTURE_LETTER
      );
    });

    expect(
      bareCollisions.map((shortcut) => shortcut.id),
      `these registered shortcuts claim a bare "${VIEW_CAPTURE_LETTER}", which the dev-only view-capture listener also binds on every route`
    ).toEqual([]);
  });
});

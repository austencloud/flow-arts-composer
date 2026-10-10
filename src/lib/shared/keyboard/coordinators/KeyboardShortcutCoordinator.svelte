<script lang="ts">
  /**
   * Keyboard Shortcut Coordinator
   *
   * Initializes and coordinates the keyboard shortcut system.
   * Registers global shortcuts and manages the command palette.
   *
   * Domain: Keyboard Shortcuts - Coordination
   */

  import { onMount } from "svelte";
  import { getKeyboardShortcutManager } from "../get-keyboard-shortcut-manager";
  import { getCommandPalette } from "../get-command-palette";

  import type { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
  import type { CommandPalette } from "#lib/shared/keyboard/services/command-palette.js";
  import type { ShortcutContext } from "../domain/types/keyboard-types";
  import { keyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";
  import { getActiveModule } from "../../application/state/ui/ui-state.svelte";
  import { registerGlobalShortcuts } from "../registration/register-global-shortcuts";
  import { registerCommandPaletteCommands } from "../registration/register-commands";
  import { registerCreateShortcuts } from "../registration/register-create-shortcuts";
  import { register3DViewerShortcuts } from "../registration/register-3d-viewer-shortcuts";
  import { registerChoreoShortcuts } from "../registration/register-choreo-shortcuts";
  import { registerStageShortcuts } from "../registration/register-stage-shortcuts";

  // Services
  let shortcutManager = $state<KeyboardShortcutManager | null>(null);
  let commandPalette = $state<CommandPalette | null>(null);

  onMount(() => {
    // Initialize services asynchronously
    (async () => {
      try {
        // Resolve services
        const manager = getKeyboardShortcutManager();
        const palette = getCommandPalette();

        // Assign to component variables for cleanup
        shortcutManager = manager;
        commandPalette = palette;

        manager.initialize();

        registerGlobalShortcuts(manager, keyboardShortcutState);

        // Register CREATE module shortcuts
        registerCreateShortcuts(manager, keyboardShortcutState);

        // Register 3D Viewer shortcuts (static, handlers bound dynamically)
        register3DViewerShortcuts(manager);

        // Register Choreo sheet shortcuts (static, handlers bound dynamically)
        registerChoreoShortcuts(manager);

        // Register Stage shortcuts (static, handlers bound dynamically)
        registerStageShortcuts(manager);
      } catch (error) {
        console.error("Failed to initialize keyboard shortcuts:", error);
      }
    })();

    // Cleanup on unmount
    return () => {
      if (shortcutManager) {
        shortcutManager.dispose();
      }
    };
  });

  // The first app-shell render intentionally exposes only core modules while
  // auth and feature flags load. Keep the palette in lockstep when that list
  // expands or changes instead of freezing the optimistic first render.
  $effect(() => {
    if (commandPalette) {
      registerCommandPaletteCommands(commandPalette, keyboardShortcutState);
    }
  });

  // Sync context with active module
  $effect(() => {
    const module = getActiveModule();

    // Only set context if service is initialized and module is available
    if (shortcutManager && module) {
      const context = module as ShortcutContext;
      shortcutManager.setContext(context);
      keyboardShortcutState.setContext(context);
    }
  });
</script>

<!-- This coordinator has no UI -->

/**
 * Register 3D Viewer Shortcuts (Static)
 *
 * Registers 3D viewer shortcuts at app startup for display in Settings.
 * Actual handlers are bound dynamically when the viewer mounts.
 *
 * Side-effectful registration/orchestration — lives in registration/, not utils/.
 */

import type { KeyboardShortcutManager } from '#lib/shared/keyboard/services/keyboard-shortcut-manager.js'
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";

/**
 * 3D Viewer shortcut definitions for static registration
 * Actions are no-ops - the actual handlers are bound by Keyboard3DCoordinator
 */
const VIEWER_3D_SHORTCUTS: Omit<ShortcutRegistrationOptions, "action">[] = [
  // === PLAYBACK ===
  {
    id: "3d-viewer.play-pause",
    label: "Play / Pause",
    description: "Toggle animation playback",
    key: "Space",
    scope: "playback",
    context: "realm",
    priority: "high",
  },
  {
    id: "3d-viewer.reset",
    label: "Reset",
    description: "Reset to beginning of current step",
    key: "r",
    scope: "playback",
    context: "realm",
  },
  {
    id: "3d-viewer.toggle-loop",
    label: "Toggle Loop",
    description: "Enable/disable looping",
    key: "l",
    scope: "playback",
    context: "realm",
  },
  {
    id: "3d-viewer.speed-up",
    label: "Speed Up",
    description: "Increase playback speed",
    key: "=",
    scope: "playback",
    context: "realm",
  },
  {
    id: "3d-viewer.speed-down",
    label: "Speed Down",
    description: "Decrease playback speed",
    key: "-",
    scope: "playback",
    context: "realm",
  },

  // === STEP NAVIGATION ===
  {
    id: "3d-viewer.prev-beat",
    label: "Previous Step",
    description: "Go to previous step in sequence",
    key: "ArrowLeft",
    scope: "navigation",
    context: "realm",
  },
  {
    id: "3d-viewer.next-beat",
    label: "Next Step",
    description: "Go to next step in sequence",
    key: "ArrowRight",
    scope: "navigation",
    context: "realm",
  },
  {
    id: "3d-viewer.first-beat",
    label: "First Step",
    description: "Jump to first step",
    key: "Home",
    scope: "navigation",
    context: "realm",
  },
  {
    id: "3d-viewer.last-beat",
    label: "Last Step",
    description: "Jump to last step",
    key: "End",
    scope: "navigation",
    context: "realm",
  },

  // === CAMERA PRESETS (number keys - WASD reserved for locomotion) ===
  {
    id: "3d-viewer.camera-front",
    label: "Back View",
    description: "View from back (Wall plane)",
    key: "1",
    scope: "view",
    context: "realm",
  },
  {
    id: "3d-viewer.camera-top",
    label: "Top View",
    description: "View from above (Floor plane)",
    key: "2",
    scope: "view",
    context: "realm",
  },
  {
    id: "3d-viewer.camera-side",
    label: "Side View",
    description: "View from side (Wheel plane)",
    key: "3",
    scope: "view",
    context: "realm",
  },
  {
    id: "3d-viewer.camera-perspective",
    label: "Perspective View",
    description: "Angled 3D view",
    key: "4",
    scope: "view",
    context: "realm",
  },

  // === UI TOGGLES ===
  {
    id: "3d-viewer.toggle-grid",
    label: "Toggle Grid",
    description: "Show/hide grid planes",
    key: "g",
    scope: "view",
    context: "realm",
  },
  {
    id: "3d-viewer.toggle-panel",
    label: "Toggle Panel",
    description: "Show/hide side panel",
    key: "p",
    scope: "panel",
    context: "realm",
  },
  {
    id: "3d-viewer.open-browser",
    label: "Open Sequence Browser",
    description: "Open the sequence browser",
    key: "o",
    scope: "action",
    context: "realm",
  },
  {
    id: "3d-viewer.show-help",
    label: "Keyboard Shortcuts",
    description: "Show keyboard shortcuts help",
    key: "h",
    scope: "help",
    context: "realm",
  },
];

/**
 * Register 3D viewer shortcuts for Settings display
 * These are placeholder registrations - actual handlers bound by Keyboard3DCoordinator
 */
export function register3DViewerShortcuts(
  shortcutService: KeyboardShortcutManager
): void {
  const noop = () => {
    // Placeholder action - real action bound dynamically by Keyboard3DCoordinator
  };

  for (const shortcut of VIEWER_3D_SHORTCUTS) {
    shortcutService.register({
      ...shortcut,
      action: noop,
    });
  }
}

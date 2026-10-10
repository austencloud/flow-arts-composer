/**
 * 3D Viewer Keyboard Shortcuts
 *
 * Defines all keyboard shortcuts for the 3D animation viewer.
 * Shortcuts are registered when the viewer is active.
 */

import type { ShortcutRegistrationOptions } from "#lib/shared/keyboard/domain/types/keyboard-types.js";

/**
 * Shortcut action handlers - injected at registration time
 */
export interface Viewer3DShortcutHandlers {
  // Playback
  togglePlay: () => void;
  reset: () => void;
  toggleLoop: () => void;
  speedUp: () => void;
  speedDown: () => void;

  // Beat navigation
  prevStep: () => void;
  nextStep: () => void;
  firstStep: () => void;
  lastStep: () => void;

  // Camera presets
  setCameraFront: () => void;
  setCameraTop: () => void;
  setCameraSide: () => void;
  setCameraPerspective: () => void;

  // Camera mode switching
  toggleCameraMode: () => void;

  // UI toggles
  toggleGrid: () => void;
  togglePanel: () => void;
  openBrowser: () => void;
  showHelp: () => void;
}

/**
 * Create shortcut definitions for the 3D viewer
 */
export function createViewer3DShortcuts(
  handlers: Viewer3DShortcutHandlers
): ShortcutRegistrationOptions[] {
  return [
    // === PLAYBACK ===
    {
      id: "3d-viewer.play-pause",
      label: "Play / Pause",
      description: "Toggle animation playback",
      key: "Space",
      scope: "playback",
      context: "realm",
      priority: "high",
      action: handlers.togglePlay,
    },
    {
      id: "3d-viewer.reset",
      label: "Reset",
      description: "Reset to beginning of current step",
      key: "r",
      scope: "playback",
      context: "realm",
      action: handlers.reset,
    },
    {
      id: "3d-viewer.toggle-loop",
      label: "Toggle Loop",
      description: "Enable/disable looping",
      key: "l",
      scope: "playback",
      context: "realm",
      action: handlers.toggleLoop,
    },
    {
      id: "3d-viewer.speed-up",
      label: "Speed Up",
      description: "Increase playback speed",
      key: "=",
      scope: "playback",
      context: "realm",
      action: handlers.speedUp,
    },
    {
      id: "3d-viewer.speed-down",
      label: "Speed Down",
      description: "Decrease playback speed",
      key: "-",
      scope: "playback",
      context: "realm",
      action: handlers.speedDown,
    },

    // === STEP NAVIGATION ===
    {
      id: "3d-viewer.prev-beat",
      label: "Previous Step",
      description: "Go to previous step in sequence",
      key: "ArrowLeft",
      scope: "navigation",
      context: "realm",
      action: handlers.prevStep,
    },
    {
      id: "3d-viewer.next-beat",
      label: "Next Step",
      description: "Go to next step in sequence",
      key: "ArrowRight",
      scope: "navigation",
      context: "realm",
      action: handlers.nextStep,
    },
    {
      id: "3d-viewer.first-beat",
      label: "First Step",
      description: "Jump to first step",
      key: "Home",
      scope: "navigation",
      context: "realm",
      action: handlers.firstStep,
    },
    {
      id: "3d-viewer.last-beat",
      label: "Last Step",
      description: "Jump to last step",
      key: "End",
      scope: "navigation",
      context: "realm",
      action: handlers.lastStep,
    },

    // === CAMERA PRESETS (number keys - WASD reserved for locomotion) ===
    {
      id: "3d-viewer.camera-front",
      label: "Back View",
      description: "View from back (Wall plane)",
      key: "1",
      scope: "view",
      context: "realm",
      action: handlers.setCameraFront,
    },
    {
      id: "3d-viewer.camera-top",
      label: "Top View",
      description: "View from above (Floor plane)",
      key: "2",
      scope: "view",
      context: "realm",
      action: handlers.setCameraTop,
    },
    {
      id: "3d-viewer.camera-side",
      label: "Side View",
      description: "View from side (Wheel plane)",
      key: "3",
      scope: "view",
      context: "realm",
      action: handlers.setCameraSide,
    },
    {
      id: "3d-viewer.camera-perspective",
      label: "Perspective View",
      description: "Angled 3D view",
      key: "4",
      scope: "view",
      context: "realm",
      action: handlers.setCameraPerspective,
    },

    // === UI TOGGLES ===
    {
      id: "3d-viewer.toggle-grid",
      label: "Toggle Grid",
      description: "Show/hide grid planes",
      key: "g",
      scope: "view",
      context: "realm",
      action: handlers.toggleGrid,
    },
    {
      id: "3d-viewer.toggle-panel",
      label: "Toggle Panel",
      description: "Show/hide side panel",
      key: "p",
      scope: "panel",
      context: "realm",
      action: handlers.togglePanel,
    },
    {
      id: "3d-viewer.open-browser",
      label: "Open Sequence Browser",
      description: "Open the sequence browser",
      key: "o",
      scope: "action",
      context: "realm",
      action: handlers.openBrowser,
    },
    {
      id: "3d-viewer.show-help",
      label: "Keyboard Shortcuts",
      description: "Show keyboard shortcuts help",
      key: "h",
      scope: "help",
      context: "realm",
      action: handlers.showHelp,
    },
    {
      id: "3d-viewer.toggle-camera-mode",
      label: "Toggle Camera Mode",
      description: "Switch between orbit and first-person camera",
      key: "v",
      scope: "action",
      context: "realm",
      action: handlers.toggleCameraMode,
    },
  ];
}

/**
 * Speed presets for quick adjustment
 */
export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function getNextSpeedUp(current: number): number {
  const currentIndex = SPEED_PRESETS.findIndex((s) => s >= current);
  if (currentIndex === -1 || currentIndex >= SPEED_PRESETS.length - 1) {
    return SPEED_PRESETS[SPEED_PRESETS.length - 1] ?? 2;
  }
  return SPEED_PRESETS[currentIndex + 1] ?? 2;
}

export function getNextSpeedDown(current: number): number {
  const currentIndex = SPEED_PRESETS.findIndex((s) => s >= current);
  if (currentIndex <= 0) {
    return SPEED_PRESETS[0] ?? 0.25;
  }
  return SPEED_PRESETS[currentIndex - 1] ?? 0.25;
}

/**
 * Animation Shortcut Registrar Implementation
 *
 * Registers keyboard shortcuts for the animation viewer panel.
 * Shortcuts are only active when the animation panel is open.
 */

import type { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
export interface AnimationShortcutHandlers {
  onPlaybackToggle: () => void;
  onStepHalfBeatForward: () => void;
  onStepHalfBeatBackward: () => void;
  onStepFullBeatForward: () => void;
  onStepFullBeatBackward: () => void;
  onClose: () => void;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onShowHelp: () => void;
}

export interface AnimationShortcutDefinition {
  key: string;
  label: string;
  description: string;
}

export class AnimationShortcutRegistrar {
  readonly shortcuts: readonly AnimationShortcutDefinition[] = [
    {
      key: "Space",
      label: "Play / Pause",
      description: "Toggle animation playback",
    },
    {
      key: "←",
      label: "Previous Beat",
      description: "Move backward one full beat",
    },
    { key: "→", label: "Next Beat", description: "Move forward one full beat" },
    {
      key: "Shift + ←",
      label: "Half Beat Back",
      description: "Move backward half a beat",
    },
    {
      key: "Shift + →",
      label: "Half Beat Forward",
      description: "Move forward half a beat",
    },
    {
      key: "B",
      label: "Toggle Left",
      description: "Show/hide left motion path",
    },
    {
      key: "R",
      label: "Toggle Right",
      description: "Show/hide right motion path",
    },
    { key: "Esc", label: "Close", description: "Close the animation viewer" },
    { key: "?", label: "Help", description: "Show this help panel" },
  ] as const;

  register(
    service: KeyboardShortcutManager,
    handlers: AnimationShortcutHandlers
  ): () => void {
    const unregisterFns: (() => void)[] = [];

    unregisterFns.push(
      service.register({
        id: "animation.play-pause",
        label: "Play / Pause",
        description: "Toggle animation playback",
        key: "Space", // Normalized name; a raw " " never matches
        modifiers: [],
        context: "animation-panel",
        scope: "animation",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onPlaybackToggle();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.step-forward",
        label: "Step Forward",
        description: "Move forward one full beat",
        key: "ArrowRight",
        modifiers: [],
        context: "animation-panel",
        scope: "animation",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onStepFullBeatForward();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.step-backward",
        label: "Step Backward",
        description: "Move backward one full beat",
        key: "ArrowLeft",
        modifiers: [],
        context: "animation-panel",
        scope: "animation",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onStepFullBeatBackward();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.step-half-forward",
        label: "Step Half Beat Forward",
        description: "Move forward half a beat",
        key: "ArrowRight",
        modifiers: ["shift"],
        context: "animation-panel",
        scope: "animation",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onStepHalfBeatForward();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.step-half-backward",
        label: "Step Half Beat Backward",
        description: "Move backward half a beat",
        key: "ArrowLeft",
        modifiers: ["shift"],
        context: "animation-panel",
        scope: "animation",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onStepHalfBeatBackward();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.toggle-blue",
        label: "Toggle Left Motion",
        description: "Show or hide left prop motion path",
        key: "b",
        modifiers: [],
        context: "animation-panel",
        scope: "animation",
        priority: "medium",
        action: (e) => {
          e.preventDefault();
          handlers.onToggleLeft?.();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.toggle-red",
        label: "Toggle Right Motion",
        description: "Show or hide right prop motion path",
        key: "r",
        modifiers: [],
        context: "animation-panel",
        scope: "animation",
        priority: "medium",
        action: (e) => {
          e.preventDefault();
          handlers.onToggleRight?.();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.close",
        label: "Close Panel",
        description: "Close the animation viewer",
        key: "Escape",
        modifiers: [],
        context: "animation-panel",
        scope: "panel",
        priority: "high",
        action: (e) => {
          e.preventDefault();
          handlers.onClose();
        },
      })
    );

    unregisterFns.push(
      service.register({
        id: "animation.show-help",
        label: "Show Shortcuts",
        description: "Display keyboard shortcuts help",
        key: "?",
        modifiers: [],
        context: "animation-panel",
        scope: "help",
        priority: "medium",
        action: (e) => {
          e.preventDefault();
          handlers.onShowHelp();
        },
      })
    );

    return () => {
      unregisterFns.forEach((fn) => fn());
    };
  }
}

export const animationShortcutRegistrar = new AnimationShortcutRegistrar();

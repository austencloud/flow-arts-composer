/**
 * Animation Shortcut Registrar Implementation
 *
 * Registers keyboard shortcuts for the animation viewer panel.
 * Shortcuts are only active when the animation panel is open.
 */

import type { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
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
  get shortcuts(): readonly AnimationShortcutDefinition[] {
    return [
    {
      key: "Space",
      label: t("animation_shortcut_play_pause"),
      description: t("animation_shortcut_play_pause_desc"),
    },
    {
      key: "←",
      label: t("animation_shortcut_previous_beat"),
      description: t("animation_shortcut_previous_beat_desc"),
    },
    { key: "→", label: t("animation_shortcut_next_beat"), description: t("animation_shortcut_next_beat_desc") },
    {
      key: "Shift + ←",
      label: t("animation_shortcut_half_beat_back"),
      description: t("animation_shortcut_half_beat_back_desc"),
    },
    {
      key: "Shift + →",
      label: t("animation_shortcut_half_beat_forward"),
      description: t("animation_shortcut_half_beat_forward_desc"),
    },
    {
      key: "B",
      label: t("animation_shortcut_toggle_left"),
      description: t("animation_shortcut_toggle_left_desc"),
    },
    {
      key: "R",
      label: t("animation_shortcut_toggle_right"),
      description: t("animation_shortcut_toggle_right_desc"),
    },
    { key: "Esc", label: t("animation_shortcut_close"), description: t("animation_shortcut_close_desc") },
    { key: "?", label: t("animation_shortcut_help"), description: t("animation_shortcut_help_desc") },
    ];
  }

  register(
    service: KeyboardShortcutManager,
    handlers: AnimationShortcutHandlers
  ): () => void {
    const unregisterFns: (() => void)[] = [];

    unregisterFns.push(
      service.register({
        id: "animation.play-pause",
        label: t("animation_shortcut_play_pause"),
        description: t("animation_shortcut_play_pause_desc"),
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
        label: t("animation_shortcut_step_forward"),
        description: t("animation_shortcut_next_beat_desc"),
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
        label: t("animation_shortcut_step_backward"),
        description: t("animation_shortcut_previous_beat_desc"),
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
        label: t("animation_shortcut_half_beat_forward"),
        description: t("animation_shortcut_half_beat_forward_desc"),
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
        label: t("animation_shortcut_half_beat_back"),
        description: t("animation_shortcut_half_beat_back_desc"),
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
        label: t("animation_shortcut_toggle_left"),
        description: t("animation_shortcut_toggle_left_desc"),
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
        label: t("animation_shortcut_toggle_right"),
        description: t("animation_shortcut_toggle_right_desc"),
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
        label: t("animation_shortcut_close"),
        description: t("animation_shortcut_close_desc"),
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
        label: t("animation_shortcut_help"),
        description: t("animation_shortcut_help_desc"),
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

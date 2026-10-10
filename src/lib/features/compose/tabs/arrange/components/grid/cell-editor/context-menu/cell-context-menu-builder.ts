/**
 * Cell Context Menu Builder
 *
 * Builds context menu items for a composition grid cell.
 * Mirrors the full cell editor panel controls (transform, speed,
 * effects, visibility, effort) into a right-click/long-press menu.
 */

import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "#lib/shared/components/context-menu/context-menu-types.js";
import type { GridCell } from "../../../../state/arrange-grid-state.svelte";
import type {
  TransformType,
  CellEffect,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import { buildVisualSequenceSaveMenuItem } from "#lib/shared/library/services/visual-sequence-save-menu-item.js";
import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { EFFORTS } from "#lib/shared/effort/domain/effort-types.js";

// Callbacks Interface

export interface CellContextMenuCallbacks {
  onTransform: (type: TransformType, hand: "left" | "right" | "both") => void;
  onSetSpeed: (speed: number) => void;
  onSetEffect: (effect: CellEffect) => void;
  onSetTrailMode: (mode: TrailMode) => void;
  onSetLeftVisible: (visible: boolean) => void;
  onSetRightVisible: (visible: boolean) => void;
  onSetEffort: (effort: string) => void;
  onCopyCell: () => void;
  onClearCell: () => void;
  onOpenEffectMatrix?: () => void;
  onOpenEffortMatrix?: () => void;
}

// Private Builders

/** Tracks radio state for "Apply To" within a single menu build */
let currentHand: "left" | "right" | "both" = "both";

function buildTransformChildren(
  callbacks: CellContextMenuCallbacks
): ContextMenuItem[] {
  return [
    // Apply To radio group
    {
      id: "apply-to-left",
      label: "Apply To: Left",
      icon: "fa-hand",
      checked: currentHand === "left",
      keepOpen: true,
      action: () => {
        currentHand = "left";
      },
    },
    {
      id: "apply-to-both",
      label: "Apply To: Both",
      icon: "fa-hands",
      checked: currentHand === "both",
      keepOpen: true,
      action: () => {
        currentHand = "both";
      },
    },
    {
      id: "apply-to-right",
      label: "Apply To: Right",
      icon: "fa-hand",
      checked: currentHand === "right",
      keepOpen: true,
      action: () => {
        currentHand = "right";
      },
    },
    // Separator after Apply To group
    { id: "transform-sep-1", label: "", disabled: true } as ContextMenuItem,
    // Rotation
    {
      id: "rotate-45-l",
      label: "Rotate 45° L",
      icon: "fa-rotate-left",
      action: () => callbacks.onTransform("rotate45L", currentHand),
    },
    {
      id: "rotate-45-r",
      label: "Rotate 45° R",
      icon: "fa-rotate-right",
      action: () => callbacks.onTransform("rotate45R", currentHand),
    },
    // Separator
    { id: "transform-sep-2", label: "", disabled: true } as ContextMenuItem,
    // Transform operations
    {
      id: "mirror",
      label: "Mirror",
      icon: "fa-left-right",
      action: () => callbacks.onTransform("mirror", currentHand),
    },
    {
      id: "flip",
      label: "Flip",
      icon: "fa-up-down",
      action: () => callbacks.onTransform("flip", currentHand),
    },
    {
      id: "swap",
      label: "Swap",
      icon: "fa-arrow-right-arrow-left",
      action: () => callbacks.onTransform("swapHands", currentHand),
    },
    {
      id: "invert",
      label: "Invert",
      icon: "fa-arrows-spin",
      action: () => callbacks.onTransform("invert", currentHand),
    },
    {
      id: "shift-start",
      label: "Shift Start",
      icon: "fa-forward-step",
      action: () => callbacks.onTransform("shiftStart", currentHand),
    },
    {
      id: "rewind",
      label: "Rewind",
      icon: "fa-backward",
      action: () => callbacks.onTransform("rewind", currentHand),
    },
  ];
}

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0] as const;

function buildSpeedChildren(
  cell: GridCell,
  callbacks: CellContextMenuCallbacks
): ContextMenuItem[] {
  const currentSpeed = cell.speedMultiplier ?? 1.0;
  return SPEED_OPTIONS.map((speed) => ({
    id: `speed-${speed}`,
    label: `${speed}x`,
    checked: currentSpeed === speed,
    action: () => callbacks.onSetSpeed(speed),
  }));
}

function buildEffectChildren(
  cell: GridCell,
  callbacks: CellContextMenuCallbacks
): ContextMenuItem[] {
  const currentEffect = cell.effect ?? "none";
  const currentTrailMode = cell.trailMode ?? TrailMode.OFF;

  return [
    {
      id: "effect-none",
      label: "None",
      icon: "fa-ban",
      checked: currentEffect === "none",
      action: () => callbacks.onSetEffect("none"),
    },
    {
      id: "effect-fire",
      label: "Fire",
      icon: "fa-fire-flame-curved",
      iconColor: "#f97316",
      checked: currentEffect === "fire",
      action: () => callbacks.onSetEffect("fire"),
    },
    {
      id: "effect-charcoal",
      label: "Charcoal",
      icon: "fa-fire",
      iconColor: "#a855f7",
      checked: currentEffect === "charcoal",
      action: () => callbacks.onSetEffect("charcoal"),
    },
    {
      id: "effect-led",
      label: "LED",
      icon: "fa-lightbulb",
      iconColor: "#22c55e",
      checked: currentEffect === "led",
      action: () => callbacks.onSetEffect("led"),
    },
    {
      id: "effect-trails",
      label: "Trails",
      icon: "fa-route",
      checked: currentEffect === "trails",
      children: [
        {
          id: "trail-fade",
          label: "Fade",
          checked: currentTrailMode === TrailMode.FADE,
          action: () => {
            callbacks.onSetEffect("trails");
            callbacks.onSetTrailMode(TrailMode.FADE);
          },
        },
        {
          id: "trail-persistent",
          label: "Persistent",
          checked:
            currentTrailMode === TrailMode.OFF && currentEffect === "trails",
          action: () => {
            callbacks.onSetEffect("trails");
            callbacks.onSetTrailMode(TrailMode.OFF);
          },
        },
        {
          id: "trail-loop-clear",
          label: "Loop Clear",
          checked: currentTrailMode === TrailMode.LOOP_CLEAR,
          action: () => {
            callbacks.onSetEffect("trails");
            callbacks.onSetTrailMode(TrailMode.LOOP_CLEAR);
          },
        },
      ],
    },
    { id: "effect-sep", label: "", disabled: true } as ContextMenuItem,
    {
      id: "customize-effects",
      label: "Customize...",
      icon: "fa-sliders",
      action: () => callbacks.onOpenEffectMatrix?.(),
    },
  ];
}

function buildVisibilityChildren(
  cell: GridCell,
  callbacks: CellContextMenuCallbacks
): ContextMenuItem[] {
  const leftVisible = cell.leftMotionVisible !== false;
  const rightVisible = cell.rightMotionVisible !== false;

  return [
    {
      id: "vis-blue",
      label: "Left Motion",
      icon: "fa-circle",
      iconColor: "#3b82f6",
      checked: leftVisible,
      keepOpen: true,
      action: () => callbacks.onSetLeftVisible(!leftVisible),
    },
    {
      id: "vis-red",
      label: "Right Motion",
      icon: "fa-circle",
      iconColor: "#ef4444",
      checked: rightVisible,
      keepOpen: true,
      action: () => callbacks.onSetRightVisible(!rightVisible),
    },
  ];
}

function buildEffortChildren(
  cell: GridCell,
  callbacks: CellContextMenuCallbacks
): ContextMenuItem[] {
  const currentEffort = cell.effort ?? "linear";
  const items: ContextMenuItem[] = EFFORTS.map((effort) => ({
    id: `effort-${effort.id}`,
    label: effort.label,
    icon: "fa-circle",
    iconColor: effort.color,
    checked: currentEffort === effort.id,
    action: () => callbacks.onSetEffort(effort.id),
  }));

  items.push(
    { id: "effort-sep", label: "", disabled: true } as ContextMenuItem,
    {
      id: "customize-efforts",
      label: "Customize...",
      icon: "fa-sliders",
      action: () => callbacks.onOpenEffortMatrix?.(),
    }
  );

  return items;
}

// ============================================================================
// Public API
// ============================================================================

export function buildCellContextMenuItems(
  cell: GridCell,
  callbacks: CellContextMenuCallbacks
): ContextMenuEntry[] {
  const hasLayers = cell.layers.length > 0;

  const items: ContextMenuEntry[] = [];

  if (hasLayers) {
    const primarySequence = cell.layers[0]?.sequence;
    if (primarySequence) {
      items.push(buildVisualSequenceSaveMenuItem(primarySequence), {
        type: "separator" as const,
      });
    }

    items.push(
      {
        id: "transform-submenu",
        label: "Transform",
        icon: "fa-shuffle",
        children: buildTransformChildren(callbacks),
      },
      {
        id: "speed-submenu",
        label: "Speed",
        icon: "fa-gauge-high",
        children: buildSpeedChildren(cell, callbacks),
      },
      {
        id: "effects-submenu",
        label: "Effects",
        icon: "fa-wand-magic-sparkles",
        children: buildEffectChildren(cell, callbacks),
      },
      {
        id: "visibility-submenu",
        label: "Visibility",
        icon: "fa-eye",
        children: buildVisibilityChildren(cell, callbacks),
      },
      {
        id: "effort-submenu",
        label: "Effort",
        icon: "fa-gauge",
        children: buildEffortChildren(cell, callbacks),
      },
      { type: "separator" as const },
      {
        id: "copy-cell",
        label: "Copy Cell",
        icon: "fa-copy",
        action: () => callbacks.onCopyCell(),
      }
    );
  }

  items.push({
    id: "clear-cell",
    label: "Clear Cell",
    icon: "fa-trash",
    danger: true,
    disabled: !hasLayers,
    action: () => callbacks.onClearCell(),
  });

  return items;
}

/**
 * Canvas Context Menu Builder
 *
 * Reads current state from AnimationVisibilityStateManager + EffectsConfigState
 * and produces ContextMenuEntry[] for the animation canvas right-click menu.
 *
 * Submenu groups:
 *   - Visibility: Props, Step Numbers, TKA Glyph, Element, Word Header,
 *     Mandala, Paths, Progress Bar, Dark Mode (toggles, menu stays open)
 *   - Grid: Off / 8-Point / Auto (radio-style)
 *   - Playback: Continuous / Step (radio-style)
 *   - Effects: None + every effect in the shared registry (radio-style)
 *   - Effect Presets: the active effect's presets + Default (radio-style)
 *   - Trail Tracking: prop-aware end labels + Hand (when trails are active)
 *   - Efforts: the 8 effort presets from the effort domain (radio-style)
 *   - Motion Paths: Arc / Linear / Concave / Hybrid (radio-style)
 *
 * Plus: Disassemble toggle, Report Effect Issue, 3D view toggle.
 *
 * The effect list is derived from the registry (`EFFECTS`), never hand-listed —
 * a hardcoded five-item list went stale the moment the roster grew past it and
 * left the menu showing nothing checked for two thirds of the effects.
 */

import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "$lib/shared/components/context-menu/context-menu-types";
import type {
  AnimationVisibilityStateManager,
  GridMode,
} from "../../state/animation-visibility-state.svelte";
import { EFFORTS } from "$lib/shared/effort/domain/effort-types";
import { animationSettings } from "../../state/animation-settings-state.svelte";
import { fits3DViewportNow } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte";
import { TrackingMode } from "../../domain/types/trail-types";
import type { EffectType } from "../../domain/types/tip-effect-types";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { EFFECTS, getRegistration } from "../effects-panel/effect-registry";

interface CanvasContextMenuDeps {
  visibilityManager: AnimationVisibilityStateManager;
  effectsConfigState?: EffectsConfigState | null;
  disassembled?: boolean;
  onToggleDisassemble?: () => void;
  /** Captures a diagnostic snapshot of the effect pipeline state */
  captureEffectDiagnostics?: () => Record<string, unknown>;
  viewer3DState?: {
    renderMode: "2d" | "3d";
    webgl2Available: boolean;
  };
  onToggle3DView?: () => void;
}

function getActiveEffect(ecs?: EffectsConfigState | null): EffectType {
  return (ecs?.activeEffect ?? "none") as EffectType;
}

function buildEffectChildren(
  active: EffectType,
  ecs?: EffectsConfigState | null
): ContextMenuItem[] {
  const setEffect = (effect: EffectType) => {
    ecs?.setActiveEffect(effect);
  };
  return [
    {
      id: "effect-none",
      label: "None",
      icon: "fa-ban",
      checked: active === "none",
      action: () => setEffect("none"),
    },
    ...EFFECTS.map((effect) => ({
      id: `effect-${effect.id}`,
      label: effect.label,
      icon: effect.icon,
      iconColor: effect.color,
      checked: active === effect.id,
      action: () => setEffect(effect.id as EffectType),
    })),
  ];
}

/**
 * Presets for whichever effect is active. Returns [] when no effect is active
 * or the effect has no registration, so the caller can skip the whole submenu.
 */
function buildEffectPresetChildren(
  active: EffectType,
  ecs?: EffectsConfigState | null
): ContextMenuItem[] {
  if (!ecs || active === "none") return [];
  const registration = getRegistration(active);
  if (!registration) return [];

  const group = registration.presetGroup;
  const activePresetId =
    (ecs.activePresets as Record<string, string | null>)[active] ?? null;

  return [
    {
      id: "effect-preset-default",
      label: "Default",
      icon: "fa-rotate-left",
      checked: activePresetId === null,
      action: () => ecs.resetToFactory(group.effectType),
    },
    ...group.presets.map((preset) => ({
      id: `effect-preset-${preset.id}`,
      label: preset.name,
      icon: "fa-circle" as const,
      // "rainbow"/"custom" are sentinel values the chips render as gradients;
      // a menu row has one flat swatch, so those fall back to no tint.
      iconColor: preset.previewColor.startsWith("#")
        ? preset.previewColor
        : undefined,
      checked: activePresetId === preset.id,
      action: () =>
        ecs.applyPreset(
          group.effectType,
          preset.id,
          preset.resolvePatch ? preset.resolvePatch() : (preset.patch ?? {})
        ),
    })),
  ];
}

function buildEffortChildren(
  vm: AnimationVisibilityStateManager
): ContextMenuItem[] {
  const currentEffort = vm.getEffortPreset();
  return EFFORTS.map((effort) => ({
    id: `effort-${effort.id}`,
    label: effort.label,
    icon: "fa-circle",
    iconColor: effort.color,
    checked: currentEffort === effort.id,
    action: () => vm.setEffortPreset(effort.id),
  }));
}

function getTrackingLabels(): { left: string; right: string } {
  const pt = animationSettings.currentPropType?.toLowerCase() ?? "staff";
  if (pt === "staff") return { left: "Pinky", right: "Thumb" };
  if (pt === "bigclub") return { left: "Knob", right: "Bulb" };
  return { left: "End 1", right: "End 2" };
}

function buildTrailTrackingChildren(): ContextMenuItem[] {
  const current = animationSettings.trail.trackingMode;
  const labels = getTrackingLabels();
  return [
    {
      id: "trail-left-end",
      label: labels.left,
      icon: "fa-minus",
      checked: current === TrackingMode.LEFT_END,
      action: () => animationSettings.setTrackingMode(TrackingMode.LEFT_END),
    },
    {
      id: "trail-right-end",
      label: labels.right,
      icon: "fa-minus",
      checked: current === TrackingMode.RIGHT_END,
      action: () => animationSettings.setTrackingMode(TrackingMode.RIGHT_END),
    },
    {
      id: "trail-both-ends",
      label: "Both",
      icon: "fa-grip-lines",
      checked: current === TrackingMode.BOTH_ENDS,
      action: () => animationSettings.setTrackingMode(TrackingMode.BOTH_ENDS),
    },
    {
      id: "trail-hand",
      label: "Hand",
      icon: "fa-hand-back-fist",
      checked: current === TrackingMode.HAND,
      action: () => animationSettings.setTrackingMode(TrackingMode.HAND),
    },
  ];
}

// Labels match the viewer and mandala controls.
function buildPathShapeChildren(
  vm: AnimationVisibilityStateManager
): ContextMenuItem[] {
  const current = vm.getPathShape();
  const motionAware = vm.getMotionAwarePaths();
  const fixed = (shape: "arc" | "linear" | "concave") => () => {
    vm.setPathPolicy({ pathShape: shape, motionAwarePaths: false });
  };
  return [
    {
      id: "path-arc",
      label: "Arc",
      icon: "fa-bezier-curve",
      iconColor: "#60a5fa",
      checked: !motionAware && current === "arc",
      action: fixed("arc"),
    },
    {
      id: "path-linear",
      label: "Linear",
      icon: "fa-arrows-left-right",
      iconColor: "#f97316",
      checked: !motionAware && current === "linear",
      action: fixed("linear"),
    },
    {
      id: "path-concave",
      label: "Concave",
      icon: "fa-compress",
      iconColor: "#a78bfa",
      checked: !motionAware && current === "concave",
      action: fixed("concave"),
    },
    {
      id: "path-by-motion",
      label: "Hybrid",
      icon: "fa-shuffle",
      iconColor: "#2dd4bf",
      checked: motionAware,
      action: () => vm.setMotionAwarePaths(true),
    },
    {
      id: "path-explanation",
      label: "About motion paths",
      icon: "fa-circle-info",
      action: () => {
        window.open("/guide/motion-paths", "_blank", "noopener,noreferrer");
      },
    },
    ...(vm.getPathSession()
      ? [
          {
            id: "path-restore",
            label: "Restore saved paths",
            icon: "fa-rotate-left",
            disabled: !vm.getPathSession()?.preview,
            action: () => vm.restoreSavedPaths(),
          },
        ]
      : []),
  ];
}

function buildGridChildren(
  vm: AnimationVisibilityStateManager
): ContextMenuItem[] {
  const current: GridMode = vm.getGridMode();
  return [
    {
      id: "grid-none",
      label: "Off",
      icon: "fa-border-none",
      checked: current === "none",
      action: () => vm.setGridMode("none"),
    },
    {
      id: "grid-8point",
      label: "8-Point",
      icon: "fa-diamond",
      checked: current === "8point",
      action: () => vm.setGridMode("8point"),
    },
    {
      id: "grid-auto",
      label: "Auto",
      icon: "fa-wand-magic",
      checked: current === "auto",
      action: () => vm.setGridMode("auto"),
    },
  ];
}

function buildPlaybackChildren(
  vm: AnimationVisibilityStateManager
): ContextMenuItem[] {
  const current = vm.getPlaybackMode();
  return [
    {
      id: "playback-continuous",
      label: "Continuous",
      icon: "fa-play",
      checked: current === "continuous",
      action: () => vm.setPlaybackMode("continuous"),
    },
    {
      id: "playback-step",
      label: "Step",
      icon: "fa-forward-step",
      checked: current === "step",
      action: () => vm.setPlaybackMode("step"),
    },
  ];
}

function buildVisibilityChildren(
  vm: AnimationVisibilityStateManager
): ContextMenuItem[] {
  const settings = vm.getSettings();
  // One color-agnostic Paths toggle, matching DisplayPanel's chip: the
  // per-color keys survive underneath, this sets both.
  const pathLinesOn = settings.leftPathLines || settings.rightPathLines;
  return [
    {
      id: "vis-props",
      label: "Props",
      icon: "fa-wand-sparkles",
      checked: settings.props,
      keepOpen: true,
      action: () => vm.toggleVisibility("props"),
    },
    {
      id: "vis-step-numbers",
      label: "Step Numbers",
      icon: "fa-list-ol",
      checked: settings.stepNumbers,
      keepOpen: true,
      action: () => vm.toggleVisibility("stepNumbers"),
    },
    {
      id: "vis-tka-glyph",
      label: "TKA Glyph",
      icon: "fa-font",
      checked: settings.tkaGlyph,
      keepOpen: true,
      action: () => vm.toggleVisibility("tkaGlyph"),
    },
    {
      id: "vis-elemental-glyph",
      label: "Element",
      icon: "fa-fire-flame-curved",
      checked: settings.elementalGlyph,
      keepOpen: true,
      action: () => vm.toggleVisibility("elementalGlyph"),
    },
    {
      id: "vis-word-header",
      label: "Word Header",
      icon: "fa-heading",
      checked: settings.wordHeader,
      keepOpen: true,
      action: () => vm.toggleVisibility("wordHeader"),
    },
    {
      id: "vis-mandala",
      label: "Mandala",
      icon: "fa-draw-polygon",
      checked: settings.mandala,
      keepOpen: true,
      action: () => vm.toggleVisibility("mandala"),
    },
    {
      id: "vis-path-lines",
      label: "Paths",
      icon: "fa-route",
      checked: pathLinesOn,
      keepOpen: true,
      action: () => {
        vm.setVisibility("leftPathLines", !pathLinesOn);
        vm.setVisibility("rightPathLines", !pathLinesOn);
      },
    },
    {
      id: "vis-progress-bar",
      label: "Progress Bar",
      icon: "fa-bars-progress",
      checked: settings.progressBar,
      keepOpen: true,
      action: () => vm.toggleVisibility("progressBar"),
    },
    {
      id: "vis-dark-mode",
      label: "Dark Mode",
      icon: "fa-moon",
      checked: settings.darkMode,
      keepOpen: true,
      action: () => vm.toggleDarkMode(),
    },
  ];
}

export function buildCanvasContextMenuItems(
  deps: CanvasContextMenuDeps
): ContextMenuEntry[] {
  const vm = deps.visibilityManager;
  const ecs = deps.effectsConfigState;
  const active = getActiveEffect(ecs);

  const items: ContextMenuEntry[] = [
    // Visibility toggles submenu
    {
      id: "visibility-submenu",
      label: "Visibility",
      icon: "fa-eye",
      children: buildVisibilityChildren(vm),
    },
    // Grid mode submenu
    {
      id: "grid-submenu",
      label: "Grid",
      icon: "fa-border-all",
      children: buildGridChildren(vm),
    },
    // Playback mode submenu
    {
      id: "playback-submenu",
      label: "Playback",
      icon: "fa-circle-play",
      children: buildPlaybackChildren(vm),
    },
    { type: "separator" as const },
    // Effects submenu
    {
      id: "effects-submenu",
      label: "Effects",
      icon: "fa-wand-magic-sparkles",
      children: buildEffectChildren(active, ecs),
    },
  ];

  // Presets for the active effect — the same looks the effects panel offers,
  // reachable without opening it.
  const presetChildren = buildEffectPresetChildren(active, ecs);
  if (presetChildren.length > 0) {
    items.push({
      id: "effect-presets-submenu",
      label: "Effect Presets",
      icon: "fa-swatchbook",
      children: presetChildren,
    });
  }

  // Show trail tracking submenu when trails are active
  if (active === "trails") {
    items.push({
      id: "trail-tracking-submenu",
      label: "Trail Tracking",
      icon: "fa-route",
      children: buildTrailTrackingChildren(),
    });
  }

  items.push(
    {
      id: "efforts-submenu",
      label: "Efforts",
      icon: "fa-gauge",
      children: buildEffortChildren(vm),
    },
    {
      id: "path-shape-submenu",
      label: "Motion Paths",
      icon: "fa-draw-polygon",
      children: buildPathShapeChildren(vm),
    },
    { type: "separator" as const }
  );

  if (deps.onToggleDisassemble) {
    items.push({
      id: "toggle-disassemble",
      label: deps.disassembled ? "Reassemble" : "Disassemble",
      icon: deps.disassembled ? "fa-compress" : "fa-table-columns",
      action: () => deps.onToggleDisassemble!(),
    });
  }

  // Show "Report Effect Issue" when any effect is active
  if (active !== "none" && deps.captureEffectDiagnostics) {
    const captureFn = deps.captureEffectDiagnostics;
    items.push(
      { type: "separator" as const },
      {
        id: "report-effect-issue",
        label: "Report Effect Issue",
        icon: "fa-bug",
        iconColor: "#ef4444",
        action: async () => {
          const snapshot = captureFn();
          const json = JSON.stringify(snapshot, null, 2);
          try {
            await navigator.clipboard.writeText(json);
            console.log(
              "[EffectDiagnostics] Snapshot copied to clipboard:",
              snapshot
            );
          } catch {
            // Clipboard may fail in non-secure contexts
            console.log(
              "[EffectDiagnostics] Snapshot (copy failed, logged here):",
              json
            );
          }
        },
      }
    );
  }

  if (
    deps.viewer3DState?.webgl2Available &&
    deps.onToggle3DView &&
    fits3DViewportNow()
  ) {
    items.push({ type: "separator" as const });
    items.push({
      id: "toggle-3d-view",
      label:
        deps.viewer3DState.renderMode === "3d"
          ? "Exit 3D View"
          : "Enter 3D View",
      icon: "fa-cube",
      action: deps.onToggle3DView,
    });
  }

  return items;
}

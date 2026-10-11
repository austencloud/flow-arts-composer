import { cubicOut } from "svelte/easing";
import { DURATION } from "#lib/shared/transitions/transitions.js";

export type WorkerMoveHandleWorldPosition = readonly [
  x: number,
  y: number,
  z: number,
];

export interface WorkerMoveHandleSnapshot {
  position: { x: number; z: number };
  groundY: number;
  selectedCount: number;
  dragging: boolean;
  hovered: boolean;
  focusVisible: boolean;
  visible: boolean;
  reducedMotion: boolean;
  /** Linear Svelte transition progress from zero to one. */
  entranceProgress: number;
}

export interface WorkerMoveHandleGeometry {
  worldPosition: WorkerMoveHandleWorldPosition;
  projection: "screen-space-html";
  centered: true;
  sprite: true;
  minWidthPx: 48;
  minHeightPx: 48;
  paddingBlockRem: 0;
  paddingInlineRem: 0.875;
  borderWidthPx: 1;
  borderRadiusPx: 999;
  gapRem: 0.5;
  iconWidthRem: 1;
}

export interface WorkerMoveHandleMaterial {
  borderColor: string;
  background: string;
  color: string;
  boxShadow: string;
  outline: string | null;
  outlineOffsetPx: 3 | null;
  cursor: "grab" | "grabbing";
  transition: string;
}

export interface WorkerMoveHandlePresentation {
  visible: boolean;
  label: string;
  accessibleLabel: string;
  title: string;
  icon: {
    classes: readonly ["fas", "fa-arrows-up-down-left-right"];
    glyph: "\uf047";
    ariaHidden: true;
  };
  geometry: WorkerMoveHandleGeometry;
  material: WorkerMoveHandleMaterial;
  typography: {
    font: "inherit";
    fontSize: "max(14px, var(--font-size-min, 0.875rem))";
    fontWeight: 700;
    lineHeight: 1;
    whiteSpace: "nowrap";
  };
  motion: {
    durationMs: number;
    opacity: number;
    scale: number;
  };
  interaction: {
    buttonType: "button";
    pointerEvents: "auto";
    touchAction: "none";
    userSelect: "none";
    lostPointerCaptureCancels: true;
    preventContextMenu: true;
    preventNativeDrag: true;
  };
}

export interface WorkerMoveHandleOwner {
  readonly current: WorkerMoveHandlePresentation | null;
  update(
    snapshot: WorkerMoveHandleSnapshot
  ): WorkerMoveHandlePresentation | null;
  dispose(): void;
}

const IDLE_BORDER = "var(--theme-accent, #8b5cf6)";
const IDLE_BACKGROUND = "var(--theme-panel-bg, rgba(0, 0, 0, 0.82))";
const IDLE_TEXT = "var(--theme-text, #fff)";
const ACTIVE_COLOR = "var(--theme-accent-text, #a78bfa)";
const ACTIVE_BACKGROUND = "var(--theme-card-hover-bg, rgba(24, 20, 40, 0.94))";
const BOX_SHADOW =
  "0 0 0 1px rgba(0, 0, 0, 0.5), 0 0.4rem 1.1rem rgba(0, 0, 0, 0.42)";
const VISUAL_TRANSITION =
  "border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast)";

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function presentation(
  snapshot: WorkerMoveHandleSnapshot
): WorkerMoveHandlePresentation {
  const multiple = snapshot.selectedCount !== 1;
  const label = multiple ? `Move ${snapshot.selectedCount}` : "Move character";
  const accessibleLabel = multiple
    ? `Move ${snapshot.selectedCount} selected characters`
    : "Move selected character";
  const active = snapshot.hovered || snapshot.focusVisible;
  const progress = snapshot.reducedMotion
    ? 1
    : cubicOut(clampUnit(snapshot.entranceProgress));

  return {
    visible: snapshot.visible,
    label,
    accessibleLabel,
    title: accessibleLabel,
    icon: {
      classes: ["fas", "fa-arrows-up-down-left-right"],
      glyph: "\uf047",
      ariaHidden: true,
    },
    geometry: {
      worldPosition: [
        snapshot.position.x,
        snapshot.groundY + 0.08,
        snapshot.position.z,
      ],
      projection: "screen-space-html",
      centered: true,
      sprite: true,
      minWidthPx: 48,
      minHeightPx: 48,
      paddingBlockRem: 0,
      paddingInlineRem: 0.875,
      borderWidthPx: 1,
      borderRadiusPx: 999,
      gapRem: 0.5,
      iconWidthRem: 1,
    },
    material: {
      borderColor: active ? ACTIVE_COLOR : IDLE_BORDER,
      background: active ? ACTIVE_BACKGROUND : IDLE_BACKGROUND,
      color: active ? ACTIVE_COLOR : IDLE_TEXT,
      boxShadow: BOX_SHADOW,
      outline: snapshot.focusVisible ? `2px solid ${ACTIVE_COLOR}` : null,
      outlineOffsetPx: snapshot.focusVisible ? 3 : null,
      cursor: snapshot.dragging ? "grabbing" : "grab",
      transition: snapshot.reducedMotion ? "none" : VISUAL_TRANSITION,
    },
    typography: {
      font: "inherit",
      fontSize: "max(14px, var(--font-size-min, 0.875rem))",
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
    },
    motion: {
      durationMs: snapshot.reducedMotion ? 0 : DURATION.fast,
      opacity: progress,
      scale: 0.8 + 0.2 * progress,
    },
    interaction: {
      buttonType: "button",
      pointerEvents: "auto",
      touchAction: "none",
      userSelect: "none",
      lostPointerCaptureCancels: true,
      preventContextMenu: true,
      preventNativeDrag: true,
    },
  };
}

/**
 * The production handle is an accessible DOM button projected over the scene,
 * not a Three.js object. This owner keeps its exact visual contract clone-safe
 * so the same app-thread overlay can sit above either renderer. Turning it into
 * a canvas sprite would silently lose keyboard focus, theme inheritance, and
 * the browser's text metrics.
 */
export function createWorkerMoveHandleOwner(
  initial: WorkerMoveHandleSnapshot
): WorkerMoveHandleOwner {
  let disposed = false;
  let current: WorkerMoveHandlePresentation | null = presentation(initial);

  return {
    get current() {
      return current;
    },
    update(snapshot) {
      if (disposed) return null;
      current = presentation(snapshot);
      return current;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      current = null;
    },
  };
}

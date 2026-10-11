import type { TipPoint } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";

/**
 * Describes how a visual effect behaves in the Effects Lab editor.
 * Shared components use this to adapt their UI (colors, labels)
 * without knowing the specific effect type.
 */
export interface EffectDescriptor {
  /** Unique ID for persistence and routing */
  id: string;
  /** Display label */
  label: string;
  /** FontAwesome icon class */
  icon: string;
  /** Primary accent color (hex) */
  accentColor: string;
  /** Mid-opacity accent for backgrounds (rgba) */
  accentColorMid: string;
  /** Border accent (rgba) */
  accentColorBorder: string;
  /** Create a new point at the given coordinates */
  createPoint(dx: number, dy: number): TipPoint;
  /** Load default points for a prop type from the unified registry */
  getDefaultPoints(propType: string): TipPoint[];
}

export type EffectMode = "trails" | "fire" | "charcoal" | "led";

const sharedCreatePoint = (dx: number, dy: number): TipPoint => ({ dx, dy });
const sharedGetDefaultPoints = (propType: string): TipPoint[] =>
  getTipPoints(propType).points;

export const FIRE_DESCRIPTOR: EffectDescriptor = {
  id: "fire",
  label: "Fire",
  icon: "fas fa-fire",
  accentColor: "#f97316",
  accentColorMid: "rgba(249, 115, 22, 0.15)",
  accentColorBorder: "rgba(249, 115, 22, 0.3)",
  createPoint: sharedCreatePoint,
  getDefaultPoints: sharedGetDefaultPoints,
};

export const LED_DESCRIPTOR: EffectDescriptor = {
  id: "led",
  label: "LED",
  icon: "fas fa-lightbulb",
  accentColor: "#00ff88",
  accentColorMid: "rgba(0, 255, 136, 0.15)",
  accentColorBorder: "rgba(0, 255, 136, 0.3)",
  createPoint: sharedCreatePoint,
  getDefaultPoints: sharedGetDefaultPoints,
};

export const TRAILS_DESCRIPTOR: EffectDescriptor = {
  id: "trails",
  label: "Trails",
  icon: "fas fa-wind",
  accentColor: "#3b82f6",
  accentColorMid: "rgba(59, 130, 246, 0.15)",
  accentColorBorder: "rgba(59, 130, 246, 0.3)",
  createPoint: sharedCreatePoint,
  getDefaultPoints: () => [],
};

export const CHARCOAL_DESCRIPTOR: EffectDescriptor = {
  id: "charcoal",
  label: "Charcoal",
  icon: "fas fa-meteor",
  accentColor: "#f59e0b",
  accentColorMid: "rgba(245, 158, 11, 0.15)",
  accentColorBorder: "rgba(245, 158, 11, 0.3)",
  createPoint: sharedCreatePoint,
  getDefaultPoints: sharedGetDefaultPoints,
};

/** All registered effect descriptors, in display order */
export const EFFECT_DESCRIPTORS: EffectDescriptor[] = [
  TRAILS_DESCRIPTOR,
  FIRE_DESCRIPTOR,
  CHARCOAL_DESCRIPTOR,
  LED_DESCRIPTOR,
];

/** Look up a descriptor by ID */
export function getEffectDescriptor(id: string): EffectDescriptor {
  return EFFECT_DESCRIPTORS.find((d) => d.id === id) ?? TRAILS_DESCRIPTOR;
}

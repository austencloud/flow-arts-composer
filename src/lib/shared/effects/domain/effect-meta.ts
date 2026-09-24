/**
 * Shared effect metadata. Single source of truth for id/label/icon/color
 * across the unified EffectsPanel (sidebar/strip/grid layouts), EffectSelector,
 * and the domain layer (e.g. presentation-intent summaries). Lives in
 * effects/domain rather than the effects-panel component so pure domain code
 * can read effect labels without pulling in the panel's preset modules and
 * HMR helper.
 */

export interface EffectMeta {
  readonly id: string;
  readonly label: string;
  readonly icon: `fa-${string}`;
  readonly color: `#${string}`;
  /** Show this effect's coven in the hub. Defaults to true when omitted. */
  readonly ready3d?: boolean;
  /** GLB path for the coven stage; omitted → stone-disc platform. */
  readonly stageModel?: string;
  /** Acolyte skin id; omitted → default avatar. (Deferred capability.) */
  readonly skin?: string;
}

export const EFFECTS: readonly EffectMeta[] = [
  { id: "trails", label: "Trails", icon: "fa-route", color: "#60a5fa" },
  { id: "fire", label: "Fire", icon: "fa-fire", color: "#f97316" },
  { id: "led", label: "LED", icon: "fa-lightbulb", color: "#22c55e" },
  { id: "charcoal", label: "Coal", icon: "fa-diamond", color: "#a855f7" },
  { id: "zap", label: "Zap", icon: "fa-bolt", color: "#38bdf8" },
  { id: "sparkles", label: "Sparkle", icon: "fa-star", color: "#fbbf24" },
  { id: "ghost", label: "Ghost", icon: "fa-ghost", color: "#22d3ee" },
  { id: "bloom", label: "Bloom", icon: "fa-sun", color: "#f472b6" },
  { id: "goo", label: "Goo", icon: "fa-droplet", color: "#3a7fd9" },
  { id: "bubbles", label: "Bubbles", icon: "fa-circle-notch", color: "#c8e0ff" },
  { id: "petals", label: "Petals", icon: "fa-leaf", color: "#ffc0d8" },
  { id: "smoke", label: "Smoke", icon: "fa-smog", color: "#c0c0c8" },
  { id: "ink", label: "Ink", icon: "fa-paint-brush", color: "#b8956a" },
  // frost: retired from the roster (Animal took its slot). Its config,
  // renderer, and preset/customize map entries stay dormant — deletion tracked
  // in a follow-up spec. Registration loops over EFFECTS, so dropping it here
  // unregisters the chip without touching the dormant code.
  { id: "silk", label: "Silk", icon: "fa-wind", color: "#c0c0d0" },
  { id: "animal", label: "Animal", icon: "fa-dragon", color: "#3aa655" },
  { id: "pulse", label: "Pulse", icon: "fa-bullseye", color: "#38bdf8" },
] as const;

export const EFFECT_COLORS: Record<string, string> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e.color]),
);

export const EFFECT_LABELS: Record<string, string> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e.label]),
);

export const EFFECT_ICONS: Record<string, string> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e.icon]),
);

type RegisteredEffectId =
  (typeof import("#lib/shared/animation-engine/components/effects-panel/effect-registry.js"))["EFFECTS"][number]["id"];

export type EffectActivationStrategy = "scene-pooled" | "rig-preallocated";

/**
 * Every visible effect must have all CPU objects, GPU resources, and optional
 * model assets prepared before the 3D loading curtain opens. This exhaustive
 * map makes a newly registered effect fail typecheck until it chooses an owner.
 */
export const EFFECT_ACTIVATION_READINESS = {
  trails: "rig-preallocated",
  fire: "scene-pooled",
  led: "rig-preallocated",
  charcoal: "scene-pooled",
  zap: "rig-preallocated",
  sparkles: "scene-pooled",
  ghost: "rig-preallocated",
  bloom: "scene-pooled",
  goo: "scene-pooled",
  bubbles: "scene-pooled",
  petals: "scene-pooled",
  smoke: "scene-pooled",
  ink: "scene-pooled",
  silk: "scene-pooled",
  animal: "scene-pooled",
  pulse: "scene-pooled",
} as const satisfies Record<RegisteredEffectId, EffectActivationStrategy>;

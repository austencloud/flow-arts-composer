import type { EffectType } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

/** Effects reproduced by the scene-wide renderer already running in the worker. */
export const WORKER_POOLED_EFFECTS = [
  "sparkles",
  "goo",
  "bubbles",
  "petals",
  "smoke",
  "ink",
  "silk",
  "animal",
  "pulse",
  "bloom",
  "fire",
  "charcoal",
] as const satisfies readonly EffectType[];

/** Effects whose exact renderer lifecycle is owned by this worker adapter. */
export const WORKER_IMPERATIVE_EFFECTS = [
  "trails",
  "led",
] as const satisfies readonly EffectType[];

/**
 * These effects still depend on a Svelte/Threlte scene component or have no
 * production 3D renderer. Keeping the list explicit prevents the worker from
 * silently replacing one of them with a different look.
 */
export const WORKER_UNSUPPORTED_EFFECTS = [
  "zap",
  "ghost",
  "frost",
] as const satisfies readonly EffectType[];

const supported = new Set<EffectType>([
  "none",
  ...WORKER_POOLED_EFFECTS,
  ...WORKER_IMPERATIVE_EFFECTS,
]);

export function isWorkerEffectExact(effect: EffectType): boolean {
  return supported.has(effect);
}

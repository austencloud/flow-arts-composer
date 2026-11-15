/**
 * What a Single-mode LOOP pick writes when the current length can't hold it.
 *
 * The LOOP panel applies a Single pick the moment it is made. Until
 * 2026-11-14 a pick the length couldn't split (Quartered at 14 steps, say) was
 * only shown, never written, so closing the panel with X threw it away and the
 * card went back to Halved. Austen: "it saves it as halved because it thinks I
 * just cancelled out what I said." Now the thing just picked wins and the rest
 * of the recipe gives way, as little as it can:
 *
 * - A component pick bends the leftover rhythm to the length first, the same
 *   relaxing a length change does (fitLoopRhythmToLength).
 * - A rhythm pick, or a component that no rhythm can fit, keeps the pick and
 *   moves the length to the nearest one that works.
 */
import {
  type LOOPType,
  Period,
  ROTATED_LOOP_TYPES,
} from "../circular/domain/models/circular-models";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";
import {
  parseLoopComponents,
  type LoopRhythm,
} from "#lib/shared/create/services/loop-type-utils.js";
import {
  fitLengthToLoopRhythm,
  fitLoopRhythmToLength,
  gateRhythm,
} from "#lib/shared/create/services/loop-rhythm-gating.js";
import { deriveLoopMinOverride } from "../shared/services/card-configurator";

export interface LoopPick {
  loopType: LOOPType;
  /** The rhythm the person just picked. Absent for a component pick. */
  rhythm?: Partial<LoopRhythm>;
}

export type LoopPickFields = Pick<
  UIGenerationConfig,
  | "loopType"
  | "loopEnabled"
  | "period"
  | "inversionInterval"
  | "inversionMode"
  | "reflectionAxis"
  | "length"
>;

function rhythmOf(fields: LoopPickFields): LoopRhythm {
  return {
    rotationInterval: fields.period === Period.QUARTERED ? 4 : 2,
    inversionInterval: fields.inversionInterval ?? 2,
    inversionMode: fields.inversionMode ?? "expand",
    reflectionAxis: fields.reflectionAxis,
  };
}

/**
 * The fields to write for this pick, or null when no length inside
 * [the LOOP's minimum, maxLength] can hold it.
 */
export function resolveLoopPick(
  config: UIGenerationConfig,
  pick: LoopPick,
  maxLength: number
): LoopPickFields | null {
  const rhythm = pick.rhythm ?? {};
  let period: string = rhythm.rotationInterval
    ? rhythm.rotationInterval === 4
      ? Period.QUARTERED
      : Period.HALVED
    : config.period;
  // Only rotation has a quarter turn; a LOOP without it drops a leftover
  // Quartered, as the card's own type change does.
  if (!ROTATED_LOOP_TYPES.has(pick.loopType) && period === Period.QUARTERED) {
    period = Period.HALVED;
  }

  const next: LoopPickFields = {
    loopType: pick.loopType,
    loopEnabled: true,
    period,
    inversionInterval: rhythm.inversionInterval ?? config.inversionInterval,
    inversionMode: rhythm.inversionMode ?? config.inversionMode,
    reflectionAxis: rhythm.reflectionAxis ?? config.reflectionAxis,
    length: config.length,
  };
  const components = parseLoopComponents(pick.loopType);
  if (gateRhythm(components, rhythmOf(next), next.length).ok) return next;

  if (!pick.rhythm) {
    const relaxed = fitLoopRhythmToLength(
      components,
      rhythmOf(next),
      next.length
    );
    if (relaxed) {
      return {
        ...next,
        period: components.has(LOOPComponent.ROTATED)
          ? relaxed.rhythm.rotationInterval === 4
            ? Period.QUARTERED
            : Period.HALVED
          : next.period,
        inversionInterval: components.has(LOOPComponent.INVERTED)
          ? (relaxed.rhythm.inversionInterval ?? next.inversionInterval)
          : next.inversionInterval,
      };
    }
  }

  const minLength = deriveLoopMinOverride({ ...config, ...next }, true) ?? 4;
  const length = fitLengthToLoopRhythm(components, rhythmOf(next), next.length, {
    min: minLength,
    max: maxLength,
  });
  return length === null ? null : { ...next, length };
}

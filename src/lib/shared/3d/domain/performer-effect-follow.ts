/**
 * When a performer follows the scene's effect and when it keeps its own.
 *
 * A performer's own effect beats the shared one (performer-tip-effect-map.ts),
 * so with a single performer the two pickers (viewer tray, performer hub)
 * would drift apart once the hub wrote an effect of its own. These two rules
 * keep one answer on screen whenever there is only one performer to ask.
 */
import type { EffectType } from "#lib/shared/effects/domain/effects-config";

/** What a performer stores about its own effect. */
export interface OwnEffectSource {
  rawEffect: EffectType | null | undefined;
  rawHandEffects: { left: EffectType; right: EffectType } | null | undefined;
}

/**
 * Where a pick in the hub's Effects list is written. The Director's sink owns
 * its performers' state, so it always keeps the per-performer write.
 */
export function hubEffectWrite(
  performerCount: number,
  hasSink: boolean
): "shared" | "performer" {
  return performerCount === 1 && !hasSink ? "shared" : "performer";
}

/** True when the performer carries an effect (even "none") or a hand pair. */
export function performerHasOwnEffect(source: OwnEffectSource): boolean {
  return (
    (source.rawEffect !== null && source.rawEffect !== undefined) ||
    (source.rawHandEffects !== null && source.rawHandEffects !== undefined)
  );
}

export function countOwnEffects(sources: readonly OwnEffectSource[]): number {
  return sources.filter(performerHasOwnEffect).length;
}

/** A tray pick reaches a lone performer by dropping that performer's own effect. */
export function trayPickClearsOwnEffect(
  performerCount: number,
  hasOwnEffect: boolean
): boolean {
  return performerCount === 1 && hasOwnEffect;
}

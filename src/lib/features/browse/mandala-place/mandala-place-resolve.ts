/**
 * What the By mandala place shows for an address, given how far Browse has
 * got with its pool.
 *
 * Browse's pool arrives in stages (a first page or the saved copy, then the
 * rest, then the T&D alphabet), and the climb builds families after each.
 * A family that only the whole pool holds does not exist after the first
 * stage, so "no family holds this value" means something only once the
 * families are final for the complete pool (`settled`). Until then:
 *
 * - the page keeps its loading state instead of falling back to the wall;
 * - the list and the step boxes wait, so what a person sees never changes;
 * - the hero draws at once from the value's own shape, which the index knows
 *   as soon as that shape is measured (a value is `<shape key>~<sequence id>`,
 *   naming the family's representative).
 */
import type { MandalaGroup } from "#lib/shared/browse/services/mandala-index.svelte.js";
import {
  parseMandalaFamilyValue,
  type MandalaClimbFamily,
} from "#lib/shared/browse/services/mandala-climb.svelte.js";

export interface MandalaPlaceView {
  /** The family the page shows: final once settled, a hero-only stand-in before. */
  family: MandalaClimbFamily | null;
  /** The family's place in the climb; -1 until settled or when none holds it. */
  familyIndex: number;
  /** True when the address names nothing in the final families: go to the wall. */
  backToWall: boolean;
}

export function resolveMandalaPlace(input: {
  value: string | null;
  settled: boolean;
  families: readonly MandalaClimbFamily[];
  familyOf: (value: string) => MandalaClimbFamily | undefined;
  groupOf: (key: string) => MandalaGroup | undefined;
}): MandalaPlaceView {
  const { value, settled, families } = input;
  if (!value) return { family: null, familyIndex: -1, backToWall: false };

  if (settled) {
    const family = input.familyOf(value);
    const familyIndex = family ? families.indexOf(family) : -1;
    return familyIndex >= 0
      ? { family: families[familyIndex]!, familyIndex, backToWall: false }
      : { family: null, familyIndex: -1, backToWall: true };
  }

  // Not final yet: only the hero, from the value's own shape. Its id is the
  // shape's key, which is the final family's id when the value names that
  // family's representative, so the hero does not redraw when it settles.
  const { key } = parseMandalaFamilyValue(value);
  const group = key ? input.groupOf(key) : undefined;
  if (!group) return { family: null, familyIndex: -1, backToWall: false };
  const standIn: MandalaClimbFamily = {
    id: group.key,
    value,
    representative: group,
    members: [group],
    sequenceCount: group.sequences.length,
  };
  return { family: standIn, familyIndex: -1, backToWall: false };
}

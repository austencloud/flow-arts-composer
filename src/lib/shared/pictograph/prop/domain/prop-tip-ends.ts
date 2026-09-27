import { PropType } from "./enums/prop-type";
import { basePropTypeOfRenderKey } from "./prop-look";

/**
 * Props with TWO mirror-symmetric tracked ends — both prop tips trace a tip
 * path in the mandala. Everything else is single-ended: one weighted/grip tip.
 *
 * The staff family is the canonical two-ended prop; buugeng (S-staff), big
 * chicken, big club, doublestar, eightrings, and double contact ball are the
 * other twin-ended, point-symmetric families. As with the chicken family, only
 * the BIG variant is bilateral: regular (small) club and chicken are
 * single-ended — one weighted/grip tip — while big club and big chicken present
 * two symmetric ends (both listed in BIG_BILATERAL_PROPS in
 * prop-classification.ts). Fans, triads, hoops, hands, swords, etc. trace a
 * single tip. Add a prop here only if it genuinely presents two symmetric ends
 * to track.
 *
 * The energy pair splits the same way its parents do: Energy Staff belongs
 * here, Energy Saber does not. Leaving Energy Saber out is load-bearing — the
 * default below is 2, so an omitted single-blade prop would quietly trace a
 * phantom second tip out the back of the hilt.
 */
const TWO_ENDED_PROPS: ReadonlySet<PropType> = new Set([
  PropType.STAFF,
  PropType.SIMPLESTAFF,
  PropType.BIGSTAFF,
  PropType.STAFF2,
  PropType.CAPSULE_BATON,
  PropType.FIRE_DOUBLE_STAFF,
  PropType.ENERGY_STAFF,
  PropType.BUUGENG,
  PropType.BIGBUUGENG,
  PropType.BIGCLUB,
  PropType.BIGCHICKEN,
  PropType.DOUBLESTAR,
  PropType.BIGDOUBLESTAR,
  PropType.EIGHTRINGS,
  PropType.BIGEIGHTRINGS,
  PropType.DOUBLECONTACTBALL,
  PropType.BIGDOUBLECONTACTBALL,
]);

/**
 * How many prop tips the mandala traces for a prop: 2 = staff-like (both ends),
 * 1 = club-like (one end). Undefined defaults to 2 — staff is TKA's canonical
 * prop, so an unspecified prop keeps the historical two-tip render. A render
 * key (`bigclub__model`, `fan__lotus`) counts as the prop it draws.
 */
export function propTipEnds(propType: PropType | string | undefined): 1 | 2 {
  if (!propType) return 2;
  return TWO_ENDED_PROPS.has(basePropTypeOfRenderKey(propType) as PropType)
    ? 2
    : 1;
}

/**
 * Tip count for a blue/red hand pair. The geometry calculator applies one tip
 * count to BOTH hands, so a pair is two-ended if EITHER hand carries a
 * two-ended prop (the staff hand's second tip is preserved; a same-prop pair —
 * two clubs or two staves — resolves cleanly to 1 or 2).
 */
export function pairTipEnds(
  left: PropType | string | undefined,
  right: PropType | string | undefined
): 1 | 2 {
  return propTipEnds(left) === 2 || propTipEnds(right) === 2 ? 2 : 1;
}

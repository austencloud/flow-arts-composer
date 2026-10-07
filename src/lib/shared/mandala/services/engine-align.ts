import { MANDALA_GRID_RADIUS, ENGINE_GRID_RADIUS } from "../domain/mandala-constants";

/** The animation engine's square viewBox, and the hand orbit radius within it. */
const ENGINE_VIEWBOX = 950;
const ENGINE_HAND_RADIUS = 150;

/**
 * Scale factor that makes a mandala's hand circle line up with the animation
 * engine's hand orbit when the two are stacked in the SAME box.
 *
 * They disagree by construction. The mandala renderer fits its own full extent
 * to its box — `renderScale = size/2 / ((GRID_RADIUS + tipReach) * 1.05)` — so
 * its hand circle lands at whatever fraction is left over once the tips are
 * accounted for, and that fraction MOVES with tipDx. The engine has no such
 * rule: its hand orbit is a fixed 150/950 of the viewBox regardless of prop.
 *
 * So a mandala overlaid at native size reads as a larger, differently-sized
 * orbit than the prop in front of it actually traces. For a staff (dx 126.4)
 * it comes out ~1.6x too big. Multiplying by this factor cancels the mandala's
 * self-fitting and pins its hand circle to the engine's.
 *
 * `dx` cancels out of the tip radius itself; it survives only through the
 * extent the mandala fitted itself to, which is exactly what we're undoing.
 *
 * A joined mandala fits its own extent plus how far the pair reaches past one
 * figure (`joinReach`, from `mandalaJoinReach`), so the same reach is undone
 * here and each hand's figure stays on its own grid's hand orbit.
 *
 * Only for OVERLAYS. A standalone mandala should keep filling its own box.
 */
export function engineAlignScale(tipDx: number, joinReach = 0): number {
  const tipReach = (tipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
  const maxExtent = MANDALA_GRID_RADIUS + tipReach + joinReach;
  const mandalaHandFraction = MANDALA_GRID_RADIUS / (2 * maxExtent * 1.05);
  const engineHandFraction = ENGINE_HAND_RADIUS / ENGINE_VIEWBOX;
  return engineHandFraction / mandalaHandFraction;
}

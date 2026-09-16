/**
 * Start-Orientation Register
 *
 * A "register" picks the per-hand start orientation a deck card is re-seeded to.
 * The resolved orientation pair is FAMILY-AWARE: alpha / beta / gamma each get a
 * different natural pair per register, because the comfortable nonradial
 * orientation for a hand depends on where the hands sit relative to each other.
 *
 * Pairs are { blue, red } = { left hand, right hand } (TKA convention).
 *
 * | register   | alpha          | beta           | gamma          |
 * |------------|----------------|----------------|----------------|
 * | radial     | in   | in      | in   | in      | in   | in      |
 * | split(mix) | in   | counter | in   | clock   | in   | counter |
 * | nonradial  | clock| counter | counter| clock | clock| counter |
 *
 * Pure module — no sequence-engine / firebase deps, so it loads in unit tests
 * (unlike deck-variation.ts). deck-variation re-exports for backward compat.
 */
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { Orientation, HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

export type StartOriMode = "radial" | "nonradial" | "split";
export type PlacementFamily = "alpha" | "beta" | "gamma";

/**
 * Classify a start pose into its placement family. Prefers the stored placement
 * name, falling back to deriving it from the hand locations (robust to stale or
 * missing placement fields). Returns null for unsupported families
 * (zeta/eta/skewed) — callers leave those at the radial default.
 */
export function placementFamilyOf(sp: StartPlacementData): PlacementFamily | null {
  let pos: string | null =
    (sp.gridPlacement ?? sp.startPlacement ?? sp.endPlacement ?? null) as string | null;

  if (!pos) {
    const left = sp.motions?.[HandSide.LEFT];
    const right = sp.motions?.[HandSide.RIGHT];
    // Invisible placeholder = hand not really there (both-required Step shape).
    if (isVisibleMotion(left) && isVisibleMotion(right)) {
      try {
        pos = getGridPlacementFromLocations(left.startLocation, right.startLocation);
      } catch {
        pos = null;
      }
    }
  }

  if (!pos) return null;
  if (pos.startsWith("alpha")) return "alpha";
  if (pos.startsWith("beta")) return "beta";
  if (pos.startsWith("gamma")) return "gamma";
  return null;
}

/** Resolve a register + family to its per-hand start-orientation pair (rendering seed). */
export function resolveStartOrientation(
  mode: StartOriMode,
  family: PlacementFamily,
): { left: Orientation; right: Orientation } {
  if (mode === "radial") {
    return { left: Orientation.IN, right: Orientation.IN };
  }
  if (mode === "split") {
    // Mixed: blue stays radial (IN); red goes nonradial — CLOCK for beta,
    // COUNTER for alpha / gamma.
    return {
      left: Orientation.IN,
      right: family === "beta" ? Orientation.CLOCK : Orientation.COUNTER,
    };
  }
  // nonradial: beta is counter|clock; alpha & gamma are clock|counter.
  return family === "beta"
    ? { left: Orientation.COUNTER, right: Orientation.CLOCK }
    : { left: Orientation.CLOCK, right: Orientation.COUNTER };
}

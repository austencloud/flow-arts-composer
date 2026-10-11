
import type { SimPropTarget } from "#lib/features/lab/tabs/collision-lab/services/types.js";

/**
 * One sampled instant of a staff along its motion: the same SimPropTarget the
 * StanceSimulator already understands (grip + shaft segment + radius).
 */
export type SweepSample = SimPropTarget;

/** A hand's whole motion sampled into N staff instants. */
export interface SweptVolume {
  samples: SweepSample[];
}

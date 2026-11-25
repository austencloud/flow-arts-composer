/**
 * Which real car body stands in for each parked car on the plan.
 *
 * The bodies are the Flow Fest parked cars. A plan says only "sedan" or "suv",
 * a colour and a place, so each takes a body of that sort in turn, keeps the
 * plan's colour, and is never longer than the space the plan drew.
 */

import { SURROUND_SIZES, type CarShape } from "../site-walk-around";
import {
  flowFestParkedCarModel,
  type FlowFestParkedCarModel,
} from "../../flow-fest-sim/flow-fest-parked-car-catalog";
import type { FlowFestParkedCarPlacement } from "../../flow-fest-sim/flow-fest-parked-cars";

const BODIES: Record<CarShape["body"], readonly string[]> = {
  sedan: ["ace-hatchback", "fairheaven-sedan"],
  suv: ["fairheaven-wagon", "bokaroo-suv"],
};

export interface ParkedFleet {
  model: FlowFestParkedCarModel;
  placements: FlowFestParkedCarPlacement[];
}

/** Every car of the plan, gathered by the body it wears. A phone loads one body of each sort. */
export function parkCars(
  cars: readonly CarShape[],
  phone: boolean
): ParkedFleet[] {
  const fleets = new Map<string, { fleet: ParkedFleet; colours: string[] }>();
  const taken: Record<CarShape["body"], number> = { sedan: 0, suv: 0 };
  for (const car of cars) {
    const choices = BODIES[car.body];
    const id = choices[phone ? 0 : taken[car.body]++ % choices.length]!;
    let entry = fleets.get(id);
    if (!entry) {
      const source = flowFestParkedCarModel(id);
      const colours: string[] = [];
      entry = {
        colours,
        fleet: {
          model: {
            ...source,
            lengthMeters: Math.min(
              source.lengthMeters,
              SURROUND_SIZES.car[car.body].length
            ),
            paint: source.paint && { ...source.paint, variants: colours },
          },
          placements: [],
        },
      };
      fleets.set(id, entry);
    }
    let paintIndex = entry.colours.indexOf(car.colour);
    if (paintIndex < 0) paintIndex = entry.colours.push(car.colour) - 1;
    entry.fleet.placements.push({
      x: car.at.x,
      y: 0,
      z: car.at.z,
      // The plan's car looks along its own z; these bodies look along x.
      rotation: -car.turn - Math.PI / 2,
      pitch: 0,
      roll: 0,
      modelId: id,
      paintIndex,
    });
  }
  return [...fleets.values()].map((entry) => entry.fleet);
}

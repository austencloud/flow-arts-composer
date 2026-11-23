/**
 * What the surroundings stop you with, as the same boxes the plan's own solid
 * things use (`BoxCollider`). A rect building is one box over its footprint; a
 * poly building is a thin wall on each edge (a hollow outline cannot be one
 * box); each solid railing run is a wall; a car is one box turned with it; a
 * tree trunk, a pole and a lamp post are narrow posts.
 */

import { postBox, wallBox, type BoxCollider } from "./site-walk-plan";
import { SURROUND_SIZES, type SiteSurroundings } from "./site-walk-around";
import { trunkWidth } from "./site-walk-trees";

/** A poly building's wall: thicker than a fence, so a fast body cannot slip through a corner. */
const POLY_WALL = 0.4;

export function surroundingColliders(around: SiteSurroundings): BoxCollider[] {
  const out: BoxCollider[] = [];
  for (const building of around.buildings) {
    for (const part of building.parts) {
      if (part.shape === "rect") {
        out.push({
          x: part.centre.x,
          y: part.height / 2,
          z: part.centre.z,
          w: part.w,
          h: part.height,
          t: part.d,
          rotationY: -part.turn,
        });
        continue;
      }
      for (let i = 0; i < part.points.length; i++) {
        const box = wallBox(part.points[i]!, part.points[(i + 1) % part.points.length]!, part.height);
        if (box) out.push({ ...box, t: POLY_WALL });
      }
    }
  }
  for (const railing of around.railings) {
    if (!railing.collide) continue;
    for (let i = 0; i + 1 < railing.points.length; i++) {
      const box = wallBox(railing.points[i]!, railing.points[i + 1]!, railing.height);
      if (box) out.push(box);
    }
  }
  for (const car of around.cars) {
    const size = SURROUND_SIZES.car[car.body];
    // At turn 0 a car's length runs along the plan's y, the box's thickness axis.
    out.push({
      x: car.at.x,
      y: size.height / 2,
      z: car.at.z,
      w: size.width,
      h: size.height,
      t: size.length,
      rotationY: -car.turn,
    });
  }
  for (const tree of around.trees) out.push(postBox(tree.at, trunkWidth(tree.height), Math.min(tree.height, 3)));
  for (const pole of around.poles) out.push(postBox(pole.at, SURROUND_SIZES.poleCollider, pole.height));
  for (const lamp of around.lamps) out.push(postBox(lamp.at, SURROUND_SIZES.lampCollider, lamp.height));
  return out;
}

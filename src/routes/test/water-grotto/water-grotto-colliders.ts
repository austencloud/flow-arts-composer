/**
 * Physics for the Water Grotto.
 *
 * The terrain program owns every rect; this only turns rects into Rapier box
 * descriptors, via the shared maths in `rect-colliders`. There is no trimesh
 * and no sculpt: what you see is exactly the box you stand on.
 */

import {
  buildWaterGrottoLayout,
  type WaterGrottoLayout,
} from "#lib/features/water-traverse/data/water-grotto-terrain.js";
import {
  floorCollider,
  wallCollider,
  type RectCollider,
} from "#lib/features/water-traverse/data/rect-colliders.js";

export type { RectCollider };

export interface WaterGrottoSetup {
  layout: WaterGrottoLayout;
  colliders: RectCollider[];
  spawn: { x: number; y: number; z: number; yaw: number };
}

export function buildWaterGrottoSetup(): WaterGrottoSetup {
  const layout = buildWaterGrottoLayout();
  return {
    layout,
    colliders: [
      ...layout.floorRects.map(floorCollider),
      ...layout.wallRects.map(wallCollider),
    ],
    spawn: layout.spawn,
  };
}

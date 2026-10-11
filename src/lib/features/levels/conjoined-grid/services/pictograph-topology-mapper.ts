import type { GridTopology } from "#lib/shared/multi-grid/domain/models/grid-topology.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { PropPlacement } from "#lib/shared/conjoined-grid/domain/types.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { GridLocation } from "#lib/shared/render/core/types.js";

/**
 * Maps a pictograph's left and right prop end positions onto a multi-grid topology.
 *
 * For 2-grid topologies the convention is: blue prop belongs to the first grid,
 * right prop belongs to the second grid. The mapper reads each motion's endLocation
 * (a compass point like "n", "se", etc.) and pairs it with the corresponding
 * grid ID from the topology.
 *
 * Returns null when the pictograph lacks motion data for either hand or the
 * topology doesn't have at least two grids.
 */
export function mapToTopology(
  pictograph: PictographData,
  topology: GridTopology
): PropPlacement | null {
  if (topology.grids.length < 2) return null;

  const leftMotion = pictograph.motions[HandSide.LEFT];
  const rightMotion = pictograph.motions[HandSide.RIGHT];

  if (!leftMotion || !rightMotion) return null;

  const leftEnd = leftMotion.endLocation as GridLocation;
  const rightEnd = rightMotion.endLocation as GridLocation;

  const gridA = topology.grids[0]!;
  const gridB = topology.grids[1]!;

  return {
    left: { gridId: gridA.id, location: leftEnd },
    right: { gridId: gridB.id, location: rightEnd },
  };
}

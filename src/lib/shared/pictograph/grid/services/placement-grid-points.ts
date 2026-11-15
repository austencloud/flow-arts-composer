import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { createGridPointData } from "#lib/shared/pictograph/grid/utils/grid-coordinate-utils.js";

export interface PlacementGridPoint {
  location: GridLocation;
  label: string;
  x: number;
  y: number;
}

const DIAMOND_LOCATIONS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

const BOX_LOCATIONS = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

const LOCATION_LABEL_KEYS: Record<GridLocation, TranslationKey> = {
  [GridLocation.NORTH]: "create_ui_orientation_centerN_label",
  [GridLocation.NORTHEAST]: "create_ui_orientation_centerNE_label",
  [GridLocation.EAST]: "create_ui_orientation_centerE_label",
  [GridLocation.SOUTHEAST]: "create_ui_orientation_centerSE_label",
  [GridLocation.SOUTH]: "create_ui_orientation_centerS_label",
  [GridLocation.SOUTHWEST]: "create_ui_orientation_centerSW_label",
  [GridLocation.WEST]: "create_ui_orientation_centerW_label",
  [GridLocation.NORTHWEST]: "create_ui_orientation_centerNW_label",
  [GridLocation.CENTER]: "pictograph_placement_point_center",
};

/**
 * Return the canonical hand points used by the pictograph renderer. Construct
 * and Learn share this adapter so their hit targets cannot drift apart.
 */
export function getPlacementGridPoints(
  gridMode: GridMode,
  showCenter = false
): PlacementGridPoint[] {
  if (
    gridMode !== GridMode.DIAMOND &&
    gridMode !== GridMode.BOX &&
    gridMode !== GridMode.SKEWED
  ) {
    throw new Error(`Placement is unavailable for grid mode: ${gridMode}`);
  }

  const gridPointData = createGridPointData(gridMode);
  const pointData = gridPointData.allHandPointsNormal;
  const locations =
    gridMode === GridMode.DIAMOND
      ? DIAMOND_LOCATIONS
      : gridMode === GridMode.BOX
        ? BOX_LOCATIONS
        : [...DIAMOND_LOCATIONS, ...BOX_LOCATIONS];

  const points: PlacementGridPoint[] = locations.map((location) => {
    const key = Object.keys(pointData).find((candidate) =>
      candidate.startsWith(`${location}_`)
    );
    const coordinates = key ? pointData[key]?.coordinates : null;

    if (!coordinates) {
      throw new Error(
        `Missing canonical ${gridMode} placement point for ${location}`
      );
    }

    return {
      location,
      label: t(LOCATION_LABEL_KEYS[location]),
      x: coordinates.x,
      y: coordinates.y,
    };
  });

  if (showCenter) {
    const center = gridPointData.centerPoint.coordinates;
    if (!center) {
      throw new Error(`Missing canonical ${gridMode} center placement point`);
    }
    points.push({
      location: GridLocation.CENTER,
      label: t(LOCATION_LABEL_KEYS[GridLocation.CENTER]),
      x: center.x,
      y: center.y,
    });
  }

  return points;
}

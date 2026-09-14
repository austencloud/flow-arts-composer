import { GridLocation, GridMode } from "../../grid/domain/enums/grid-enums";
import { Orientation } from "../../shared/domain/enums/pictograph-enums";
import { canonicalOrientation } from "$lib/shared/render/core/calculations/orientation";

// Cardinal locations use diamond grid rotation
const CARDINAL_LOCATIONS: ReadonlySet<GridLocation> = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

/**
 * Calculates prop rotation angles based on location, orientation, and grid mode.
 * Uses static lookup tables for optimal performance.
 *
 * For SKEWED mode, rotation is determined per-location:
 * - Cardinal (N, E, S, W) → diamond rotation angles
 * - Intercardinal (NE, SE, SW, NW) → box rotation angles
 */
export class PropRotAngleManager {
  private readonly location: GridLocation;
  private readonly orientation: Orientation;
  private readonly gridMode: GridMode;

  /** Diamond grid angle mappings */
  private static readonly DIAMOND_ANGLE_MAP: Record<
    Orientation,
    Record<GridLocation, number>
  > = {
    [Orientation.IN]: {
      [GridLocation.NORTH]: 90,
      [GridLocation.SOUTH]: 270,
      [GridLocation.WEST]: 0,
      [GridLocation.EAST]: 180,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.OUT]: {
      [GridLocation.NORTH]: 270,
      [GridLocation.SOUTH]: 90,
      [GridLocation.WEST]: 180,
      [GridLocation.EAST]: 0,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.CLOCK]: {
      [GridLocation.NORTH]: 0,
      [GridLocation.SOUTH]: 180,
      [GridLocation.WEST]: 270,
      [GridLocation.EAST]: 90,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER]: {
      [GridLocation.NORTH]: 180,
      [GridLocation.SOUTH]: 0,
      [GridLocation.WEST]: 90,
      [GridLocation.EAST]: 270,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    // Interradial orientations (Level 4) - interpolated angles
    // Note: These are approximate; exact values may need refinement
    [Orientation.CLOCK_IN]: {
      [GridLocation.NORTH]: 45,
      [GridLocation.SOUTH]: 225,
      [GridLocation.WEST]: 315,
      [GridLocation.EAST]: 135,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.CLOCK_OUT]: {
      [GridLocation.NORTH]: 315,
      [GridLocation.SOUTH]: 135,
      [GridLocation.WEST]: 225,
      [GridLocation.EAST]: 45,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER_IN]: {
      [GridLocation.NORTH]: 135,
      [GridLocation.SOUTH]: 315,
      [GridLocation.WEST]: 45,
      [GridLocation.EAST]: 225,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER_OUT]: {
      [GridLocation.NORTH]: 225,
      [GridLocation.SOUTH]: 45,
      [GridLocation.WEST]: 135,
      [GridLocation.EAST]: 315,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    // Center orientations at perimeter locations (shouldn't occur; 0 fallback)
    [Orientation.CENTER_N]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_NE]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_E]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_SE]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_S]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_SW]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_W]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_NW]: {} as Record<GridLocation, number>,
  };

  /**
   * Centric angle map: center orientations → SVG rotation angle.
   * SVG convention: 0=east, 90=south, 180=west, 270=north (clockwise).
   * Used when a prop is at GridLocation.CENTER (Level 6 Tau/Terra positions).
   */
  private static readonly CENTRIC_ANGLE_MAP: Record<Orientation, number> = {
    // Center orientations - prop points toward compass direction
    [Orientation.CENTER_N]: 270,
    [Orientation.CENTER_NE]: 315,
    [Orientation.CENTER_E]: 0,
    [Orientation.CENTER_SE]: 45,
    [Orientation.CENTER_S]: 90,
    [Orientation.CENTER_SW]: 135,
    [Orientation.CENTER_W]: 180,
    [Orientation.CENTER_NW]: 225,
    // Radial orientations at center are meaningless; fall back to 0
    [Orientation.IN]: 0,
    [Orientation.OUT]: 0,
    [Orientation.CLOCK]: 0,
    [Orientation.COUNTER]: 0,
    [Orientation.CLOCK_IN]: 0,
    [Orientation.CLOCK_OUT]: 0,
    [Orientation.COUNTER_IN]: 0,
    [Orientation.COUNTER_OUT]: 0,
  };

  /** Box grid angle mappings */
  private static readonly BOX_ANGLE_MAP: Record<
    Orientation,
    Record<GridLocation, number>
  > = {
    [Orientation.IN]: {
      [GridLocation.NORTHEAST]: 135,
      [GridLocation.NORTHWEST]: 45,
      [GridLocation.SOUTHWEST]: 315,
      [GridLocation.SOUTHEAST]: 225,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.OUT]: {
      [GridLocation.NORTHEAST]: 315,
      [GridLocation.NORTHWEST]: 225,
      [GridLocation.SOUTHWEST]: 135,
      [GridLocation.SOUTHEAST]: 45,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.CLOCK]: {
      [GridLocation.NORTHEAST]: 45,
      [GridLocation.NORTHWEST]: 315,
      [GridLocation.SOUTHWEST]: 225,
      [GridLocation.SOUTHEAST]: 135,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER]: {
      [GridLocation.NORTHEAST]: 225,
      [GridLocation.NORTHWEST]: 135,
      [GridLocation.SOUTHWEST]: 45,
      [GridLocation.SOUTHEAST]: 315,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    // Interradial orientations (Level 4) - interpolated angles
    // Note: These are approximate; exact values may need refinement
    [Orientation.CLOCK_IN]: {
      [GridLocation.NORTHEAST]: 90,
      [GridLocation.NORTHWEST]: 0,
      [GridLocation.SOUTHWEST]: 270,
      [GridLocation.SOUTHEAST]: 180,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.CLOCK_OUT]: {
      [GridLocation.NORTHEAST]: 0,
      [GridLocation.NORTHWEST]: 270,
      [GridLocation.SOUTHWEST]: 180,
      [GridLocation.SOUTHEAST]: 90,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER_IN]: {
      [GridLocation.NORTHEAST]: 180,
      [GridLocation.NORTHWEST]: 90,
      [GridLocation.SOUTHWEST]: 0,
      [GridLocation.SOUTHEAST]: 270,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    [Orientation.COUNTER_OUT]: {
      [GridLocation.NORTHEAST]: 270,
      [GridLocation.NORTHWEST]: 180,
      [GridLocation.SOUTHWEST]: 90,
      [GridLocation.SOUTHEAST]: 0,
      [GridLocation.CENTER]: 0,
    } as Record<GridLocation, number>,
    // Center orientations at perimeter locations (shouldn't occur; 0 fallback)
    [Orientation.CENTER_N]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_NE]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_E]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_SE]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_S]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_SW]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_W]: {} as Record<GridLocation, number>,
    [Orientation.CENTER_NW]: {} as Record<GridLocation, number>,
  };

  /** Creates a new PropRotAngleManager instance */
  constructor({
    location,
    orientation,
    gridMode,
  }: {
    location: GridLocation;
    orientation: Orientation;
    gridMode: GridMode;
  }) {
    this.location = location;
    this.orientation = canonicalOrientation(orientation);
    this.gridMode = gridMode;
  }

  /** Calculates the rotation angle in degrees */
  getRotationAngle(): number {
    if (this.location === GridLocation.CENTER) {
      return PropRotAngleManager.CENTRIC_ANGLE_MAP[this.orientation] ?? 0;
    }
    const angleMap = this.getAngleMapForLocation(this.location);
    const orientationAngles = angleMap[this.orientation];
    return orientationAngles[this.location] ?? 0;
  }

  /** Determines the correct angle map based on grid mode and location */
  private getAngleMapForLocation(
    location: GridLocation
  ): Record<Orientation, Record<GridLocation, number>> {
    if (this.gridMode === GridMode.DIAMOND) {
      return PropRotAngleManager.DIAMOND_ANGLE_MAP;
    }
    if (this.gridMode === GridMode.SKEWED) {
      // In skewed mode, use diamond angles for cardinal, box for intercardinal
      return CARDINAL_LOCATIONS.has(location)
        ? PropRotAngleManager.DIAMOND_ANGLE_MAP
        : PropRotAngleManager.BOX_ANGLE_MAP;
    }
    // BOX mode or default
    return PropRotAngleManager.BOX_ANGLE_MAP;
  }

  /** Static method for rotation angle calculation (recommended) */
  static calculateRotation(
    location: GridLocation,
    orientation: Orientation,
    gridMode: GridMode
  ): number {
    // Older saved links contain lowercased compound names such as "centere".
    // Restore the existing enum spelling before indexing the angle tables.
    orientation = canonicalOrientation(orientation);
    if (location === GridLocation.CENTER) {
      return PropRotAngleManager.CENTRIC_ANGLE_MAP[orientation] ?? 0;
    }
    const angleMap = PropRotAngleManager.getAngleMapForLocationStatic(
      location,
      gridMode
    );
    const orientationAngles = angleMap[orientation];
    return orientationAngles[location] ?? 0;
  }

  /** Static version of angle map selection for use with calculateRotation */
  private static getAngleMapForLocationStatic(
    location: GridLocation,
    gridMode: GridMode
  ): Record<Orientation, Record<GridLocation, number>> {
    if (gridMode === GridMode.DIAMOND) {
      return PropRotAngleManager.DIAMOND_ANGLE_MAP;
    }
    if (gridMode === GridMode.SKEWED) {
      // In skewed mode, use diamond angles for cardinal, box for intercardinal
      return CARDINAL_LOCATIONS.has(location)
        ? PropRotAngleManager.DIAMOND_ANGLE_MAP
        : PropRotAngleManager.BOX_ANGLE_MAP;
    }
    // BOX mode or default
    return PropRotAngleManager.BOX_ANGLE_MAP;
  }
}

export default PropRotAngleManager;

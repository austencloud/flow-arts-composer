/**
 * Position and Location Maps for Strict LOOP Variations
 *
 * These maps define transformations for:
 * - MIRRORED: Vertical mirroring of positions and locations
 * - SWAPPED: Color swapping position transformations
 * - INVERTED: Letter inversion mappings
 *
 * Note: ROTATED uses different maps defined in circular-placement-maps.ts
 */

import {
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * Vertical Mirror Position Map
 * Mirrors placements vertically across the center horizontal axis
 * Used by MIRRORED LOOP type
 *
 * Examples:
 * - ALPHA2 (SW-NE) ↔ ALPHA8 (SE-NW) - diagonals flip
 * - ALPHA3 (W-E) ↔ ALPHA7 (E-W) - horizontals swap
 * - ALPHA1 (S-N) → ALPHA1 - vertical stays same
 * - GAMMA1 (W-N) ↔ GAMMA9 (E-N) - gammas cross-mirror
 */
export const VERTICAL_MIRROR_PLACEMENT_MAP: Record<GridPlacement, GridPlacement> = {
  // Alpha group - vertical axis symmetry
  [GridPlacement.ALPHA1]: GridPlacement.ALPHA1, // S-N → S-N (on axis)
  [GridPlacement.ALPHA2]: GridPlacement.ALPHA8, // SW-NE → SE-NW
  [GridPlacement.ALPHA3]: GridPlacement.ALPHA7, // W-E → E-W
  [GridPlacement.ALPHA4]: GridPlacement.ALPHA6, // NW-SE → NE-SW
  [GridPlacement.ALPHA5]: GridPlacement.ALPHA5, // N-S → N-S (on axis)
  [GridPlacement.ALPHA6]: GridPlacement.ALPHA4, // NE-SW → NW-SE
  [GridPlacement.ALPHA7]: GridPlacement.ALPHA3, // E-W → W-E
  [GridPlacement.ALPHA8]: GridPlacement.ALPHA2, // SE-NW → SW-NE

  // Beta group - same sides stay same
  [GridPlacement.BETA1]: GridPlacement.BETA1, // N-N → N-N (on axis)
  [GridPlacement.BETA2]: GridPlacement.BETA8, // NE-NE → NW-NW
  [GridPlacement.BETA3]: GridPlacement.BETA7, // E-E → W-W
  [GridPlacement.BETA4]: GridPlacement.BETA6, // SE-SE → SW-SW
  [GridPlacement.BETA5]: GridPlacement.BETA5, // S-S → S-S (on axis)
  [GridPlacement.BETA6]: GridPlacement.BETA4, // SW-SW → SE-SE
  [GridPlacement.BETA7]: GridPlacement.BETA3, // W-W → E-E
  [GridPlacement.BETA8]: GridPlacement.BETA2, // NW-NW → NE-NE

  // Gamma group - cross-mirror pattern
  [GridPlacement.GAMMA1]: GridPlacement.GAMMA9, // W-N ↔ E-N
  [GridPlacement.GAMMA2]: GridPlacement.GAMMA16, // NW-NE ↔ NE-NW
  [GridPlacement.GAMMA3]: GridPlacement.GAMMA15, // N-E ↔ N-W
  [GridPlacement.GAMMA4]: GridPlacement.GAMMA14, // NE-SE ↔ NW-SW
  [GridPlacement.GAMMA5]: GridPlacement.GAMMA13, // E-S ↔ W-S
  [GridPlacement.GAMMA6]: GridPlacement.GAMMA12, // SE-SW ↔ SW-SE
  [GridPlacement.GAMMA7]: GridPlacement.GAMMA11, // S-W ↔ S-E
  [GridPlacement.GAMMA8]: GridPlacement.GAMMA10, // SW-NW ↔ SE-NE
  [GridPlacement.GAMMA9]: GridPlacement.GAMMA1, // E-N ↔ W-N
  [GridPlacement.GAMMA10]: GridPlacement.GAMMA8, // SE-NE ↔ SW-NW
  [GridPlacement.GAMMA11]: GridPlacement.GAMMA7, // S-E ↔ S-W
  [GridPlacement.GAMMA12]: GridPlacement.GAMMA6, // SW-SE ↔ SE-SW
  [GridPlacement.GAMMA13]: GridPlacement.GAMMA5, // W-S ↔ E-S
  [GridPlacement.GAMMA14]: GridPlacement.GAMMA4, // NW-SW ↔ NE-SE
  [GridPlacement.GAMMA15]: GridPlacement.GAMMA3, // N-W ↔ N-E
  [GridPlacement.GAMMA16]: GridPlacement.GAMMA2, // NE-NW ↔ NW-NE

  // Zeta 1-8 ↔ Zeta 9-16 swap (vertical mirror flips E↔W)
  [GridPlacement.ZETA1]: GridPlacement.ZETA9, // SW-N → SE-N
  [GridPlacement.ZETA2]: GridPlacement.ZETA16, // W-NE → E-NW
  [GridPlacement.ZETA3]: GridPlacement.ZETA15, // NW-E → NE-W
  [GridPlacement.ZETA4]: GridPlacement.ZETA14, // N-SE → N-SW
  [GridPlacement.ZETA5]: GridPlacement.ZETA13, // NE-S → NW-S
  [GridPlacement.ZETA6]: GridPlacement.ZETA12, // E-SW → W-SE
  [GridPlacement.ZETA7]: GridPlacement.ZETA11, // SE-W → SW-E
  [GridPlacement.ZETA8]: GridPlacement.ZETA10, // S-NW → S-NE
  [GridPlacement.ZETA9]: GridPlacement.ZETA1, // SE-N → SW-N
  [GridPlacement.ZETA10]: GridPlacement.ZETA8, // S-NE → S-NW
  [GridPlacement.ZETA11]: GridPlacement.ZETA7, // SW-E → SE-W
  [GridPlacement.ZETA12]: GridPlacement.ZETA6, // W-SE → E-SW
  [GridPlacement.ZETA13]: GridPlacement.ZETA5, // NW-S → NE-S
  [GridPlacement.ZETA14]: GridPlacement.ZETA4, // N-SW → N-SE
  [GridPlacement.ZETA15]: GridPlacement.ZETA3, // NE-W → NW-E
  [GridPlacement.ZETA16]: GridPlacement.ZETA2, // E-NW → W-NE

  // Eta 1-8 ↔ Eta 9-16 swap (vertical mirror flips E↔W)
  [GridPlacement.ETA1]: GridPlacement.ETA9, // NW-N → NE-N
  [GridPlacement.ETA2]: GridPlacement.ETA16, // N-NE → N-NW
  [GridPlacement.ETA3]: GridPlacement.ETA15, // NE-E → NW-W
  [GridPlacement.ETA4]: GridPlacement.ETA14, // E-SE → W-SW
  [GridPlacement.ETA5]: GridPlacement.ETA13, // SE-S → SW-S
  [GridPlacement.ETA6]: GridPlacement.ETA12, // S-SW → S-SE
  [GridPlacement.ETA7]: GridPlacement.ETA11, // SW-W → SE-E
  [GridPlacement.ETA8]: GridPlacement.ETA10, // W-NW → E-NE
  [GridPlacement.ETA9]: GridPlacement.ETA1, // NE-N → NW-N
  [GridPlacement.ETA10]: GridPlacement.ETA8, // E-NE → W-NW
  [GridPlacement.ETA11]: GridPlacement.ETA7, // SE-E → SW-W
  [GridPlacement.ETA12]: GridPlacement.ETA6, // S-SE → S-SW
  [GridPlacement.ETA13]: GridPlacement.ETA5, // SW-S → SE-S
  [GridPlacement.ETA14]: GridPlacement.ETA4, // W-SW → E-SE
  [GridPlacement.ETA15]: GridPlacement.ETA3, // NW-W → NE-E
  [GridPlacement.ETA16]: GridPlacement.ETA2, // N-NW → N-NE

  // Tau and Terra positions - Level 6 (centric mode)
  // TODO: Implement proper mirror logic when Level 6 is fully specified
  [GridPlacement.TAU1]: GridPlacement.TAU1,
  [GridPlacement.TAU2]: GridPlacement.TAU2,
  [GridPlacement.TAU3]: GridPlacement.TAU3,
  [GridPlacement.TAU4]: GridPlacement.TAU4,
  [GridPlacement.TAU5]: GridPlacement.TAU5,
  [GridPlacement.TAU6]: GridPlacement.TAU6,
  [GridPlacement.TAU7]: GridPlacement.TAU7,
  [GridPlacement.TAU8]: GridPlacement.TAU8,
  [GridPlacement.TAU9]: GridPlacement.TAU9,
  [GridPlacement.TAU10]: GridPlacement.TAU10,
  [GridPlacement.TAU11]: GridPlacement.TAU11,
  [GridPlacement.TAU12]: GridPlacement.TAU12,
  [GridPlacement.TAU13]: GridPlacement.TAU13,
  [GridPlacement.TAU14]: GridPlacement.TAU14,
  [GridPlacement.TAU15]: GridPlacement.TAU15,
  [GridPlacement.TAU16]: GridPlacement.TAU16,
  [GridPlacement.TERRA1]: GridPlacement.TERRA1,
};

/**
 * Vertical Mirror Location Map
 * Mirrors hand locations vertically (flips east/west)
 * Used by MIRRORED for transforming motion end locations
 *
 * Examples:
 * - E (east) ↔ W (west)
 * - NE (northeast) ↔ NW (northwest)
 * - N (north) → N (stays on vertical axis)
 * - S (south) → S (stays on vertical axis)
 */
export const VERTICAL_MIRROR_LOCATION_MAP: Record<GridLocation, GridLocation> =
  {
    [GridLocation.NORTH]: GridLocation.NORTH, // On axis - no change
    [GridLocation.SOUTH]: GridLocation.SOUTH, // On axis - no change
    [GridLocation.EAST]: GridLocation.WEST, // Flip east/west
    [GridLocation.WEST]: GridLocation.EAST, // Flip west/east
    [GridLocation.NORTHEAST]: GridLocation.NORTHWEST, // Flip NE/NW
    [GridLocation.NORTHWEST]: GridLocation.NORTHEAST, // Flip NW/NE
    [GridLocation.SOUTHEAST]: GridLocation.SOUTHWEST, // Flip SE/SW
    [GridLocation.SOUTHWEST]: GridLocation.SOUTHEAST, // Flip SW/SE
    [GridLocation.CENTER]: GridLocation.CENTER, // Center stays at center
  };

/**
 * Horizontal Mirror Position Map
 * Mirrors placements horizontally (flips north/south)
 * Used for the Flip transform
 *
 * Examples:
 * - ALPHA1 (S-N) ↔ ALPHA5 (N-S) - verticals flip
 * - ALPHA3 (W-E) → ALPHA3 (W-E) - horizontals stay same
 * - GAMMA1 (W-N) ↔ GAMMA13 (W-S) - north becomes south
 */
export const HORIZONTAL_MIRROR_PLACEMENT_MAP: Record<GridPlacement, GridPlacement> =
  {
    // Alpha group - horizontal axis symmetry
    [GridPlacement.ALPHA1]: GridPlacement.ALPHA5, // S-N ↔ N-S
    [GridPlacement.ALPHA2]: GridPlacement.ALPHA4, // SW-NE ↔ NW-SE
    [GridPlacement.ALPHA3]: GridPlacement.ALPHA3, // W-E → W-E (on axis)
    [GridPlacement.ALPHA4]: GridPlacement.ALPHA2, // NW-SE ↔ SW-NE
    [GridPlacement.ALPHA5]: GridPlacement.ALPHA1, // N-S ↔ S-N
    [GridPlacement.ALPHA6]: GridPlacement.ALPHA8, // NE-SW ↔ SE-NW
    [GridPlacement.ALPHA7]: GridPlacement.ALPHA7, // E-W → E-W (on axis)
    [GridPlacement.ALPHA8]: GridPlacement.ALPHA6, // SE-NW ↔ NE-SW

    // Beta group - north/south pairs swap
    [GridPlacement.BETA1]: GridPlacement.BETA5, // N-N ↔ S-S
    [GridPlacement.BETA2]: GridPlacement.BETA4, // NE-NE ↔ SE-SE
    [GridPlacement.BETA3]: GridPlacement.BETA3, // E-E → E-E (on axis)
    [GridPlacement.BETA4]: GridPlacement.BETA2, // SE-SE ↔ NE-NE
    [GridPlacement.BETA5]: GridPlacement.BETA1, // S-S ↔ N-N
    [GridPlacement.BETA6]: GridPlacement.BETA8, // SW-SW ↔ NW-NW
    [GridPlacement.BETA7]: GridPlacement.BETA7, // W-W → W-W (on axis)
    [GridPlacement.BETA8]: GridPlacement.BETA6, // NW-NW ↔ SW-SW

    // Gamma group - north/south flip pattern
    [GridPlacement.GAMMA1]: GridPlacement.GAMMA13, // W-N ↔ W-S
    [GridPlacement.GAMMA2]: GridPlacement.GAMMA12, // NW-NE ↔ SW-SE
    [GridPlacement.GAMMA3]: GridPlacement.GAMMA11, // N-E ↔ S-E
    [GridPlacement.GAMMA4]: GridPlacement.GAMMA10, // NE-SE ↔ SE-NE
    [GridPlacement.GAMMA5]: GridPlacement.GAMMA9, // E-S ↔ E-N
    [GridPlacement.GAMMA6]: GridPlacement.GAMMA16, // SE-SW ↔ NE-NW
    [GridPlacement.GAMMA7]: GridPlacement.GAMMA15, // S-W ↔ N-W
    [GridPlacement.GAMMA8]: GridPlacement.GAMMA14, // SW-NW ↔ NW-SW
    [GridPlacement.GAMMA9]: GridPlacement.GAMMA5, // E-N ↔ E-S
    [GridPlacement.GAMMA10]: GridPlacement.GAMMA4, // SE-NE ↔ NE-SE
    [GridPlacement.GAMMA11]: GridPlacement.GAMMA3, // S-E ↔ N-E
    [GridPlacement.GAMMA12]: GridPlacement.GAMMA2, // SW-SE ↔ NW-NE
    [GridPlacement.GAMMA13]: GridPlacement.GAMMA1, // W-S ↔ W-N
    [GridPlacement.GAMMA14]: GridPlacement.GAMMA8, // NW-SW ↔ SW-NW
    [GridPlacement.GAMMA15]: GridPlacement.GAMMA7, // N-W ↔ S-W
    [GridPlacement.GAMMA16]: GridPlacement.GAMMA6, // NE-NW ↔ SE-SW

    // Zeta group - horizontal mirror flips N↔S
    [GridPlacement.ZETA1]: GridPlacement.ZETA13, // SW-N → NW-S
    [GridPlacement.ZETA2]: GridPlacement.ZETA12, // W-NE → W-SE
    [GridPlacement.ZETA3]: GridPlacement.ZETA11, // NW-E → SW-E
    [GridPlacement.ZETA4]: GridPlacement.ZETA10, // N-SE → S-NE
    [GridPlacement.ZETA5]: GridPlacement.ZETA9, // NE-S → SE-N
    [GridPlacement.ZETA6]: GridPlacement.ZETA16, // E-SW → E-NW
    [GridPlacement.ZETA7]: GridPlacement.ZETA15, // SE-W → NE-W
    [GridPlacement.ZETA8]: GridPlacement.ZETA14, // S-NW → N-SW
    [GridPlacement.ZETA9]: GridPlacement.ZETA5, // SE-N → NE-S
    [GridPlacement.ZETA10]: GridPlacement.ZETA4, // S-NE → N-SE
    [GridPlacement.ZETA11]: GridPlacement.ZETA3, // SW-E → NW-E
    [GridPlacement.ZETA12]: GridPlacement.ZETA2, // W-SE → W-NE
    [GridPlacement.ZETA13]: GridPlacement.ZETA1, // NW-S → SW-N
    [GridPlacement.ZETA14]: GridPlacement.ZETA8, // N-SW → S-NW
    [GridPlacement.ZETA15]: GridPlacement.ZETA7, // NE-W → SE-W
    [GridPlacement.ZETA16]: GridPlacement.ZETA6, // E-NW → E-SW

    // Eta group - horizontal mirror flips N↔S
    [GridPlacement.ETA1]: GridPlacement.ETA13, // NW-N → SW-S
    [GridPlacement.ETA2]: GridPlacement.ETA12, // N-NE → S-SE
    [GridPlacement.ETA3]: GridPlacement.ETA11, // NE-E → SE-E
    [GridPlacement.ETA4]: GridPlacement.ETA10, // E-SE → E-NE
    [GridPlacement.ETA5]: GridPlacement.ETA9, // SE-S → NE-N
    [GridPlacement.ETA6]: GridPlacement.ETA16, // S-SW → N-NW
    [GridPlacement.ETA7]: GridPlacement.ETA15, // SW-W → NW-W
    [GridPlacement.ETA8]: GridPlacement.ETA14, // W-NW → W-SW
    [GridPlacement.ETA9]: GridPlacement.ETA5, // NE-N → SE-S
    [GridPlacement.ETA10]: GridPlacement.ETA4, // E-NE → E-SE
    [GridPlacement.ETA11]: GridPlacement.ETA3, // SE-E → NE-E
    [GridPlacement.ETA12]: GridPlacement.ETA2, // S-SE → N-NE
    [GridPlacement.ETA13]: GridPlacement.ETA1, // SW-S → NW-N
    [GridPlacement.ETA14]: GridPlacement.ETA8, // W-SW → W-NW
    [GridPlacement.ETA15]: GridPlacement.ETA7, // NW-W → SW-W
    [GridPlacement.ETA16]: GridPlacement.ETA6, // N-NW → S-SW

    // Tau and Terra positions - Level 6 (centric mode)
    // TODO: Implement proper horizontal mirror logic when Level 6 is fully specified
    [GridPlacement.TAU1]: GridPlacement.TAU1,
    [GridPlacement.TAU2]: GridPlacement.TAU2,
    [GridPlacement.TAU3]: GridPlacement.TAU3,
    [GridPlacement.TAU4]: GridPlacement.TAU4,
    [GridPlacement.TAU5]: GridPlacement.TAU5,
    [GridPlacement.TAU6]: GridPlacement.TAU6,
    [GridPlacement.TAU7]: GridPlacement.TAU7,
    [GridPlacement.TAU8]: GridPlacement.TAU8,
    [GridPlacement.TAU9]: GridPlacement.TAU9,
    [GridPlacement.TAU10]: GridPlacement.TAU10,
    [GridPlacement.TAU11]: GridPlacement.TAU11,
    [GridPlacement.TAU12]: GridPlacement.TAU12,
    [GridPlacement.TAU13]: GridPlacement.TAU13,
    [GridPlacement.TAU14]: GridPlacement.TAU14,
    [GridPlacement.TAU15]: GridPlacement.TAU15,
    [GridPlacement.TAU16]: GridPlacement.TAU16,
    [GridPlacement.TERRA1]: GridPlacement.TERRA1,
  };

/**
 * Horizontal Mirror Location Map
 * Mirrors hand locations horizontally (flips north/south)
 * Used for the Flip transform
 *
 * Examples:
 * - N (north) ↔ S (south)
 * - NE (northeast) ↔ SE (southeast)
 * - E (east) → E (stays on horizontal axis)
 * - W (west) → W (stays on horizontal axis)
 */
export const HORIZONTAL_MIRROR_LOCATION_MAP: Record<
  GridLocation,
  GridLocation
> = {
  [GridLocation.NORTH]: GridLocation.SOUTH, // Flip north/south
  [GridLocation.SOUTH]: GridLocation.NORTH, // Flip south/north
  [GridLocation.EAST]: GridLocation.EAST, // On axis - no change
  [GridLocation.WEST]: GridLocation.WEST, // On axis - no change
  [GridLocation.NORTHEAST]: GridLocation.SOUTHEAST, // Flip NE/SE
  [GridLocation.SOUTHEAST]: GridLocation.NORTHEAST, // Flip SE/NE
  [GridLocation.NORTHWEST]: GridLocation.SOUTHWEST, // Flip NW/SW
  [GridLocation.SOUTHWEST]: GridLocation.NORTHWEST, // Flip SW/NW
  [GridLocation.CENTER]: GridLocation.CENTER, // Center stays at center
};

/**
 * Swapped Position Map
 * Maps positions to their color-swapped equivalents
 * Used by SWAPPED LOOP type
 *
 * Pattern:
 * - Alpha: 180° rotation (cross-pattern)
 * - Beta: No change (same positions stay same)
 * - Gamma: Complex cross-swap pattern
 */
export const SWAPPED_PLACEMENT_MAP: Record<GridPlacement, GridPlacement> = {
  // Alpha group - 180° swap pattern
  [GridPlacement.ALPHA1]: GridPlacement.ALPHA5, // S-N ↔ N-S
  [GridPlacement.ALPHA2]: GridPlacement.ALPHA6, // SW-NE ↔ NE-SW
  [GridPlacement.ALPHA3]: GridPlacement.ALPHA7, // W-E ↔ E-W
  [GridPlacement.ALPHA4]: GridPlacement.ALPHA8, // NW-SE ↔ SE-NW
  [GridPlacement.ALPHA5]: GridPlacement.ALPHA1, // N-S ↔ S-N
  [GridPlacement.ALPHA6]: GridPlacement.ALPHA2, // NE-SW ↔ SW-NE
  [GridPlacement.ALPHA7]: GridPlacement.ALPHA3, // E-W ↔ W-E
  [GridPlacement.ALPHA8]: GridPlacement.ALPHA4, // SE-NW ↔ NW-SE

  // Beta group - no change (both hands same location)
  [GridPlacement.BETA1]: GridPlacement.BETA1, // N-N → N-N
  [GridPlacement.BETA2]: GridPlacement.BETA2, // NE-NE → NE-NE
  [GridPlacement.BETA3]: GridPlacement.BETA3, // E-E → E-E
  [GridPlacement.BETA4]: GridPlacement.BETA4, // SE-SE → SE-SE
  [GridPlacement.BETA5]: GridPlacement.BETA5, // S-S → S-S
  [GridPlacement.BETA6]: GridPlacement.BETA6, // SW-SW → SW-SW
  [GridPlacement.BETA7]: GridPlacement.BETA7, // W-W → W-W
  [GridPlacement.BETA8]: GridPlacement.BETA8, // NW-NW → NW-NW

  // Gamma group - cross-swap pattern
  [GridPlacement.GAMMA1]: GridPlacement.GAMMA15, // W-N ↔ N-W
  [GridPlacement.GAMMA2]: GridPlacement.GAMMA16, // NW-NE ↔ NE-NW
  [GridPlacement.GAMMA3]: GridPlacement.GAMMA9, // N-E ↔ E-N
  [GridPlacement.GAMMA4]: GridPlacement.GAMMA10, // NE-SE ↔ SE-NE
  [GridPlacement.GAMMA5]: GridPlacement.GAMMA11, // E-S ↔ S-E
  [GridPlacement.GAMMA6]: GridPlacement.GAMMA12, // SE-SW ↔ SW-SE
  [GridPlacement.GAMMA7]: GridPlacement.GAMMA13, // S-W ↔ W-S
  [GridPlacement.GAMMA8]: GridPlacement.GAMMA14, // SW-NW ↔ NW-SW
  [GridPlacement.GAMMA9]: GridPlacement.GAMMA3, // E-N ↔ N-E
  [GridPlacement.GAMMA10]: GridPlacement.GAMMA4, // SE-NE ↔ NE-SE
  [GridPlacement.GAMMA11]: GridPlacement.GAMMA5, // S-E ↔ E-S
  [GridPlacement.GAMMA12]: GridPlacement.GAMMA6, // SW-SE ↔ SE-SW
  [GridPlacement.GAMMA13]: GridPlacement.GAMMA7, // W-S ↔ S-W
  [GridPlacement.GAMMA14]: GridPlacement.GAMMA8, // NW-SW ↔ SW-NW
  [GridPlacement.GAMMA15]: GridPlacement.GAMMA1, // N-W ↔ W-N
  [GridPlacement.GAMMA16]: GridPlacement.GAMMA2, // NE-NW ↔ NW-NE

  // Zeta group - swap Blue↔Red locations
  // Zeta 1-8: Blue 135° CCW from Red → after swap → Red at old Blue, Blue at old Red → Zeta 9-16 pattern
  [GridPlacement.ZETA1]: GridPlacement.ZETA14, // (Red=N, Blue=SW) → (Red=SW, Blue=N)
  [GridPlacement.ZETA2]: GridPlacement.ZETA15, // (Red=NE, Blue=W) → (Red=W, Blue=NE)
  [GridPlacement.ZETA3]: GridPlacement.ZETA16, // (Red=E, Blue=NW) → (Red=NW, Blue=E)
  [GridPlacement.ZETA4]: GridPlacement.ZETA9, // (Red=SE, Blue=N) → (Red=N, Blue=SE)
  [GridPlacement.ZETA5]: GridPlacement.ZETA10, // (Red=S, Blue=NE) → (Red=NE, Blue=S)
  [GridPlacement.ZETA6]: GridPlacement.ZETA11, // (Red=SW, Blue=E) → (Red=E, Blue=SW)
  [GridPlacement.ZETA7]: GridPlacement.ZETA12, // (Red=W, Blue=SE) → (Red=SE, Blue=W)
  [GridPlacement.ZETA8]: GridPlacement.ZETA13, // (Red=NW, Blue=S) → (Red=S, Blue=NW)
  // Zeta 9-16: Blue 135° CW from Red → after swap → Zeta 1-8 pattern
  [GridPlacement.ZETA9]: GridPlacement.ZETA4, // (Red=N, Blue=SE) → (Red=SE, Blue=N)
  [GridPlacement.ZETA10]: GridPlacement.ZETA5, // (Red=NE, Blue=S) → (Red=S, Blue=NE)
  [GridPlacement.ZETA11]: GridPlacement.ZETA6, // (Red=E, Blue=SW) → (Red=SW, Blue=E)
  [GridPlacement.ZETA12]: GridPlacement.ZETA7, // (Red=SE, Blue=W) → (Red=W, Blue=SE)
  [GridPlacement.ZETA13]: GridPlacement.ZETA8, // (Red=S, Blue=NW) → (Red=NW, Blue=S)
  [GridPlacement.ZETA14]: GridPlacement.ZETA1, // (Red=SW, Blue=N) → (Red=N, Blue=SW)
  [GridPlacement.ZETA15]: GridPlacement.ZETA2, // (Red=W, Blue=NE) → (Red=NE, Blue=W)
  [GridPlacement.ZETA16]: GridPlacement.ZETA3, // (Red=NW, Blue=E) → (Red=E, Blue=NW)

  // Eta group - swap Blue↔Red locations
  // Eta 1-8: Blue 45° CCW from Red → after swap → Eta 9-16 pattern
  [GridPlacement.ETA1]: GridPlacement.ETA16, // (Red=N, Blue=NW) → (Red=NW, Blue=N)
  [GridPlacement.ETA2]: GridPlacement.ETA9, // (Red=NE, Blue=N) → (Red=N, Blue=NE)
  [GridPlacement.ETA3]: GridPlacement.ETA10, // (Red=E, Blue=NE) → (Red=NE, Blue=E)
  [GridPlacement.ETA4]: GridPlacement.ETA11, // (Red=SE, Blue=E) → (Red=E, Blue=SE)
  [GridPlacement.ETA5]: GridPlacement.ETA12, // (Red=S, Blue=SE) → (Red=SE, Blue=S)
  [GridPlacement.ETA6]: GridPlacement.ETA13, // (Red=SW, Blue=S) → (Red=S, Blue=SW)
  [GridPlacement.ETA7]: GridPlacement.ETA14, // (Red=W, Blue=SW) → (Red=SW, Blue=W)
  [GridPlacement.ETA8]: GridPlacement.ETA15, // (Red=NW, Blue=W) → (Red=W, Blue=NW)
  // Eta 9-16: Blue 45° CW from Red → after swap → Eta 1-8 pattern
  [GridPlacement.ETA9]: GridPlacement.ETA2, // (Red=N, Blue=NE) → (Red=NE, Blue=N)
  [GridPlacement.ETA10]: GridPlacement.ETA3, // (Red=NE, Blue=E) → (Red=E, Blue=NE)
  [GridPlacement.ETA11]: GridPlacement.ETA4, // (Red=E, Blue=SE) → (Red=SE, Blue=E)
  [GridPlacement.ETA12]: GridPlacement.ETA5, // (Red=SE, Blue=S) → (Red=S, Blue=SE)
  [GridPlacement.ETA13]: GridPlacement.ETA6, // (Red=S, Blue=SW) → (Red=SW, Blue=S)
  [GridPlacement.ETA14]: GridPlacement.ETA7, // (Red=SW, Blue=W) → (Red=W, Blue=SW)
  [GridPlacement.ETA15]: GridPlacement.ETA8, // (Red=W, Blue=NW) → (Red=NW, Blue=W)
  [GridPlacement.ETA16]: GridPlacement.ETA1, // (Red=NW, Blue=N) → (Red=N, Blue=NW)

  // Tau positions - swap center and perimeter hands
  // TAU1-8 (blue at center, red at perimeter) ↔ TAU9-16 (red at center, blue at perimeter)
  [GridPlacement.TAU1]: GridPlacement.TAU9,
  [GridPlacement.TAU2]: GridPlacement.TAU10,
  [GridPlacement.TAU3]: GridPlacement.TAU11,
  [GridPlacement.TAU4]: GridPlacement.TAU12,
  [GridPlacement.TAU5]: GridPlacement.TAU13,
  [GridPlacement.TAU6]: GridPlacement.TAU14,
  [GridPlacement.TAU7]: GridPlacement.TAU15,
  [GridPlacement.TAU8]: GridPlacement.TAU16,
  [GridPlacement.TAU9]: GridPlacement.TAU1,
  [GridPlacement.TAU10]: GridPlacement.TAU2,
  [GridPlacement.TAU11]: GridPlacement.TAU3,
  [GridPlacement.TAU12]: GridPlacement.TAU4,
  [GridPlacement.TAU13]: GridPlacement.TAU5,
  [GridPlacement.TAU14]: GridPlacement.TAU6,
  [GridPlacement.TAU15]: GridPlacement.TAU7,
  [GridPlacement.TAU16]: GridPlacement.TAU8,

  // Terra - both at center, stays the same
  [GridPlacement.TERRA1]: GridPlacement.TERRA1,
};

/**
 * Inverted Letter Map
 * Maps letters to their inverted pairs (opposite motion types)
 * Used by INVERTED LOOP type
 *
 * Pattern:
 * - Most letters pair with adjacent letter (A↔B, D↔E, etc.)
 * - Some letters are self-inverted (C, F, I, etc.)
 * - Greek letters follow similar pairing rules
 */
export const INVERTED_LETTER_MAP: Record<string, string> = {
  // Basic alphabet pairs
  A: "B",
  B: "A",
  C: "C", // Self-inverted
  D: "E",
  E: "D",
  F: "F", // Self-inverted
  G: "H",
  H: "G",
  I: "I", // Self-inverted
  J: "K",
  K: "J",
  L: "L", // Self-inverted
  M: "N",
  N: "M",
  O: "O", // Self-inverted
  P: "Q",
  Q: "P",
  R: "R", // Self-inverted
  S: "T",
  T: "S",
  U: "V",
  V: "U",
  W: "X",
  X: "W",
  Y: "Z",
  Z: "Y",

  // Greek letters
  Σ: "Δ",
  Δ: "Σ",
  Θ: "Ω",
  Ω: "Θ",
  Φ: "Φ", // Self-inverted
  Ψ: "Ψ", // Self-inverted
  Λ: "Λ", // Self-inverted
  α: "α", // Self-inverted
  β: "β", // Self-inverted
  γ: "γ", // Self-inverted

  // Type 2: Centric shifts (Mu ↔ Nu pair)
  μ: "ν",
  ν: "μ",

  // Type 4: Tau-dash (self-inverted)
  "τ-": "τ-",

  // Type 6: Additional static letters (all self-inverted)
  ζ: "ζ",
  η: "η",
  τ: "τ",
  "⊕": "⊕",

  // Dash variations
  "W-": "X-",
  "X-": "W-",
  "Y-": "Z-",
  "Z-": "Y-",
  "Σ-": "Δ-",
  "Δ-": "Σ-",
  "Θ-": "Ω-",
  "Ω-": "Θ-",
  "Φ-": "Φ-", // Self-inverted
  "Ψ-": "Ψ-", // Self-inverted
  "Λ-": "Λ-", // Self-inverted
};

/**
 * Get inverted letter for a given letter
 * @throws Error if letter not found in map
 */
export function getInvertedLetter(letter: string): string {
  const inverted = INVERTED_LETTER_MAP[letter];

  if (!inverted) {
    throw new Error(`No inverted letter mapping found for letter: ${letter}`);
  }

  return inverted;
}

/**
 * Alpha-Beta Counterpart Letter Map
 * Maps letters that share a common gamma endpoint but differ in the other section (α↔β).
 * Also called "Cross-Section Complementary" relationships.
 *
 * Pattern:
 * - Letters ending at gamma from different origins: Σ↔Θ (α→γ ↔ β→γ), Δ↔Ω (α→γ ↔ β→γ)
 * - Letters starting from gamma to different destinations: W↔Y (γ→α ↔ γ→β), X↔Z (γ→α ↔ γ→β)
 *
 * This differs from standard inversion (pro↔anti) - these pairs share the same rotation
 * but swap their alpha/beta relationship while both involving gamma.
 */
export const ALPHA_BETA_COUNTERPART_LETTER_MAP: Record<string, string> = {
  // Type 2 Shift letters sharing gamma endpoint
  // Origin swap (both end at gamma, start from α vs β)
  Σ: "Θ", // α→γ ↔ β→γ
  Θ: "Σ", // β→γ ↔ α→γ
  Δ: "Ω", // α→γ ↔ β→γ (anti versions)
  Ω: "Δ", // β→γ ↔ α→γ

  // Destination swap (both start at gamma, end at α vs β)
  W: "Y", // γ→α ↔ γ→β
  Y: "W", // γ→β ↔ γ→α
  X: "Z", // γ→α ↔ γ→β (anti versions)
  Z: "X", // γ→β ↔ γ→α

  // Type 3 Cross-Shift dash variants follow same pattern
  "Σ-": "Θ-",
  "Θ-": "Σ-",
  "Δ-": "Ω-",
  "Ω-": "Δ-",
  "W-": "Y-",
  "Y-": "W-",
  "X-": "Z-",
  "Z-": "X-",
};

/**
 * Compound Letter Map
 * Maps letters that form compound pairs - letters that combine to create circular motion.
 * These pairs complete each other to return to starting position.
 *
 * Two categories:
 * 1. Alpha↔Beta transitions (opposite section directions)
 * 2. Gamma internal pairs (γ→γ with complementary quarter-opp motions)
 */
export const COMPOUND_LETTER_MAP: Record<string, string> = {
  // Type 1 Dual-Shift compound pairs (β↔α transitions)
  D: "J", // β→α (Tog-Opp, isolation) ↔ α→β (Split-Opp, isolation) - "Disco Jam"
  J: "D",
  E: "K", // β→α (Tog-Opp, antispin) ↔ α→β (Split-Opp, antispin) - "Exploding Kitten"
  K: "E",
  F: "L", // β→α (Tog-Opp, hybrid) ↔ α→β (Split-Opp, hybrid) - "Fruity Loops"
  L: "F",

  // Gamma internal compound pairs (γ→γ Quarter-Opp complementary motions)
  M: "P", // γ→γ isolation ↔ γ→γ isolation - "Magic Potion"
  P: "M",
  N: "Q", // γ→γ antispin ↔ γ→γ antispin - "Never Quit"
  Q: "N",
  O: "R", // γ→γ hybrid ↔ γ→γ hybrid - "Open Road"
  R: "O",

  // Type 4 Dash compound pairs (β↔α transitions via dash)
  Φ: "Ψ", // β→α (Dash) ↔ α→β (Dash)
  Ψ: "Φ",
};

/**
 * Letter Transformation Types
 * Used for algorithmic detection and generation
 */
export enum LetterTransformationType {
  INVERSION = "inversion", // Pro ↔ Anti (A↔B, Σ↔Δ)
  COMPOUND = "compound", // Section transition pairs (D↔J, M↔P)
  ALPHA_BETA_COUNTERPART = "alpha_beta_counterpart", // Gamma endpoint sharing (Σ↔Θ, W↔Y)
}

/**
 * Get alpha-beta counterpart letter for a given letter
 * Returns the letter that shares the same gamma endpoint but swaps α↔β
 */
export function getAlphaBetaCounterpart(letter: string): string | null {
  return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter] ?? null;
}

/**
 * Get compound pair letter for a given letter
 * Returns the letter that forms a compound pair (α↔β transition pair or γ internal pair)
 */
export function getCompoundLetter(letter: string): string | null {
  return COMPOUND_LETTER_MAP[letter] ?? null;
}

/**
 * Check if two letters have a specific transformation relationship
 */
export function hasTransformationRelationship(
  letter1: string,
  letter2: string,
  type: LetterTransformationType
): boolean {
  switch (type) {
    case LetterTransformationType.INVERSION:
      return INVERTED_LETTER_MAP[letter1] === letter2;
    case LetterTransformationType.COMPOUND:
      return COMPOUND_LETTER_MAP[letter1] === letter2;
    case LetterTransformationType.ALPHA_BETA_COUNTERPART:
      return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter1] === letter2;
    default:
      return false;
  }
}

/**
 * Get all transformation relationships between two letters
 * Returns array of transformation types that apply to this letter pair
 */
export function getLetterRelationships(
  letter1: string,
  letter2: string
): LetterTransformationType[] {
  const relationships: LetterTransformationType[] = [];

  if (INVERTED_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.INVERSION);
  }
  if (COMPOUND_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.COMPOUND);
  }
  if (ALPHA_BETA_COUNTERPART_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.ALPHA_BETA_COUNTERPART);
  }

  return relationships;
}

/**
 * Get all letters that have a specific transformation relationship with the given letter
 */
export function getRelatedLetters(
  letter: string,
  type: LetterTransformationType
): string | null {
  switch (type) {
    case LetterTransformationType.INVERSION:
      return INVERTED_LETTER_MAP[letter] ?? null;
    case LetterTransformationType.COMPOUND:
      return COMPOUND_LETTER_MAP[letter] ?? null;
    case LetterTransformationType.ALPHA_BETA_COUNTERPART:
      return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter] ?? null;
    default:
      return null;
  }
}

/**
 * Analyze beat pair letters and return their transformation relationships
 * Useful for polyrhythmic LOOP analysis
 */
export function analyzeStepPairTransformation(
  letter1: string,
  letter2: string
): {
  relationships: LetterTransformationType[];
  isInverted: boolean;
  isCompound: boolean;
  isAlphaBetaCounterpart: boolean;
} {
  const relationships = getLetterRelationships(letter1, letter2);
  return {
    relationships,
    isInverted: relationships.includes(LetterTransformationType.INVERSION),
    isCompound: relationships.includes(LetterTransformationType.COMPOUND),
    isAlphaBetaCounterpart: relationships.includes(
      LetterTransformationType.ALPHA_BETA_COUNTERPART
    ),
  };
}

/**
 * Validation Sets for Strict LOOP Types
 * These define which (start_position, end_position) pairs are valid for each LOOP type
 */

/**
 * Mirrored LOOP validation set
 * Valid when: vertical_mirror(start_pos) === end_pos
 */
export const MIRRORED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Flipped LOOP validation set
 * Valid when: horizontal_mirror(start_pos) === end_pos
 */
export const FLIPPED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(HORIZONTAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Swapped LOOP validation set
 * Valid when: swapped(start_pos) === end_pos
 */
export const SWAPPED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(SWAPPED_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Mirrored-Swapped LOOP validation set
 * Valid when: swapped(vertical_mirror(start_pos)) === end_pos
 * The end position must reflect BOTH transformations:
 * 1. First mirror (east↔west)
 * 2. Then swap (blue↔red positions)
 */
export const MIRRORED_SWAPPED_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(([start, mirroredEnd]) => {
    // Compose: first mirror, then swap
    const swappedMirroredEnd =
      SWAPPED_PLACEMENT_MAP[mirroredEnd as GridPlacement];
    return `${start},${swappedMirroredEnd}`;
  })
);

/**
 * Inverted LOOP validation set
 * Valid when: start_pos === end_pos (returns to starting position)
 */
export const INVERTED_LOOP_VALIDATION_SET = new Set<string>(
  Object.values(GridPlacement).map((pos) => `${pos},${pos}`)
);

/**
 * Mirrored-Inverted LOOP validation set
 * Valid when: vertical_mirror(start_pos) === end_pos (same as mirrored)
 * The inverted transformation happens with motion types and letters, but position requirement is same as mirrored
 */
export const MIRRORED_INVERTED_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Import rotation maps for composed validation sets
 */
import {
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
  HALF_PLACEMENT_MAP,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";

/**
 * Rotated-Swapped LOOP validation set (Quartered - 90° rotations)
 * Valid when: end_pos === SWAPPED(ROTATED(start_pos))
 * The end position must reflect BOTH transformations:
 * 1. First rotate 90° (CW or CCW)
 * 2. Then swap (blue↔red positions)
 *
 * Example: gamma11 (Red@E, Blue@S)
 * - Pure rotation 90° CW → gamma13 (Red@S, Blue@W)
 * - Rotated + Swapped → gamma7 (Red@W, Blue@S) - the swap of gamma13
 */
export const ROTATED_SWAPPED_QUARTERED_VALIDATION_SET = new Set<string>([
  // Clockwise rotation then swap
  ...Object.entries(QUARTER_PLACEMENT_MAP_CW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd as GridPlacement];
    return `${start},${swappedRotatedEnd}`;
  }),
  // Counter-clockwise rotation then swap
  ...Object.entries(QUARTER_PLACEMENT_MAP_CCW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd as GridPlacement];
    return `${start},${swappedRotatedEnd}`;
  }),
]);

/**
 * Rotated-Swapped LOOP validation set (Halved - 180° rotations)
 * Valid when: end_pos === SWAPPED(ROTATED_180(start_pos))
 */
export const ROTATED_SWAPPED_HALVED_VALIDATION_SET = new Set<string>(
  Object.entries(HALF_PLACEMENT_MAP).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd as GridPlacement];
    return `${start},${swappedRotatedEnd}`;
  })
);

/**
 * Non-degenerate variants of the rotated-swapped sets (alpha starts removed).
 *
 * Swap+rotate combos (ROTATED_SWAPPED, ROTATED_SWAPPED_INVERTED) degenerate
 * from alpha starts: the hands already sit at each other's 180° image, so
 * rotate-then-swap is the per-hand identity and the "rotation" vanishes.
 * Beta (both hands share a point — swap positionally invisible) and gamma
 * (right angle) are genuine. Mirrors the engine-side composed
 * swap(rotate(start)) seam gate in LOOPEndPlacementSelector. Empirical basis:
 * forced-start generation audits, 2026-07-13.
 */
function excludeAlphaStarts(pairs: Set<string>): Set<string> {
  return new Set([...pairs].filter((pair) => !pair.startsWith("alpha")));
}

export const ROTATED_SWAPPED_NONDEGENERATE_QUARTERED_VALIDATION_SET = excludeAlphaStarts(
  ROTATED_SWAPPED_QUARTERED_VALIDATION_SET
);

export const ROTATED_SWAPPED_NONDEGENERATE_HALVED_VALIDATION_SET = excludeAlphaStarts(
  ROTATED_SWAPPED_HALVED_VALIDATION_SET
);

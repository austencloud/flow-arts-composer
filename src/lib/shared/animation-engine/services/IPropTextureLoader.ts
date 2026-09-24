/**
 * Prop Texture Service Interface
 *
 * Handles prop texture loading for AnimatorCanvas.
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { IAnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import type { ISVGGenerator } from "$lib/shared/animation-engine/services/ISVGGenerator";
import type { ITrailCapturer } from "$lib/shared/animation-engine/services/ITrailCapturer";
import { parseFanRenderKey } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import { parseModelRenderKey } from "$lib/shared/pictograph/prop/domain/prop-look";
import { HOOP_FAMILY_BOXES } from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";
import { parseTriangleRenderKey } from "$lib/shared/pictograph/prop/domain/triangle-appearance";

/**
 * Prop dimensions
 */
export interface PropDimensions {
  width: number;
  height: number;
}

/**
 * Prop dimensions lookup by prop type
 *
 * The exact viewBox dimensions of the sprite the animation canvas actually
 * fetches — /images/props/pictograph/ for everything except the animated-only
 * carve-outs (torch, bigtorch, triquetra2, sword variants; see
 * resolvePropSvgPath in svg-generator.ts).
 *
 * Used to display correct dimensions before async texture loading completes.
 * The loader overwrites these with the fetched viewBox once the texture lands,
 * so a stale entry here shows up as a size pop on first paint.
 */
export const PROP_DIMENSIONS: Record<string, PropDimensions> = {
  // Staff family
  staff: { width: 252.8, height: 77.8 },
  simple_staff: { width: 252.8, height: 77.8 },
  bigstaff: { width: 600, height: 54.5 },
  staff_v2: { width: 250, height: 40.5 },

  // Club family
  // The regular club stops short of the grid center so its visible end, trails,
  // and mandala all share the same ~130-unit reach.
  club: { width: 258.67, height: 34.17 },
  classic_club: { width: 258.67, height: 34.17 },
  bigclub: { width: 252, height: 65 },

  // Fan family
  fan: { width: 260, height: 207 },
  bigfan: { width: 600, height: 566.9 },

  // Triad family
  // The regular triad is uniformly scaled so every arm reaches the club's
  // canonical radius without changing its center pivot or proportions.
  triad: { width: 258.67, height: 227.818 },
  bigtriad: { width: 600, height: 523.5 },

  // Hoop family
  minihoop: HOOP_FAMILY_BOXES.minihoop,
  bighoop: HOOP_FAMILY_BOXES.bighoop,
  triangle: HOOP_FAMILY_BOXES.triangle,

  // Buugeng family
  buugeng: { width: 262.6, height: 135.9 },
  bigbuugeng: { width: 600, height: 293.1 },
  trigeng: { width: 250, height: 236.7 },

  // Hand - matches animated/hand.svg viewBox (same as static version)
  hand: { width: 75, height: 100 },

  // Triquetra family
  // triquetra2 is an animated-only carve-out — the pictograph file holds
  // different artwork (170x170), not a rescale of this one.
  triquetra: { width: 290.3, height: 169.6 },
  triquetra2: { width: 300, height: 175.32 },

  // Sword
  sword: { width: 572.3, height: 64 },

  // Energy family (premium cosmetics). Both boxes are padded beyond the prop
  // itself so the blade glow has somewhere to fall off, and both grew that
  // padding symmetrically around the prop center — the torch precedent — so the
  // hand pivot and the tracked tips stay exactly where their parents put them.
  energy_saber: { width: 620, height: 96 },
  energy_staff: { width: 300, height: 90 },

  // LED baton — staff's exact span so the mandala radius and beta spacing match,
  // in a shallow box because the prop really is that thin.
  capsule_baton: { width: 252.8, height: 40 },

  // Fire double staff — staff's exact span so the mandala radius and beta
  // spacing match, in the same shallow box its artwork is drawn in.
  fire_double_staff: { width: 252.8, height: 24 },

  // Chicken family
  chicken: { width: 325, height: 30.3 },
  bigchicken: { width: 252.8, height: 44.4 },

  // Guitar family
  guitar: { width: 595, height: 170 },
  ukulele: { width: 350, height: 71.5 },

  // Doublestar family
  doublestar: { width: 300, height: 150 },
  bigdoublestar: { width: 600, height: 300 },

  // Eightrings family
  eightrings: { width: 257.3, height: 137.1 },
  bigeightrings: { width: 600, height: 309.5 },

  // Quiad
  quiad: { width: 250, height: 250 },

  // Contact ball family
  contactball: { width: 300, height: 150 },
  bigcontactball: { width: 600, height: 300 },
  doublecontactball: { width: 300, height: 150 },
  bigdoublecontactball: { width: 600, height: 300 },

  // Glass ball family
  glassball: { width: 300, height: 150 },
  doubleglassball: { width: 300, height: 150 },
  bigglassball: { width: 600, height: 300 },
  bigdoubleglassball: { width: 600, height: 300 },

  // PMMA ball family
  pmmaball: { width: 300, height: 150 },
  doublepmmaball: { width: 300, height: 150 },
  bigpmmaball: { width: 600, height: 300 },
  bigdoublepmmaball: { width: 600, height: 300 },

  // Frosted ball family
  frostedball: { width: 300, height: 150 },
  doublefrostedball: { width: 300, height: 150 },
  bigfrostedball: { width: 600, height: 300 },
  bigdoublefrostedball: { width: 600, height: 300 },

  // Poi — grip to head CENTRE is the club's 129.335 reach, and the head's own
  // 16.5-unit radius overhangs that, so the box is 2 x 145.835.
  poi: { width: 291.67, height: 38 },

  // Torch family
  // The flame extends beyond the old wick-only artwork. These viewBoxes grow
  // symmetrically around the original prop center, so the hand pivot and the
  // canonical trail attachment stay fixed while the full flame remains visible.
  torch: { width: 360, height: 35.7 },
  bigtorch: { width: 402, height: 57.3 },
};

/**
 * Default prop dimensions (staff dimensions)
 * Fallback when prop type is unknown.
 */
export const DEFAULT_PROP_DIMENSIONS: PropDimensions = {
  width: 300,
  height: 92.33,
};

/**
 * Get prop dimensions for a given prop type
 * Uses the lookup table, falls back to default (staff) if unknown
 */
export function getPropDimensions(propType: string): PropDimensions {
  const normalized = propType.toLowerCase();
  const fanRenderKey = parseFanRenderKey(normalized);
  if (fanRenderKey) {
    return fanRenderKey.propType === "bigfan"
      ? { width: 600, height: 566.9 }
      : { width: 260, height: 207 };
  }
  // A model sprite is captured into the same box as its pictograph artwork.
  const modelRenderKey = parseModelRenderKey(normalized);
  const baseType = modelRenderKey?.propType ?? normalized;
  // Both triangle grips share one grip-centred box (spec section 2).
  const triangleKey = parseTriangleRenderKey(baseType);
  return (
    PROP_DIMENSIONS[triangleKey?.propType ?? baseType] ?? {
      ...DEFAULT_PROP_DIMENSIONS,
    }
  );
}

/**
 * Reactive state for prop textures
 */
export interface PropTextureState {
  leftDimensions: PropDimensions;
  rightDimensions: PropDimensions;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Service for managing prop texture loading
 */
export interface IPropTextureLoader {
  /**
   * Reactive state - owned by service, read by component via $derived
   */
  state: PropTextureState;

  /**
   * Initialize the service with required dependencies
   */
  initialize(
    renderer: IAnimationRenderer,
    svgGenerator: ISVGGenerator,
    TrailCapturer: ITrailCapturer | null
  ): void;

  /**
   * Load textures for both performer hands
   * @param leftPropType - Type of left-hand prop
   * @param rightPropType - Type of right-hand prop
   * @param darkMode - When provided, uses this instead of global dark mode state (for preview isolation)
   */
  loadPropTextures(
    leftPropType: string,
    rightPropType: string,
    darkMode?: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void>;

  /**
   * Clean up resources
   */
  dispose(): void;
}

import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";

/**
 * How the composer page draws its selected prop. Every demo on the page gets
 * the same values, so a fan build or 3D look picked above the fold carries
 * into Build, Generate and the tunnel exactly as the prop type does.
 */
export interface ComposerPropAppearance {
  fanAppearance: FanAppearance;
  propLook: PropLook;
  primaryPropColors: ViewerCustomColorPair | null;
  leftBuugengFlipped: boolean;
  rightBuugengFlipped: boolean;
}

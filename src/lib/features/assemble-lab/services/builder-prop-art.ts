/**
 * The prop artwork Assemble's grid draws for each hand: the user's prop type
 * and look, fan build and triangle grip, painted in the user's hand color.
 * InteractiveGrid draws it on Assemble's grid, and the Create front door's
 * Assemble preview draws the same artwork.
 *
 * Trust boundary: callers inject svgData.svgContent with {@html}. It comes
 * from propSvgLoader (bundled static prop SVGs), never user or external
 * input.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { normalizeFanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import type { PropRenderData } from "#lib/shared/pictograph/prop/domain/models/prop-render-data.js";
import { applyHandColorOverride } from "#lib/shared/pictograph/prop/domain/prop-preview-color.js";
import { normalizePropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import { propSvgLoader } from "#lib/shared/pictograph/prop/services/prop-svg-loader.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";

/** The settings Assemble's prop artwork follows. */
export type BuilderPropSettings = Pick<
  AppSettings,
  | "leftPropType"
  | "rightPropType"
  | "primaryPropColors"
  | "propArtwork"
  | "fanAppearance"
  | "triangleGrip"
>;

/** The prop type a hand holds. */
export function builderPropType(
  settings: BuilderPropSettings,
  hand: HandSide
): PropType {
  return (
    (hand === HandSide.LEFT ? settings.leftPropType : settings.rightPropType) ??
    PropType.STAFF
  );
}

/**
 * Load one hand's artwork. Every setting is read before the first await, and
 * the loader reads the theme before its own, so an effect that calls this
 * reloads the artwork whenever any of them changes.
 */
export async function loadBuilderPropArt(
  hand: HandSide,
  settings: BuilderPropSettings
): Promise<PropRenderData> {
  const propType = builderPropType(settings, hand);
  const color =
    hand === HandSide.LEFT
      ? settings.primaryPropColors?.left
      : settings.primaryPropColors?.right;
  // Draw the look the pictographs draw (PictographContainer passes the
  // same options), so the stage and the Start pictograph show one prop.
  const appearance = {
    propLook: normalizePropLook(settings.propArtwork),
    fanAppearance: normalizeFanAppearance(settings.fanAppearance),
    triangleGrip: normalizeTriangleGrip(settings.triangleGrip),
  };
  const data = await propSvgLoader.loadPropSvg(
    { positionX: 0, positionY: 0, rotationAngle: 0 },
    createMotionData({ propType, hand }),
    false,
    appearance
  );
  // The loader paints the default hand color. Repaint with the user's chosen
  // color so the stage matches the pictographs (PropSvg does the same).
  if (!color || !data.svgData) return data;
  return {
    ...data,
    svgData: {
      ...data.svgData,
      svgContent: applyHandColorOverride(
        data.svgData.svgContent,
        hand,
        propType,
        color
      ),
    },
  };
}

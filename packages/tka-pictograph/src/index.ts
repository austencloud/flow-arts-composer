/**
 * @austencloud/tka-pictograph: The Kinetic Alphabet's pictographs as SVG,
 * drawn by Austen Cloud's renderer from his own art.
 */
import { cacheFor, defaultArtSource, type ArtSource } from "./art-source.js";
import { PictographSvgRenderer } from "./svg-renderer.js";
import type { PictographInput, RenderVisibilityOptions } from "./types.js";

export type {
  FanAppearanceInput,
  GridJoinSpec,
  HandColorPair,
  MotionInput,
  PictographInput,
  RenderVisibilityOptions,
} from "./types.js";
export { defaultArtSource, fsArtSource, urlArtSource, type ArtSource } from "./art-source.js";
export { pictographsForLetter } from "./letters.js";
export { resolveMotionColor as handColor, VIEWBOX_SIZE as PICTOGRAPH_VIEWBOX } from "./palette.js";

/** Passes allowed for art to arrive; each pass fetches everything the last one asked for. */
const MAX_PASSES = 10;

/**
 * One pictograph as an SVG document, 950 units square. Art comes from
 * `options.art`, or from the copy inside this package when none is given.
 */
export async function renderPictographSvg(
  input: PictographInput,
  options: RenderVisibilityOptions & { art?: ArtSource } = {}
): Promise<string> {
  const { art, ...visibility } = options;
  const cache = cacheFor(art ?? defaultArtSource());
  const renderer = new PictographSvgRenderer(cache);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const svg = renderer.render(input, visibility);
    if (cache.misses.size === 0) return svg;
    await cache.fill();
  }
  throw new Error(`Pictograph art was still arriving after ${MAX_PASSES} passes`);
}

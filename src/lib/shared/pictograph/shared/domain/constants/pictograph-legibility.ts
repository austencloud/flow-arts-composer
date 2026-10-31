/**
 * The smallest cell at which a pictograph still reads.
 *
 * Read-out size is set by the letter glyph: arrows and props stay
 * recognisable well below it, but the letter is what names the step. The
 * glyph art is 100 units tall and is drawn at scale 1 inside the renderer's
 * 950-unit viewBox, so it takes 100/950 of the cell. A capital letter reads
 * like the app's essential text when its height matches that text's cap
 * height: 14px (--font-size-min) times a typical 0.7 cap-height ratio.
 *
 *   cell >= 14 * 0.7 * 950 / 100 = 93.1, so 94px
 *
 * Layouts that would shrink pictographs below this size should keep this
 * size and scroll instead.
 */
import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";

/** Height of the trimmed letter glyph art, in viewBox units. */
export const LETTER_GLYPH_HEIGHT = 100;
/** --font-size-min: the floor for essential text (app.css). */
const ESSENTIAL_TEXT_SIZE = 14;
/** Cap height as a share of font size for the app's sans-serif faces. */
const CAP_HEIGHT_RATIO = 0.7;

export const MIN_LEGIBLE_PICTOGRAPH_SIZE = Math.ceil(
  (ESSENTIAL_TEXT_SIZE * CAP_HEIGHT_RATIO * VIEWBOX_SIZE) / LETTER_GLYPH_HEIGHT
);

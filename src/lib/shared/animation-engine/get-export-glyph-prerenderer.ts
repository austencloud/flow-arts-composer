import { ExportGlyphPrerenderer } from '#lib/shared/animation-engine/services/export-glyph-prerenderer.js';
import { getSvgImageConverter } from '#lib/shared/foundation/get-svg-image-converter.js';

let instance: ExportGlyphPrerenderer | null = null;
export function getExportGlyphPrerenderer(): ExportGlyphPrerenderer {
  return instance ??= new ExportGlyphPrerenderer(getSvgImageConverter());
}

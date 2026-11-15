/**
 * The brand serif, Fraunces 700 italic, as canvas painters draw it. It is
 * self-hosted app-wide (`static/fonts/css/fraunces.css`), but a canvas draws a
 * webfont only once it is loaded, and the stylesheet alone loads it only when
 * the page uses it. A painter waits on `loadBrandSerif` before a frame that
 * needs it is exported.
 */
export const BRAND_SERIF = 'Fraunces, Georgia, "Times New Roman", serif';
export const BRAND_SERIF_FONT = "italic 700";

export function loadBrandSerif(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts)
    return Promise.resolve();
  return document.fonts
    .load(`${BRAND_SERIF_FONT} 32px Fraunces`, "Flow Arts Composer")
    .then(
      () => undefined,
      () => undefined
    );
}

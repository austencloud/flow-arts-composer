/**
 * Where a text brace's ink actually sits in the page, for real-Chromium
 * component tests of the HTML word surfaces (WordHeader, TKAWordGlyph).
 *
 * The DOM reports only the brace's text box, which spans the font's full
 * ascent + descent. Canvas metrics for the same computed font say where the
 * alphabetic baseline sits in that box and how far the glyph's ink reaches
 * above and below it.
 */
export function measureHtmlBraceInk(brace: HTMLElement): {
  centreY: number;
  height: number;
} {
  const range = document.createRange();
  range.selectNodeContents(brace);
  const box = range.getBoundingClientRect();
  const style = getComputedStyle(brace);
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = ctx.measureText(brace.textContent!.trim());
  const baseline = box.top + metrics.fontBoundingBoxAscent;
  const top = baseline - metrics.actualBoundingBoxAscent;
  const bottom = baseline + metrics.actualBoundingBoxDescent;
  return { centreY: (top + bottom) / 2, height: bottom - top };
}

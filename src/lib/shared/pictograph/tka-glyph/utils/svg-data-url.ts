/** Build a base64 data URL from SVG markup. */
export function svgToDataUrl(svgText: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
}

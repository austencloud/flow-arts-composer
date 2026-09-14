import type { ThemeMode } from "./svg-color.js";

/**
 * Physical fan artwork owns its material colors. Only the marked frame group
 * follows the motion color; Kevlar wicks and fitted covers stay physical.
 */
export function applyFanFrameColor(svg: string, color: string): string {
  return svg.replace(
    /<g\b(?=[^>]*\bdata-fan-frame=(?:""|''))[^>]*>/i,
    (tag) => {
      const filled = tag.replace(
        /\bfill=(?:"(?!none")[^"]*"|'(?!none')[^']*')/i,
        `fill="${color}"`
      );
      if (/\bstroke=(?:"[^"]*"|'[^']*')/i.test(filled)) {
        return filled.replace(
          /\bstroke=(?:"[^"]*"|'[^']*')/i,
          `stroke="${color}"`
        );
      }
      return filled.replace(/>$/, ` stroke="${color}">`);
    }
  );
}

/** Light-paper treatment for physical wicks and stroke-built fan frames. */
export const FAN_PAPER_CONTRAST = {
  wickFill: "#d9b25a",
  wickStroke: "#4a2f14",
  wickStrokeWidth: 2.2,
  frameHairlineWidth: 2.4,
  frameStrokeScale: 1.6,
} as const;

const WICK_GROUP_PATTERN =
  /<g\b(?=[^>]*\bdata-(?:fire-wick|fan-wicks)=(?:"[^"]*"|'[^']*'))[^>]*>/gi;
const FRAME_GROUP_PATTERN = /<g\b(?=[^>]*\bdata-fan-frame=(?:""|''))[^>]*>/i;

function setAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`\\b${name}=(?:"[^"]*"|'[^']*')`, "i");
  if (attribute.test(tag)) return tag.replace(attribute, `${name}="${value}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end.trim()}`);
}

function scaleStrokeWidth(
  tag: string,
  scale: number,
  fallback: number
): string {
  const authored = tag.match(/\bstroke-width=(?:"([^"]*)"|'([^']*)')/i);
  const width = authored ? parseFloat(authored[1] ?? authored[2] ?? "") : NaN;
  const scaled = Number.isFinite(width) ? width * scale : fallback;
  return setAttribute(tag, "stroke-width", formatWidth(scaled));
}

function formatWidth(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Index just past the closing group opened at `openIndex`. */
function groupEnd(svg: string, openIndex: number): number {
  const token = /<g\b|<\/g\s*>/gi;
  token.lastIndex = openIndex;
  let depth = 0;
  for (let match = token.exec(svg); match; match = token.exec(svg)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return svg.length;
}

export function applyFanPaperContrast(
  svg: string,
  themeMode: ThemeMode
): string {
  if (themeMode !== "light") return svg;
  const {
    wickFill,
    wickStroke,
    wickStrokeWidth,
    frameHairlineWidth,
    frameStrokeScale,
  } = FAN_PAPER_CONTRAST;
  const withWicks = svg.replace(WICK_GROUP_PATTERN, (tag) =>
    setAttribute(
      setAttribute(setAttribute(tag, "fill", wickFill), "stroke", wickStroke),
      "stroke-width",
      formatWidth(wickStrokeWidth)
    )
  );
  const frameOpen = withWicks.match(FRAME_GROUP_PATTERN);
  if (frameOpen?.index === undefined) return withWicks;
  if (!/\bfill=(?:"none"|'none')/i.test(frameOpen[0])) return withWicks;

  const start = frameOpen.index;
  const end = groupEnd(withWicks, start);
  const group = withWicks.slice(start, end);
  const openTag = scaleStrokeWidth(
    frameOpen[0],
    frameStrokeScale,
    frameHairlineWidth
  );
  const body = group
    .slice(frameOpen[0].length)
    .replace(
      /<(?:path|ellipse|circle|line|polyline|polygon|rect)\b[^>]*>/gi,
      (tag) =>
        /\bstroke-width=/i.test(tag)
          ? scaleStrokeWidth(tag, frameStrokeScale, frameHairlineWidth)
          : tag
    );
  return withWicks.slice(0, start) + openTag + body + withWicks.slice(end);
}

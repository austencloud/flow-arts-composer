/**
 * Turn number art, held in the app's code.
 *
 * A number drawn from a file path is fetched when its element first appears,
 * so on a first visit it lands after the letter beside it. Reading the files
 * at build time as data URLs lets a column draw its numbers the moment it
 * mounts.
 */
import { svgToDataUrl } from "./svg-data-url";

const numberSvgs = import.meta.glob("/static/images/numbers/*.svg", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

/** Data URLs keyed by the public path callers use, e.g. /images/numbers/1.svg. */
const artByPublicPath = new Map<string, string>(
  Object.entries(numberSvgs).map(([file, svg]) => [
    file.replace(/^\/static/, ""),
    svgToDataUrl(svg),
  ])
);

/** The data URL for a turn number or half mark path, or the path itself when it has none. */
export function turnNumberArt(path: string): string {
  return artByPublicPath.get(path) ?? path;
}

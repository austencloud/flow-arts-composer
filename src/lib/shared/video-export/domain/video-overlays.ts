/**
 * What a downloaded video draws on top of the animation. The Download video
 * screen keeps its own list, so a post can drop the letters while the canvas
 * keeps them for practice.
 *
 * Two groups, in the order the screen shows them: the header strip's parts,
 * and what sits on or under the animation square. The header strip is drawn
 * while any of its parts is on, so turning every part off removes the strip
 * and the video loses that height.
 */
export const VIDEO_HEADER_KEYS = [
  "headerWord",
  "headerLevel",
  "headerTurns",
  "headerReversals",
  "headerLoop",
] as const;

export const VIDEO_ANIMATION_KEYS = [
  "tkaGlyph",
  "stepNumbers",
  "elementalGlyph",
  "grid",
  "progressBar",
] as const;

export const VIDEO_OVERLAY_KEYS = [
  ...VIDEO_HEADER_KEYS,
  ...VIDEO_ANIMATION_KEYS,
] as const;

export type VideoHeaderKey = (typeof VIDEO_HEADER_KEYS)[number];
export type VideoAnimationKey = (typeof VIDEO_ANIMATION_KEYS)[number];
export type VideoOverlayKey = (typeof VIDEO_OVERLAY_KEYS)[number];

export type VideoOverlays = Record<VideoOverlayKey, boolean>;

/** The canvas display flags a first list is copied from. */
export type CanvasOverlayKey =
  | "wordHeader"
  | "progressBar"
  | "tkaGlyph"
  | "stepNumbers"
  | "elementalGlyph";

export function isVideoOverlays(value: unknown): value is VideoOverlays {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return VIDEO_OVERLAY_KEYS.every((key) => typeof record[key] === "boolean");
}

const LEGACY_KEYS = ["progressBar", "tkaGlyph", "stepNumbers", "elementalGlyph"];

/**
 * Reads a stored list. A list saved before the header had its own parts
 * carries one `wordHeader` flag; every part takes it, and the grid stays
 * shown as it always was. Anything else unreadable starts over (null).
 */
export function readStoredVideoOverlays(value: unknown): VideoOverlays | null {
  if (isVideoOverlays(value)) {
    return Object.fromEntries(
      VIDEO_OVERLAY_KEYS.map((key) => [key, value[key]])
    ) as VideoOverlays;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.wordHeader !== "boolean") return null;
  if (!LEGACY_KEYS.every((key) => typeof record[key] === "boolean")) return null;
  return videoOverlaysFrom(
    (key) => record[key] as boolean,
    true
  );
}

/** The list a person starts from: whatever the canvas shows right now. */
export function videoOverlaysFrom(
  read: (key: CanvasOverlayKey) => boolean,
  gridVisible: boolean
): VideoOverlays {
  const header = read("wordHeader");
  return {
    headerWord: header,
    headerLevel: header,
    headerTurns: header,
    headerReversals: header,
    headerLoop: header,
    tkaGlyph: read("tkaGlyph"),
    stepNumbers: read("stepNumbers"),
    elementalGlyph: read("elementalGlyph"),
    grid: gridVisible,
    progressBar: read("progressBar"),
  };
}

/** The header strip is drawn while any of its parts is on. */
export function showsVideoHeader(overlays: VideoOverlays): boolean {
  return VIDEO_HEADER_KEYS.some((key) => overlays[key]);
}

/**
 * The whole-header switch: with any part showing it hides them all, and with
 * none showing it brings every part back. `available` is the parts this
 * sequence draws; a part it lacks never decides the switch.
 */
export function toggleWholeVideoHeader(
  overlays: VideoOverlays,
  available: readonly VideoHeaderKey[] = VIDEO_HEADER_KEYS
): VideoOverlays {
  const next = !available.some((key) => overlays[key]);
  const result = { ...overlays };
  for (const key of VIDEO_HEADER_KEYS) result[key] = next;
  return result;
}

/**
 * Flips one part. Turning off the last part this sequence draws clears the
 * rest too, so a part it lacks can't keep an empty strip on the video.
 */
export function toggleVideoOverlay(
  overlays: VideoOverlays,
  key: VideoOverlayKey,
  available: readonly VideoHeaderKey[] = VIDEO_HEADER_KEYS
): VideoOverlays {
  const result = { ...overlays, [key]: !overlays[key] };
  const isHeaderPart = (VIDEO_HEADER_KEYS as readonly string[]).includes(key);
  if (isHeaderPart && !available.some((part) => result[part])) {
    for (const part of VIDEO_HEADER_KEYS) result[part] = false;
  }
  return result;
}

export interface VideoOverlayExport {
  overlayOverrides: {
    wordHeader: boolean;
    headerWord: boolean;
    headerLevel: boolean;
    headerTurns: boolean;
    headerReversals: boolean;
    headerLoop: boolean;
    progressBar: boolean;
    tkaGlyph: boolean;
    stepNumbers: boolean;
    elementalGlyph: boolean;
  };
  gridVisible: boolean;
}

/** What the export reads: per-part header flags, the square's marks, grid. */
export function videoOverlayExport(overlays: VideoOverlays): VideoOverlayExport {
  return {
    overlayOverrides: {
      wordHeader: showsVideoHeader(overlays),
      headerWord: overlays.headerWord,
      headerLevel: overlays.headerLevel,
      headerTurns: overlays.headerTurns,
      headerReversals: overlays.headerReversals,
      headerLoop: overlays.headerLoop,
      progressBar: overlays.progressBar,
      tkaGlyph: overlays.tkaGlyph,
      stepNumbers: overlays.stepNumbers,
      elementalGlyph: overlays.elementalGlyph,
    },
    gridVisible: overlays.grid,
  };
}

/** Columns in the pill grid; a row of one, two or three items divides it. */
export const PILL_GRID_COLUMNS = 6;

/**
 * Column spans that fill every row of a pill grid: rows of at most
 * `perRow`, as even as the count allows (five is three over two, four is two
 * over two), so no row ends in empty space.
 */
export function fillRowSpans(count: number, perRow = 3): number[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / perRow);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const spans: number[] = [];
  for (let row = 0; row < rows; row++) {
    const items = base + (row < extra ? 1 : 0);
    for (let i = 0; i < items; i++) spans.push(PILL_GRID_COLUMNS / items);
  }
  return spans;
}

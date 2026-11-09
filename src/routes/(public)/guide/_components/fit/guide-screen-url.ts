import { SIDEWAYS_VIEWPORT_QUERY } from "#lib/shared/ui/sideways-viewport.js";

/**
 * The screen a guide page shows is URL state: `?screen=2` opens its second
 * screen, so a link lands on the right screen and the phone's Back steps
 * back one screen. Screen 1 has no param.
 */
export const SCREEN_PARAM = "screen";

/** 0-based screen index from a location's search string. */
export function readScreenParam(search: string): number {
  const raw = new URLSearchParams(search).get(SCREEN_PARAM);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
}

/**
 * Which screen of a recut page holds what a reader was looking at. A page
 * that cuts its screens by window size names the topics on each screen;
 * after a resize the reader stays on the topic, not on the number: the
 * ratio matrix is screen 50 on a phone and 16 on a laptop (2026-11-07,
 * widening a phone-sized window left the page blank). The screen's first
 * topic decides, then any of its others; -1 when the new cut has none.
 */
export function followScreen(
  topics: readonly string[],
  screens: readonly (readonly string[])[]
): number {
  for (const topic of topics) {
    const at = screens.findIndex((keys) => keys.includes(topic));
    if (at >= 0) return at;
  }
  return -1;
}

/**
 * A window too small to show a paragraph and a figure together (a phone in
 * either orientation): guide pages give long text its own screen there.
 */
export const SMALL_SCREEN_QUERY = "(max-width: 639.98px), (max-height: 640px)";


/** Calls back now and whenever the window crosses the small-screen line. */
export function watchSmallScreen(onChange: (small: boolean) => void): () => void {
  const mq = window.matchMedia(SMALL_SCREEN_QUERY);
  const handler = () => onChange(mq.matches);
  handler();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * A phone held sideways (the Fold's cover on its side: about 915 by 340).
 * It is a small screen by height, but wide enough for a figure and its words
 * side by side, so a page that splits them for a phone may keep them on one
 * screen in two columns here. The breakpoint is the shared sideways one
 * (`shared/ui/sideways-viewport.ts`); this callback form serves the guide's
 * non-rune watchers.
 */
export const SIDEWAYS_SCREEN_QUERY = SIDEWAYS_VIEWPORT_QUERY;

/** Calls back now and whenever the window turns sideways or back. */
export function watchSidewaysScreen(
  onChange: (sideways: boolean) => void
): () => void {
  const mq = window.matchMedia(SIDEWAYS_SCREEN_QUERY);
  const handler = () => onChange(mq.matches);
  handler();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * A window that fits a figure and its words but not a whole comparison of
 * several figure sets (a tablet, a Fold, a 1366 by 768 laptop): pages with a
 * big comparison split it across two or three screens there.
 */
export const MEDIUM_SCREEN_QUERY =
  "(max-width: 1279.98px), (max-height: 800px)";

/**
 * A narrow portrait window (the Fold's inner screen held upright, a tablet
 * in portrait) is tall but not wide: a two-family comparison leaves its
 * figures small, so it takes the phone's one-thing-per-screen layout.
 */
export const NARROW_PORTRAIT_QUERY =
  "(max-width: 959.98px) and (orientation: portrait)";

export type ScreenTier = "small" | "medium" | "large";

/** Calls back now and whenever the window crosses a tier line. */
export function watchScreenTier(
  onChange: (tier: ScreenTier) => void
): () => void {
  const small = window.matchMedia(SMALL_SCREEN_QUERY);
  const portrait = window.matchMedia(NARROW_PORTRAIT_QUERY);
  const medium = window.matchMedia(MEDIUM_SCREEN_QUERY);
  const queries = [small, portrait, medium];
  const handler = () =>
    onChange(
      small.matches || portrait.matches
        ? "small"
        : medium.matches
        ? "medium"
        : "large"
    );
  handler();
  for (const q of queries) q.addEventListener("change", handler);
  return () => {
    for (const q of queries) q.removeEventListener("change", handler);
  };
}

/**
 * How many words and tiles one guide screen holds beside its figure, worked
 * out from the window (2026-11-06, Austen: no scrolling, and no screen of
 * words alone). The guide's type never scales, so a window's room for words
 * follows from its size; the figure takes what is left and reads --fit.
 *
 * Words are in characters of the guide's reading type. A screen that still
 * overflows tells its page, which asks for less room (`tighterRoom`).
 */
export type ScreenRoom = {
  /** Words in a sequence showcase's own text column. */
  beside: number;
  /** Words stacked over a figure that has no text column of its own. */
  over: number;
  /** Words, in a Level 2 topic's smaller type, over its figure band (a canvas,
      a strip and a caption, all stacked). The caption counts as words. */
  band: number;
  /** Gallery tiles that stay readable together on one screen. */
  tiles: number;
  /** A page with no figure at all: words on one screen. */
  alone: number;
  /** Width of a showcase's strip, in steps, and what another row of them
      costs in words. */
  stripCols: number;
  stripRowChars: number;
  /** Words a note above the first screen's content takes (a page's "Video
      coming" note), so that screen is cut with room for it. */
  lead?: number;
};

const LINE_PX = 32.6;
const CHAR_PX = 7.7;
const OVER_MEASURE_PX = 704;
// Lines are not all full and paragraphs have gaps.
const FILL = 0.75;
const QUANTUM = 20;
const BAND_LINE_PX = 28.2;
const BAND_CHAR_PX = 6.6;
// A band at its smallest readable size, and at most what it wants to be.
const BAND_MIN_PX = 290;
const BAND_MAX_PX = 340;
const BAND_SHARE = 0.65;
const BAND_FILL = 0.85;
const MIN_TILE_PX = 110;
const TILE_CAPTION_PX = 30;
const TILE_GAP_PX = 12;
const RAIL_PX = 64;
// SequenceShowcase's own layout lines.
const STRIP_BESIDE_MIN_W = 900;
const STACK_MAX_W = 600;

const chars = (widthPx: number, heightPx: number): number =>
  Math.max(
    QUANTUM,
    Math.floor(
      (Math.floor(widthPx / CHAR_PX) *
        Math.floor(Math.max(0, heightPx) / LINE_PX) *
        FILL) /
        QUANTUM
    ) * QUANTUM
  );

/** The room in a window of this size (pure, so the cut is tested without one). */
export function screenRoom(width: number, height: number): ScreenRoom {
  const sideways = height <= 480 && width >= 700;
  const rail = width >= 1024 && !sideways ? RAIL_PX : 0;
  const frameW = width - rail - 2 * Math.min(48, Math.max(8, width * 0.02));
  // The site header, the title and pills, the Back and Next row. A sideways
  // phone holds all of those in one 44px row.
  const frameH = sideways
    ? height - 56
    : height - 64 - 65 - Math.min(170, Math.max(110, height * 0.18));

  // Beside: canvas | words over strip. Banner: canvas | words, strip under.
  // Stacked: words, canvas, strip, one over the next.
  let beside: number;
  let stripCols: number;
  let stripRowPx: number;
  if (frameW >= STRIP_BESIDE_MIN_W) {
    const textW = frameW * 0.6;
    stripCols = Math.max(1, Math.floor(textW / 104));
    stripRowPx = 104;
    beside = chars(textW, frameH - stripRowPx - 16);
  } else if (frameW > STACK_MAX_W) {
    const textW = frameW * 0.68;
    stripCols = Math.max(1, Math.floor(frameW / 72));
    stripRowPx = 72;
    beside = chars(textW, frameH - stripRowPx - 16);
  } else {
    stripCols = Math.max(1, Math.floor(frameW / 62));
    stripRowPx = 62;
    // The canvas stays large enough to watch: a quarter of the screen's height.
    const canvasPx = Math.max(130, frameH * 0.26);
    beside = chars(frameW, frameH - canvasPx - stripRowPx - 28);
  }
  const overFigurePx = sideways
    ? frameH * 0.5
    : Math.max(190, Math.min(frameH * 0.5, 320));
  const over = chars(Math.min(frameW, OVER_MEASURE_PX), frameH - overFigurePx);
  const bandPx = Math.min(
    BAND_MAX_PX,
    Math.max(BAND_MIN_PX, frameH * BAND_SHARE)
  );
  const band = Math.max(
    QUANTUM,
    Math.floor(
      (Math.floor(Math.min(frameW, OVER_MEASURE_PX) / BAND_CHAR_PX) *
        Math.floor(Math.max(0, frameH - bandPx) / BAND_LINE_PX) *
        BAND_FILL) /
        QUANTUM
    ) * QUANTUM
  );
  const cols = Math.max(1, Math.floor(frameW / (MIN_TILE_PX + TILE_GAP_PX)));
  const rows = Math.max(
    1,
    Math.floor((frameH - LINE_PX * 2) / (MIN_TILE_PX + TILE_CAPTION_PX))
  );
  return {
    beside,
    over,
    band,
    tiles: cols * rows,
    alone: chars(Math.min(frameW, OVER_MEASURE_PX), frameH),
    stripCols,
    stripRowChars: Math.floor(
      ((frameW * 0.6) / CHAR_PX) * (stripRowPx / LINE_PX)
    ),
  };
}

/** The server's guess at a window, until the page is live. */
export const DEFAULT_SCREEN_ROOM: ScreenRoom = screenRoom(1440, 900);

/** Less room, after a screen overflowed anyway (`step` times). */
export function tighterRoom(room: ScreenRoom, step: number): ScreenRoom {
  if (step <= 0) return room;
  const k = 0.75 ** step;
  const less = (n: number) =>
    Math.max(QUANTUM, Math.floor((n * k) / QUANTUM) * QUANTUM);
  return {
    ...room,
    beside: less(room.beside),
    over: less(room.over),
    band: less(room.band),
    alone: less(room.alone),
    tiles: Math.max(1, Math.floor(room.tiles * k)),
  };
}

/** Calls back now and whenever the window's room for words changes. */
export function watchScreenRoom(
  onChange: (room: ScreenRoom) => void
): () => void {
  let last = "";
  const handler = () => {
    const room = screenRoom(window.innerWidth, window.innerHeight);
    const key = JSON.stringify(room);
    if (key === last) return;
    last = key;
    onChange(room);
  };
  handler();
  window.addEventListener("resize", handler, { passive: true });
  return () => window.removeEventListener("resize", handler);
}

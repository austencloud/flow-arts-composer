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
 * A window too small to show a paragraph and a figure together (a phone in
 * either orientation): guide pages give long text its own screen there.
 */
export const SMALL_SCREEN_QUERY = "(max-width: 639.98px), (max-height: 640px)";

/** Prose at least this long gets its own screen on a small window. */
export const SMALL_TEXT_SCREEN_CHARS = 60;

/** A small window's screen of words alone holds about this much. */
export const SMALL_TEXT_SCREEN_MAX_CHARS = 340;

/** On a laptop-sized window only a long passage gets its own screen. */
export const MEDIUM_TEXT_SCREEN_CHARS = 280;

/** Calls back now and whenever the window crosses the small-screen line. */
export function watchSmallScreen(onChange: (small: boolean) => void): () => void {
  const mq = window.matchMedia(SMALL_SCREEN_QUERY);
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

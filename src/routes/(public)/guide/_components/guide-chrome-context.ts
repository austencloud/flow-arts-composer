import { getContext, setContext } from "svelte";

const GUIDE_CHROME_CONTEXT_KEY = Symbol("guide-chrome");

/**
 * A page shown one screen at a time (GuideScreens): its screens, which one
 * shows, and how to switch. The shell's contents drawer lists them first.
 */
export interface GuidePageScreens {
  /** The page's own name, the heading over its screens in the drawer. */
  title: string;
  labels: string[];
  index: number;
  go(index: number): void;
}

/**
 * What a guide page may ask of the shell's own chrome. A region that takes
 * the whole viewport (the motion paths studio) holds the floating contents
 * pill away, since the pill is fixed over the reading column and would sit
 * on the region's controls.
 */
export interface GuideChrome {
  /** Tucks the contents pill until the returned release is called. */
  holdPillAway(): () => void;
  /** The page's screens for the drawer, or null when it has none. */
  setScreens(screens: GuidePageScreens | null): void;
  /** The screen pills do not fit their row: the page draws one box in
      their place that stands for the Contents button, so the shell's own
      button steps aside while the drawer is closed. */
  setBoxed(boxed: boolean): void;
  /** Opens the contents drawer; `opener` gets focus back when it closes. */
  openContents(opener?: HTMLElement | null): void;
  /** Whether the contents drawer is open. */
  readonly contentsOpen: boolean;
}

export function setGuideChromeContext(chrome: GuideChrome): GuideChrome {
  setContext(GUIDE_CHROME_CONTEXT_KEY, chrome);
  return chrome;
}

/** The shell's chrome, or null outside a guide shell. */
export function getGuideChromeContext(): GuideChrome | null {
  return getContext<GuideChrome | null>(GUIDE_CHROME_CONTEXT_KEY) ?? null;
}

import { getContext, setContext } from "svelte";

const GUIDE_CHROME_CONTEXT_KEY = Symbol("guide-chrome");

/**
 * What a guide page may ask of the shell's own chrome. A region that takes
 * the whole viewport (the motion paths studio) holds the floating contents
 * pill away, since the pill is fixed over the reading column and would sit
 * on the region's controls.
 */
export interface GuideChrome {
  /** Tucks the contents pill until the returned release is called. */
  holdPillAway(): () => void;
}

export function setGuideChromeContext(chrome: GuideChrome): GuideChrome {
  setContext(GUIDE_CHROME_CONTEXT_KEY, chrome);
  return chrome;
}

/** The shell's chrome, or null outside a guide shell. */
export function getGuideChromeContext(): GuideChrome | null {
  return getContext<GuideChrome | null>(GUIDE_CHROME_CONTEXT_KEY) ?? null;
}

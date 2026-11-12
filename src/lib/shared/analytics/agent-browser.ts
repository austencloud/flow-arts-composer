/**
 * Is this page running in one of our own agent browsers?
 *
 * Agent runs against production showed up as fresh guest visitors: on
 * 2026-11-08/09, 11 one-page "guests" on a day with about 4 real people. Each
 * run is anonymous with a new id, so the admin-UID and `agent-` exclusions in
 * hogql-shared.ts never see them. The answer here keeps them out of PostHog
 * and out of the visit alerts at the source.
 *
 * Three markers, any one of which is enough:
 *
 *   - The `tka_agent_browser` cookie. The shared agent Chrome on port 9222
 *     reports `navigator.webdriver === false` and a stock Chrome user agent
 *     (checked 2026-11-09), so nothing else tells it apart.
 *     scripts/launch-chrome-debug.ps1 sets this cookie for tkaflowarts.com
 *     through scripts/mark-agent-browser.mjs every time it runs.
 *   - `navigator.webdriver`, set by Puppeteer/Playwright launches.
 *   - The user agent: `Claude/<version>` (the Claude desktop app's built-in
 *     browser) or `HeadlessChrome` (headless runs, which do not always set
 *     webdriver).
 *
 * Nothing here looks at browser version, screen size or locale, so a real
 * visitor on an old or unusual browser is still counted.
 */

export const AGENT_BROWSER_COOKIE = "tka_agent_browser";

const AGENT_USER_AGENT = /\bClaude\/\d|\bHeadlessChrome\//;

export interface AgentBrowserSignals {
  webdriver: boolean | undefined;
  userAgent: string;
  /** `document.cookie`. */
  cookie: string;
}

export function isAgentBrowser(signals: AgentBrowserSignals): boolean {
  if (signals.webdriver === true) return true;
  if (AGENT_USER_AGENT.test(signals.userAgent)) return true;
  return signals.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${AGENT_BROWSER_COOKIE}=`));
}

/** `isAgentBrowser` for the current page. False outside a browser. */
export function isThisAnAgentBrowser(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    return false;
  }
  return isAgentBrowser({
    webdriver: navigator.webdriver,
    userAgent: navigator.userAgent,
    cookie: document.cookie,
  });
}

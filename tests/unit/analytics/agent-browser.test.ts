import { describe, it, expect } from "vitest";
import {
  AGENT_BROWSER_COOKIE,
  isAgentBrowser,
} from "#lib/shared/analytics/agent-browser.js";

// The exact user agent of the shared agent Chrome on port 9222 and of the 11
// agent "guests" seen on 2026-11-08/09. A real visitor can send it too.
const STOCK_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

const plain = { webdriver: false, userAgent: STOCK_CHROME, cookie: "" };

describe("isAgentBrowser", () => {
  it("counts a plain browser, even with the agent Chrome's exact user agent", () => {
    expect(isAgentBrowser(plain)).toBe(false);
    expect(isAgentBrowser({ ...plain, webdriver: undefined })).toBe(false);
  });

  it("counts an old or unusual real browser", () => {
    const oldSafari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
    expect(isAgentBrowser({ ...plain, userAgent: oldSafari })).toBe(false);
  });

  it("skips a browser carrying the launcher's cookie, wherever it sits", () => {
    expect(
      isAgentBrowser({ ...plain, cookie: `${AGENT_BROWSER_COOKIE}=1` })
    ).toBe(true);
    expect(
      isAgentBrowser({
        ...plain,
        cookie: `ph_x=abc; ${AGENT_BROWSER_COOKIE}=1; other=2`,
      })
    ).toBe(true);
  });

  it("ignores a cookie that only starts with the same letters", () => {
    expect(
      isAgentBrowser({
        ...plain,
        cookie: `${AGENT_BROWSER_COOKIE}_old=1; x_${AGENT_BROWSER_COOKIE}=1`,
      })
    ).toBe(false);
  });

  it("skips automation that sets navigator.webdriver", () => {
    expect(isAgentBrowser({ ...plain, webdriver: true })).toBe(true);
  });

  it("skips the Claude desktop app's built-in browser", () => {
    const claudePane = `${STOCK_CHROME.replace(" Safari/537.36", "")} Claude/4.2.1 Electron/38.0.0 Safari/537.36`;
    expect(isAgentBrowser({ ...plain, userAgent: claudePane })).toBe(true);
  });

  it("skips headless Chrome, which reported webdriver false on 2026-11-09", () => {
    const headless = STOCK_CHROME.replace("Chrome/", "HeadlessChrome/");
    expect(isAgentBrowser({ ...plain, userAgent: headless })).toBe(true);
  });
});

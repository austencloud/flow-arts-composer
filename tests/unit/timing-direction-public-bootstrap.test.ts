// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { detectSiteMode } from "../../src/config/domains";
import { TIMING_DIRECTION_ARTICLE_SLUGS } from "../../src/routes/(public)/timing-and-direction/_data/timing-direction-articles";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const bootScript = [
  ...readFileSync("src/app.html", "utf8").matchAll(
    /<script>([\s\S]*?)<\/script>/g
  ),
].find((match) => match[1]?.includes("var isLanding ="))?.[1];

afterEach(() => window.history.replaceState({}, "", "/"));

describe("public timing and direction entry points", () => {
  it.each(["", ...TIMING_DIRECTION_ARTICLE_SLUGS.map((slug) => `/${slug}`)])(
    "keeps direct visits to /timing-and-direction%s out of app initialization",
    (suffix) => {
      window.history.replaceState({}, "", `/timing-and-direction${suffix}`);
      expect(detectSiteMode()).toBe("landing");
      const bootWindow = { location: { pathname: window.location.pathname } };
      expect(bootScript).toBeDefined();
      runInNewContext(bootScript!, { window: bootWindow });
      expect(bootWindow).toHaveProperty("__tkaIsLanding", true);
    }
  );

  it("leaves the composer in app mode", () => {
    window.history.replaceState({}, "", "/create");
    expect(detectSiteMode()).toBe("app");
  });
});

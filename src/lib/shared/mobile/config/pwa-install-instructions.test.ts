import { describe, expect, it } from "vitest";
import {
  getInstallInstructions,
  resolveInstallVariant,
} from "./pwa-install-instructions";

describe("resolveInstallVariant", () => {
  it("picks ios-safari for the iPhone pill when the detected browser is Safari", () => {
    expect(
      resolveInstallVariant("ios", { platform: "ios", browser: "safari" })
    ).toEqual({ platform: "ios", browser: "safari" });
  });

  it("picks ios-safari for the iPhone pill when the visitor isn't on iOS at all", () => {
    expect(
      resolveInstallVariant("ios", { platform: "desktop", browser: "chrome" })
    ).toEqual({ platform: "ios", browser: "safari" });

    expect(
      resolveInstallVariant("ios", { platform: "android", browser: "chrome" })
    ).toEqual({ platform: "ios", browser: "safari" });
  });

  it("picks ios-other for the iPhone pill when on iOS with a non-Safari browser", () => {
    const variant = resolveInstallVariant("ios", {
      platform: "ios",
      browser: "chrome",
    });
    expect(variant.platform).toBe("ios");
    expect(variant.browser).not.toBe("safari");

    const instructions = getInstallInstructions(
      variant.platform,
      variant.browser
    );
    expect(instructions.steps[0]?.text).toContain("Safari");
  });

  it("picks android-samsung for the Android pill when the detected browser is Samsung Internet", () => {
    expect(
      resolveInstallVariant("android", {
        platform: "android",
        browser: "samsung",
      })
    ).toEqual({ platform: "android", browser: "samsung" });
  });

  it("picks android-chrome for the Android pill for any other detected browser", () => {
    expect(
      resolveInstallVariant("android", {
        platform: "android",
        browser: "chrome",
      })
    ).toEqual({ platform: "android", browser: "chrome" });

    expect(
      resolveInstallVariant("android", {
        platform: "desktop",
        browser: "firefox",
      })
    ).toEqual({ platform: "android", browser: "chrome" });
  });

  it("passes the detected browser through for the Computer pill on a computer", () => {
    expect(
      resolveInstallVariant("desktop", {
        platform: "desktop",
        browser: "firefox",
      })
    ).toEqual({ platform: "desktop", browser: "firefox" });
  });

  it("shows the Chrome computer steps when a phone picks Computer", () => {
    expect(
      resolveInstallVariant("desktop", {
        platform: "ios",
        browser: "safari",
      })
    ).toEqual({ platform: "desktop", browser: "chrome" });
  });
});

describe("getInstallInstructions", () => {
  it("android-chrome steps mention Install and create shortcut", () => {
    const instructions = getInstallInstructions("android", "chrome");
    const allText = instructions.steps.map((step) => step.text).join(" ");
    expect(allText).toContain("Install and create shortcut");
  });

  it("ios-safari steps mention Open as Web App", () => {
    const instructions = getInstallInstructions("ios", "safari");
    const allText = instructions.steps.map((step) => step.text).join(" ");
    expect(allText).toContain("Open as Web App");
  });
});

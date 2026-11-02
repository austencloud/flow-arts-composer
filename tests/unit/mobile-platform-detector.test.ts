// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPlatform } from "../../src/lib/shared/mobile/services/platform-detector";

const originalNavigator = globalThis.navigator;
const originalInnerWidth = window.innerWidth;
const originalMatchMedia = window.matchMedia;

function configureBrowser(options: {
  userAgent: string;
  maxTouchPoints: number;
  width: number;
  finePointer: boolean;
  hover: boolean;
}): void {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: options.userAgent,
      maxTouchPoints: options.maxTouchPoints,
    },
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: options.width,
    configurable: true,
  });
  window.matchMedia = vi.fn((query: string) => {
    const matches =
      query === "(pointer: fine)"
        ? options.finePointer
        : query === "(hover: hover)"
          ? options.hover
          : false;
    return { matches } as MediaQueryList;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: originalInnerWidth,
    configurable: true,
  });
  window.matchMedia = originalMatchMedia;
});

describe("mobile platform detector", () => {
  it("recognizes iPadOS desktop user agents before the desktop pointer gate", () => {
    configureBrowser({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5,
      width: 1366,
      finePointer: true,
      hover: true,
    });

    expect(detectPlatform()).toBe("ios");
  });

  it("keeps a real Mac with the same user-agent family on desktop", () => {
    configureBrowser({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      maxTouchPoints: 0,
      width: 1440,
      finePointer: true,
      hover: true,
    });

    expect(detectPlatform()).toBe("desktop");
  });

  it("still recognizes Android when the desktop capability gate is absent", () => {
    configureBrowser({
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
      maxTouchPoints: 5,
      width: 412,
      finePointer: false,
      hover: false,
    });

    expect(detectPlatform()).toBe("android");
  });
});

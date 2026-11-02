// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  supportsNativeFullscreen,
  requestNativeFullscreen,
  exitNativeFullscreen,
  isNativeFullscreenActive,
} from "../fullscreen-capabilities";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("supportsNativeFullscreen", () => {
  it("is false when the element exposes no fullscreen method (iPhone Safari)", () => {
    const el = {} as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(false);
  });

  it("is true when requestFullscreen exists", () => {
    const el = {
      requestFullscreen: () => Promise.resolve(),
    } as unknown as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(true);
  });

  it("is true when the webkit-prefixed method exists", () => {
    const el = {
      webkitRequestFullscreen: () => undefined,
    } as unknown as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(true);
  });
});

describe("requestNativeFullscreen", () => {
  it("calls requestFullscreen and resolves true", async () => {
    const fn = vi.fn(() => Promise.resolve());
    const el = { requestFullscreen: fn } as unknown as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns false when unsupported (no throw)", async () => {
    const el = {} as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(false);
  });

  it("returns false when the request rejects (user gesture / permission)", async () => {
    const el = {
      requestFullscreen: () => Promise.reject(new Error("denied")),
    } as unknown as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(false);
  });
});

describe("exitNativeFullscreen", () => {
  it("no-ops without throwing when nothing is fullscreen", async () => {
    vi.stubGlobal("document", {});
    await expect(exitNativeFullscreen()).resolves.toBeUndefined();
  });
});

describe("exitNativeFullscreen (dispatch)", () => {
  it("calls exitFullscreen when an element is fullscreen", async () => {
    const exit = vi.fn(() => Promise.resolve());
    vi.stubGlobal("document", { fullscreenElement: {}, exitFullscreen: exit });
    await exitNativeFullscreen();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("calls webkitExitFullscreen when only the webkit element is set", async () => {
    const webkitExit = vi.fn();
    vi.stubGlobal("document", {
      webkitFullscreenElement: {},
      webkitExitFullscreen: webkitExit,
    });
    await exitNativeFullscreen();
    expect(webkitExit).toHaveBeenCalledOnce();
  });
});

describe("isNativeFullscreenActive", () => {
  it("is false when no fullscreen element is present", () => {
    vi.stubGlobal("document", {});
    expect(isNativeFullscreenActive()).toBe(false);
  });

  it("is true when fullscreenElement is set", () => {
    vi.stubGlobal("document", { fullscreenElement: {} });
    expect(isNativeFullscreenActive()).toBe(true);
  });

  it("is true when only webkitFullscreenElement is set", () => {
    vi.stubGlobal("document", { webkitFullscreenElement: {} });
    expect(isNativeFullscreenActive()).toBe(true);
  });
});

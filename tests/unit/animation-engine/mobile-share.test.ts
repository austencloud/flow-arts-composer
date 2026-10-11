import { describe, it, expect, vi, beforeEach } from "vitest";

// downloadBlob / shareOrDownloadBlob gate on the DEVICE (detectPlatform), not on
// navigator.share existence — desktop Chrome/Edge implement the Web Share API,
// so capability-only detection pops the OS share sheet on desktop. Mock the
// detector so each test pins the platform branch under test.
vi.mock("#lib/shared/mobile/services/platform-detector.js", () => ({
  detectPlatform: vi.fn(() => "desktop"),
}));

import { downloadBlob } from "#lib/shared/foundation/services/file-downloader.js";
import { detectPlatform } from "#lib/shared/mobile/services/platform-detector.js";

function pinPlatform(p: "ios" | "android" | "desktop") {
  vi.mocked(detectPlatform).mockReturnValue(p);
}

function stubAnchor() {
  const clickFn = vi.fn();
  vi.spyOn(document, "createElement").mockReturnValue({
    set href(_: string) {},
    set download(_: string) {},
    style: {},
    click: clickFn,
  } as any);
  vi.spyOn(document.body, "appendChild").mockReturnValue({} as any);
  vi.spyOn(document.body, "removeChild").mockReturnValue({} as any);
  return clickFn;
}

describe("downloadBlob device-gated share/download", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pinPlatform("desktop");
  });

  it("mobile: uses navigator.share when canShare returns true", async () => {
    pinPlatform("ios");
    const shareFn = vi.fn().mockResolvedValue(undefined);
    const canShareFn = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { share: shareFn, canShare: canShareFn },
      writable: true,
      configurable: true,
    });

    const blob = new Blob(["video"], { type: "video/mp4" });
    const result = await downloadBlob(blob, "test.mp4");

    expect(canShareFn).toHaveBeenCalled();
    expect(shareFn).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.method).toBe("share");
    expect(result.canceled).toBeUndefined();
  });

  it("desktop: downloads to disk even when navigator.share exists (no share sheet)", async () => {
    pinPlatform("desktop");
    const shareFn = vi.fn().mockResolvedValue(undefined);
    const canShareFn = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { share: shareFn, canShare: canShareFn },
      writable: true,
      configurable: true,
    });
    const clickFn = stubAnchor();

    const blob = new Blob(["video"], { type: "video/mp4" });
    const result = await downloadBlob(blob, "test.mp4");

    // The regression guard: desktop must NOT pop the OS share sheet.
    expect(shareFn).not.toHaveBeenCalled();
    expect(clickFn).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.method).toBe("download");
  });

  it("mobile: falls back to anchor download when navigator.share is absent", async () => {
    pinPlatform("ios");
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
    const clickFn = stubAnchor();

    const blob = new Blob(["video"], { type: "video/mp4" });
    const result = await downloadBlob(blob, "test.mp4");

    expect(clickFn).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.method).toBe("download");
  });

  it("mobile: catches AbortError from dismissed share sheet", async () => {
    pinPlatform("ios");
    const abortError = new DOMException("Share canceled", "AbortError");
    const shareFn = vi.fn().mockRejectedValue(abortError);
    const canShareFn = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { share: shareFn, canShare: canShareFn },
      writable: true,
      configurable: true,
    });

    const blob = new Blob(["video"], { type: "video/mp4" });
    const result = await downloadBlob(blob, "test.mp4");

    expect(result.success).toBe(true);
    expect(result.method).toBe("share");
    expect(result.canceled).toBe(true);
  });
});

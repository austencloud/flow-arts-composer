import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { detectPlatform } = vi.hoisted(() => ({
  detectPlatform: vi.fn(() => "desktop" as string),
}));

vi.mock("$lib/shared/mobile/services/platform-detector", () => ({
  detectPlatform,
}));

import { shareOrCopyLink } from "$lib/shared/share/services/link-share";

const LINK = { url: "https://tkaflowarts.com/shape-engine?level=3" };

function stubNavigator(value: Partial<Navigator>): void {
  vi.stubGlobal("navigator", value as Navigator);
}

beforeEach(() => {
  detectPlatform.mockReturnValue("desktop");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("handing a link on", () => {
  it("keeps a desktop press on the clipboard, share sheet or not", async () => {
    // Chrome on Windows publishes navigator.share and opens an OS sheet. A
    // person at a keyboard asked for the address, not a detour.
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as never });

    await expect(shareOrCopyLink(LINK)).resolves.toBe("copied");

    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(LINK.url);
  });

  it("opens the phone's own sheet, where the messaging apps are", async () => {
    detectPlatform.mockReturnValue("ios");
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as never });

    await expect(shareOrCopyLink(LINK)).resolves.toBe("shared");

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: LINK.url })
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("treats a closed sheet as a choice, not a failure", async () => {
    // Nothing should be said, and nothing should land on the clipboard
    // behind the person's back.
    detectPlatform.mockReturnValue("android");
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as never });

    await expect(shareOrCopyLink(LINK)).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the sheet itself fails", async () => {
    detectPlatform.mockReturnValue("android");
    const share = vi.fn().mockRejectedValue(new Error("no sheet here"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as never });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(shareOrCopyLink(LINK)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK.url);
  });

  it("reports a failure the caller can speak about", async () => {
    stubNavigator({
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      } as never,
    });
    // The legacy path needs a document selection; jsdom has no execCommand.
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(shareOrCopyLink(LINK)).resolves.toBe("failed");
  });
});

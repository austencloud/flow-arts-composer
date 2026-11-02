// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canNativeShareFile,
  shareBlobNatively,
} from "../../src/lib/shared/foundation/services/file-downloader";

const originalNavigator = globalThis.navigator;

function setNavigator(value: Partial<Navigator>): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

describe("explicit native file sharing", () => {
  it("calls navigator.share synchronously in the initiating turn", async () => {
    let finishShare: (() => void) | undefined;
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShare = resolve;
        })
    );
    const canShare = vi.fn(() => true);
    setNavigator({ share, canShare });

    const operation = shareBlobNatively(
      new Blob(["card"], { type: "image/png" }),
      "card.png"
    );

    expect(canShare).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
    finishShare?.();
    await expect(operation).resolves.toEqual({
      status: "shared",
      filename: "card.png",
    });
  });

  it("reports an unsupported file without opening share or downloading", async () => {
    const share = vi.fn();
    const canShare = vi.fn(() => false);
    const createElement = vi.spyOn(document, "createElement");
    setNavigator({ share, canShare });

    const blob = new Blob(["card"], { type: "image/png" });
    expect(canNativeShareFile(blob, "card.png")).toBe(false);
    await expect(shareBlobNatively(blob, "card.png")).resolves.toEqual({
      status: "unavailable",
      filename: "card.png",
    });

    expect(share).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it("treats a dismissed share sheet as a neutral cancellation", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("Share dismissed", "AbortError"));
    setNavigator({ share, canShare: vi.fn(() => true) });

    await expect(
      shareBlobNatively(new Blob(["card"], { type: "image/png" }), "card.png")
    ).resolves.toEqual({
      status: "canceled",
      filename: "card.png",
    });
  });

  it("reports non-abort failures without silently downloading", async () => {
    const failure = new DOMException("Activation expired", "NotAllowedError");
    const share = vi.fn().mockRejectedValue(failure);
    const createElement = vi.spyOn(document, "createElement");
    setNavigator({ share, canShare: vi.fn(() => true) });

    const result = await shareBlobNatively(
      new Blob(["card"], { type: "image/png" }),
      "card.png"
    );

    expect(result.status).toBe("failed");
    expect(result.filename).toBe("card.png");
    expect(result.status === "failed" && result.error.name).toBe(
      "NotAllowedError"
    );
    expect(createElement).not.toHaveBeenCalled();
  });
});

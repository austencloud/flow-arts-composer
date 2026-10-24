import { afterEach, describe, expect, it, vi } from "vitest";

// Android's WebView has no navigator.share, so inside the app a file only
// reaches the system share sheet through the app's own plugin. If that
// fallback silently stops being taken, Share in the app does nothing at all.
const capacitor = vi.hoisted(() => ({
  platform: "web",
  pluginAvailable: false,
  shareFile: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => capacitor.platform,
    isPluginAvailable: () => capacitor.pluginAvailable,
  },
  registerPlugin: () => ({ shareFile: capacitor.shareFile }),
}));

import {
  canNativeShareFile,
  shareBlobNatively,
  supportsNativeFileShare,
} from "../../src/lib/shared/foundation/services/file-downloader";

const originalNavigator = globalThis.navigator;

function setNavigator(value: Partial<Navigator>): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  capacitor.platform = "web";
  capacitor.pluginAvailable = false;
  capacitor.shareFile.mockReset();
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

describe("file sharing inside the Android app", () => {
  it("hands the file to the app's share sheet when the WebView has none", async () => {
    capacitor.platform = "android";
    capacitor.pluginAvailable = true;
    capacitor.shareFile.mockResolvedValue({ shown: true });
    setNavigator({});

    const blob = new Blob(["card"], { type: "image/png" });
    expect(supportsNativeFileShare()).toBe(true);
    expect(canNativeShareFile(blob, "card.png")).toBe(true);
    await expect(
      shareBlobNatively(blob, "card.png", { title: "ABC" })
    ).resolves.toEqual({ status: "shared", filename: "card.png" });

    expect(capacitor.shareFile).toHaveBeenCalledWith({
      data: btoa("card"),
      filename: "card.png",
      mimeType: "image/png",
      title: "ABC",
      text: undefined,
    });
  });

  it("reports a plugin failure instead of claiming the file was shared", async () => {
    capacitor.platform = "android";
    capacitor.pluginAvailable = true;
    capacitor.shareFile.mockRejectedValue(new Error("no activity"));
    setNavigator({});

    const result = await shareBlobNatively(
      new Blob(["card"], { type: "image/png" }),
      "card.png"
    );
    expect(result.status).toBe("failed");
  });

  it("is unavailable in an app build that predates the plugin", async () => {
    capacitor.platform = "android";
    capacitor.pluginAvailable = false;
    setNavigator({});

    expect(supportsNativeFileShare()).toBe(false);
    await expect(
      shareBlobNatively(new Blob(["card"]), "card.png")
    ).resolves.toEqual({ status: "unavailable", filename: "card.png" });
    expect(capacitor.shareFile).not.toHaveBeenCalled();
  });

  it("keeps the browser's own share sheet where one exists", async () => {
    capacitor.platform = "android";
    capacitor.pluginAvailable = true;
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, canShare: vi.fn(() => true) });

    await shareBlobNatively(new Blob(["card"]), "card.png");
    expect(share).toHaveBeenCalledOnce();
    expect(capacitor.shareFile).not.toHaveBeenCalled();
  });
});

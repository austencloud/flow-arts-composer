import { describe, expect, it } from "vitest";
import {
  shouldDeliverPendingVideo,
  videoDownloadSettingsKey,
} from "./video-download-intent";

describe("pending video download delivery", () => {
  const ready = {
    pending: true,
    sheetOpen: true,
    requestVersion: 4,
    pendingRequestVersion: 4,
    status: "ready" as const,
    hasBlob: true,
    currentSettingsKey: "1080|60|1|",
    requestedSettingsKey: "1080|60|1|",
    currentSourceKey: "Video",
    requestedSourceKey: "Video",
  };

  it("delivers the file after the requested render finishes", () => {
    expect(shouldDeliverPendingVideo(ready)).toBe(true);
  });

  it("does not deliver a render after cancel or close", () => {
    expect(shouldDeliverPendingVideo({ ...ready, status: "canceled" })).toBe(
      false
    );
    expect(shouldDeliverPendingVideo({ ...ready, sheetOpen: false })).toBe(
      false
    );
  });

  it("does not deliver an older render after another request replaces it", () => {
    expect(shouldDeliverPendingVideo({ ...ready, requestVersion: 5 })).toBe(
      false
    );
  });

  it("does not deliver when settings or the current view changes", () => {
    expect(
      shouldDeliverPendingVideo({ ...ready, currentSettingsKey: "2160|60|1|" })
    ).toBe(false);
    expect(
      shouldDeliverPendingVideo({ ...ready, currentSourceKey: "Mandala" })
    ).toBe(false);
  });

  it("invalidates a prepared file only for settings the exporter consumes", () => {
    const twoDimensional = {
      resolution: 1080,
      fps: 60,
      repeats: 1,
      quality: "standard",
      is3DExport: false,
    };
    expect(
      videoDownloadSettingsKey({ ...twoDimensional, quality: "cinema" })
    ).toBe(videoDownloadSettingsKey(twoDimensional));
    expect(
      videoDownloadSettingsKey({ ...twoDimensional, resolution: 2160 })
    ).not.toBe(videoDownloadSettingsKey(twoDimensional));
    expect(
      videoDownloadSettingsKey({
        ...twoDimensional,
        is3DExport: true,
        quality: "cinema",
      })
    ).not.toBe(
      videoDownloadSettingsKey({ ...twoDimensional, is3DExport: true })
    );
  });
});

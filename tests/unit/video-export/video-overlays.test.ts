import { describe, expect, it } from "vitest";
import {
  VIDEO_HEADER_KEYS,
  VIDEO_OVERLAY_KEYS,
  fillRowSpans,
  isVideoOverlays,
  readStoredVideoOverlays,
  showsVideoHeader,
  toggleVideoOverlay,
  toggleWholeVideoHeader,
  videoOverlayExport,
  videoOverlaysFrom,
  type VideoOverlays,
} from "#lib/shared/video-export/domain/video-overlays.js";

const allOn = Object.fromEntries(
  VIDEO_OVERLAY_KEYS.map((key) => [key, true])
) as VideoOverlays;

describe("video overlays", () => {
  it("starts from what the canvas shows, every header part with the header", () => {
    const canvas: Record<string, boolean> = {
      wordHeader: true,
      progressBar: false,
      tkaGlyph: true,
      stepNumbers: false,
      elementalGlyph: true,
    };
    const overlays = videoOverlaysFrom((key) => canvas[key]!, false);
    for (const key of VIDEO_HEADER_KEYS) expect(overlays[key]).toBe(true);
    expect(overlays).toMatchObject({
      progressBar: false,
      tkaGlyph: true,
      stepNumbers: false,
      elementalGlyph: true,
      grid: false,
    });
  });

  it("accepts only a complete on/off list", () => {
    expect(isVideoOverlays(allOn)).toBe(true);
    expect(isVideoOverlays({ ...allOn, progressBar: "yes" })).toBe(false);
    const { grid: _dropped, ...partial } = allOn;
    expect(isVideoOverlays(partial)).toBe(false);
    expect(isVideoOverlays(null)).toBe(false);
  });

  it("reads a list saved before the header had parts", () => {
    const old = {
      wordHeader: false,
      progressBar: true,
      tkaGlyph: false,
      stepNumbers: true,
      elementalGlyph: false,
    };
    const overlays = readStoredVideoOverlays(old)!;
    expect(showsVideoHeader(overlays)).toBe(false);
    expect(overlays.grid).toBe(true);
    expect(overlays.progressBar).toBe(true);
    expect(overlays.stepNumbers).toBe(true);
    expect(readStoredVideoOverlays({ wordHeader: true })).toBeNull();
    expect(readStoredVideoOverlays("nope")).toBeNull();
    expect(readStoredVideoOverlays(allOn)).toEqual(allOn);
  });

  it("switches the whole header off while any part shows, and back on", () => {
    const onePart = { ...toggleWholeVideoHeader(allOn), headerLoop: true };
    expect(showsVideoHeader(onePart)).toBe(true);
    const off = toggleWholeVideoHeader(onePart);
    for (const key of VIDEO_HEADER_KEYS) expect(off[key]).toBe(false);
    const on = toggleWholeVideoHeader(off);
    for (const key of VIDEO_HEADER_KEYS) expect(on[key]).toBe(true);
    expect(on.grid).toBe(true);
  });

  it("never keeps an empty strip for a part the sequence lacks", () => {
    const available = ["headerWord", "headerLevel"] as const;
    const wordOff = toggleVideoOverlay(allOn, "headerWord", available);
    expect(wordOff.headerLoop).toBe(true);
    const bothOff = toggleVideoOverlay(wordOff, "headerLevel", available);
    expect(showsVideoHeader(bothOff)).toBe(false);
    const back = toggleWholeVideoHeader(
      { ...allOn, headerWord: false, headerLevel: false },
      available
    );
    for (const key of VIDEO_HEADER_KEYS) expect(back[key]).toBe(true);
    expect(toggleVideoOverlay(allOn, "grid").grid).toBe(false);
  });

  it("drops the header strip from the export once every part is off", () => {
    const noHeader = toggleWholeVideoHeader(allOn);
    const exported = videoOverlayExport({ ...noHeader, grid: false });
    expect(exported.overlayOverrides.wordHeader).toBe(false);
    expect(exported.gridVisible).toBe(false);
    const wordOnly = videoOverlayExport({ ...noHeader, headerWord: true });
    expect(wordOnly.overlayOverrides.wordHeader).toBe(true);
    expect(wordOnly.overlayOverrides.headerLevel).toBe(false);
  });

  it("fills every pill row", () => {
    expect(fillRowSpans(0)).toEqual([]);
    expect(fillRowSpans(1)).toEqual([6]);
    expect(fillRowSpans(3)).toEqual([2, 2, 2]);
    expect(fillRowSpans(4)).toEqual([3, 3, 3, 3]);
    expect(fillRowSpans(5)).toEqual([2, 2, 2, 3, 3]);
    expect(fillRowSpans(6)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(fillRowSpans(7)).toEqual([2, 2, 2, 3, 3, 3, 3]);
  });
});

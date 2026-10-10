import { describe, expect, it, vi } from "vitest";
import { reportViewerControlChange } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

describe("viewer control analytics sink", () => {
  it("forwards one scalar transition with intent metadata", () => {
    const sink = vi.fn();

    expect(
      reportViewerControlChange(
        sink,
        "video_export",
        "resolution",
        1080,
        2160,
        { coalesce: true, count: false }
      )
    ).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      "video_export",
      "resolution",
      1080,
      2160,
      { coalesce: true, count: false }
    );
  });

  it("drops re-selecting the active value", () => {
    const sink = vi.fn();

    expect(
      reportViewerControlChange(
        sink,
        "record_scene",
        "camera_mode",
        "free",
        "free"
      )
    ).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });
});

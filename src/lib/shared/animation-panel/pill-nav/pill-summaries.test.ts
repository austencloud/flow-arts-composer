import { describe, expect, it, vi } from "vitest";

// The key itself stands in for the words, so the test pins which key each
// state picks and how the parts are joined, not a catalog's wording.
vi.mock("#lib/shared/i18n/i18n.svelte.js", () => ({
  t: (key: string) => key,
}));

import { computeExportBoxValues, type ExportBoxInput } from "./pill-summaries";

const base: ExportBoxInput = {
  renderMode: "2d",
  opener: "first-beat",
  fps: 60,
  resolution: 1080,
  quality: "standard",
  startHold: true,
  endHold: true,
  loopCount: 1,
  carousel: "off",
};

describe("computeExportBoxValues", () => {
  it("names 2D quality as frame rate and resolution only", () => {
    expect(computeExportBoxValues(base).quality).toBe("60 fps · 1080p");
    expect(
      computeExportBoxValues({ ...base, fps: 30, resolution: 2160 }).quality
    ).toBe("30 fps · 4K");
  });

  it("adds the render quality only in 3D, with square resolutions", () => {
    expect(
      computeExportBoxValues({
        ...base,
        renderMode: "3d",
        quality: "cinema",
      }).quality
    ).toBe("60 fps · 1080×1080 · share_quality_cinema");
  });

  it("lists only the holds that are on, then the loop count", () => {
    expect(computeExportBoxValues(base).timing).toBe(
      "viewer_ui_start · create_ui_end · 1×"
    );
    expect(
      computeExportBoxValues({ ...base, startHold: false, loopCount: 3 }).timing
    ).toBe("create_ui_end · 3×");
    expect(
      computeExportBoxValues({ ...base, startHold: false, endHold: false })
        .timing
    ).toBe("1×");
  });

  it("maps each opener and carousel placement to its own key", () => {
    expect(computeExportBoxValues({ ...base, opener: "mandala" }).opens).toBe(
      "share_mandala"
    );
    expect(
      computeExportBoxValues({ ...base, opener: "this-frame" }).opens
    ).toBe("share_current_frame");
    expect(computeExportBoxValues({ ...base, carousel: "left" }).carousel).toBe(
      "share_video_carousel_left"
    );
  });
});

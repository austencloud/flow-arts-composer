import { describe, expect, it } from "vitest";
import {
  isViewerPaneReadyToReveal,
  resolveViewerPanelDirection,
  resolveViewerPanelLayout,
  resolveViewerPaneDestinationBox,
  resolveViewerPaneRevealReady,
} from "$lib/shared/sequence-viewer/components/viewer-panel-layout";

const desktopSplit = {
  isFullscreen: false,
  fullscreenStackVertical: false,
  isMobile: false,
  isLandscapeMobile: false,
  adaptiveVerticalSplit: false,
  focusedPane: null,
  practiceActive: false,
  practiceCanvasFraction: 0.5,
} as const;

describe("resolveViewerPanelLayout", () => {
  it("moves a desktop split between equal and focused allocations", () => {
    expect(resolveViewerPanelLayout(desktopSplit)).toEqual({
      direction: "horizontal",
      sizes: [1, 1],
    });
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        focusedPane: "animation",
      })
    ).toEqual({ direction: "horizontal", sizes: [1, 0] });
    expect(
      resolveViewerPanelLayout({ ...desktopSplit, focusedPane: "image" })
    ).toEqual({ direction: "horizontal", sizes: [0, 1] });
  });

  it("uses vertical allocation on portrait mobile and adaptive desktop", () => {
    expect(
      resolveViewerPanelLayout({ ...desktopSplit, isMobile: true }).direction
    ).toBe("vertical");
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        adaptiveVerticalSplit: true,
      }).direction
    ).toBe("vertical");
  });

  it("keeps landscape mobile and horizontal fullscreen side by side", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        isMobile: true,
        isLandscapeMobile: true,
      }).direction
    ).toBe("horizontal");
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        isMobile: true,
        isFullscreen: true,
      }).direction
    ).toBe("horizontal");
  });

  it("lets fullscreen choose a vertical stack", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        isFullscreen: true,
        fullscreenStackVertical: true,
      }).direction
    ).toBe("vertical");
  });

  it("preserves the desktop Practice ratio and clamps invalid fractions", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        focusedPane: "animation",
        practiceActive: true,
        practiceCanvasFraction: 0.38,
      }).sizes
    ).toEqual([0.38, 0.62]);
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        practiceActive: true,
        practiceCanvasFraction: Number.NaN,
      }).sizes
    ).toEqual([0.5, 0.5]);
  });

  it("preserves the content-sized Practice lane on portrait mobile", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktopSplit,
        isMobile: true,
        practiceActive: true,
      })
    ).toEqual({
      direction: "vertical",
      sizes: [1, 1],
      previewPreferredSize: "auto",
    });
  });
});

describe("resolveViewerPanelDirection", () => {
  it("retains the last Side-by-Side axis through focus and its release", () => {
    expect(
      resolveViewerPanelDirection({
        responsiveDirection: "vertical",
        retainedSplitDirection: "horizontal",
        focusedPane: "image",
        focusReleasePending: false,
      })
    ).toBe("horizontal");
    expect(
      resolveViewerPanelDirection({
        responsiveDirection: "vertical",
        retainedSplitDirection: "horizontal",
        focusedPane: null,
        focusReleasePending: true,
      })
    ).toBe("horizontal");
  });

  it("accepts the responsive axis after the workspace settles", () => {
    expect(
      resolveViewerPanelDirection({
        responsiveDirection: "vertical",
        retainedSplitDirection: "horizontal",
        focusedPane: null,
        focusReleasePending: false,
      })
    ).toBe("vertical");
  });
});

describe("isViewerPaneReadyToReveal", () => {
  it("does not expose a newly focused Card while its track is still a sliver", () => {
    const input = {
      pane: "image",
      focusedPane: "image",
      direction: "horizontal",
      width: 6,
      height: 847,
      stageWidth: 762,
      stageHeight: 847,
    } as const;
    expect(resolveViewerPaneRevealReady(input)).toBe(false);
    expect(resolveViewerPaneRevealReady({ ...input, width: 240 })).toBe(true);
    // A reversal must close the gate again rather than latching readiness.
    expect(resolveViewerPaneRevealReady({ ...input, width: 35 })).toBe(false);
  });

  it("allows a settled compact viewport without accepting an opening sliver", () => {
    const input = {
      pane: "animation",
      focusedPane: "animation",
      direction: "horizontal",
      width: 640,
      height: 196,
      stageWidth: 640,
      stageHeight: 200,
    } as const;
    expect(resolveViewerPaneRevealReady(input)).toBe(true);
    expect(resolveViewerPaneRevealReady({ ...input, height: 20 })).toBe(false);
    expect(resolveViewerPaneRevealReady({ ...input, width: 0 })).toBe(false);
  });

  it("requires readable geometry on both panel axes instead of a timer", () => {
    expect(isViewerPaneReadyToReveal("horizontal", 239, 900)).toBe(false);
    expect(isViewerPaneReadyToReveal("horizontal", 240, 239)).toBe(false);
    expect(isViewerPaneReadyToReveal("horizontal", 240, 240)).toBe(true);
    expect(isViewerPaneReadyToReveal("vertical", 900, 239)).toBe(false);
    expect(isViewerPaneReadyToReveal("vertical", 239, 900)).toBe(false);
    expect(isViewerPaneReadyToReveal("vertical", 240, 900)).toBe(true);
  });

  it("requires a fresh readable frame after a pane has been covered", () => {
    expect(
      resolveViewerPaneRevealReady({
        pane: "image",
        focusedPane: "animation",
        direction: "horizontal",
        width: 480,
        height: 640,
      })
    ).toBe(false);

    expect(
      resolveViewerPaneRevealReady({
        pane: "image",
        focusedPane: null,
        direction: "horizontal",
        width: 0,
        height: 640,
      })
    ).toBe(false);

    expect(
      resolveViewerPaneRevealReady({
        pane: "image",
        focusedPane: null,
        direction: "horizontal",
        width: 240,
        height: 640,
      })
    ).toBe(true);
  });
});

describe("resolveViewerPaneDestinationBox", () => {
  it("gives a focused pane the whole split", () => {
    expect(
      resolveViewerPaneDestinationBox({
        pane: "image",
        direction: "vertical",
        sizes: [0, 1],
        splitWidth: 928,
        splitHeight: 741,
      })
    ).toEqual({ width: 928, height: 741 });
  });

  it("splits along the panel direction", () => {
    expect(
      resolveViewerPaneDestinationBox({
        pane: "animation",
        direction: "horizontal",
        sizes: [1, 1],
        splitWidth: 1200,
        splitHeight: 800,
      })
    ).toEqual({ width: 600, height: 800 });

    expect(
      resolveViewerPaneDestinationBox({
        pane: "image",
        direction: "vertical",
        sizes: [1, 1],
        splitWidth: 1200,
        splitHeight: 800,
      })
    ).toEqual({ width: 1200, height: 400 });
  });

  it("honors an uneven allocation", () => {
    expect(
      resolveViewerPaneDestinationBox({
        pane: "image",
        direction: "horizontal",
        sizes: [3, 1],
        splitWidth: 1000,
        splitHeight: 500,
      })
    ).toEqual({ width: 250, height: 500 });
  });

  it("has no box for a pane that is collapsing away", () => {
    expect(
      resolveViewerPaneDestinationBox({
        pane: "image",
        direction: "vertical",
        sizes: [1, 0],
        splitWidth: 928,
        splitHeight: 741,
      })
    ).toBeNull();
  });

  it("has no box before the split is measured", () => {
    expect(
      resolveViewerPaneDestinationBox({
        pane: "image",
        direction: "vertical",
        sizes: [0, 1],
        splitWidth: 0,
        splitHeight: 741,
      })
    ).toBeNull();
  });
});

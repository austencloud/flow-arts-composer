import { describe, expect, it } from "vitest";
import { resolveViewerPanelLayout } from "./viewer-panel-layout";

const desktop = {
  isFullscreen: false,
  fullscreenStackVertical: false,
  isMobile: false,
  isLandscapeMobile: false,
  adaptiveVerticalSplit: false,
  focusedPane: null,
  practiceActive: false,
  practiceCanvasFraction: 0.5,
} as const;

describe("resolveViewerPanelLayout with a user split share", () => {
  it("uses the share for the unfocused Side by Side split", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktop,
        userSplitShares: { horizontal: 0.62 },
      })
    ).toEqual({
      direction: "horizontal",
      sizes: [0.62, 0.38],
    });
  });

  it("keeps 50/50 when no share is given for the resolved axis", () => {
    expect(resolveViewerPanelLayout(desktop).sizes).toEqual([1, 1]);
    expect(
      resolveViewerPanelLayout({
        ...desktop,
        userSplitShares: { vertical: 0.4 },
      }).sizes
    ).toEqual([1, 1]);
    expect(
      resolveViewerPanelLayout({
        ...desktop,
        adaptiveVerticalSplit: true,
        userSplitShares: { vertical: 0.4 },
      })
    ).toEqual({ direction: "vertical", sizes: [0.4, 0.6] });
  });

  it("lets focus and Practice override the share", () => {
    expect(
      resolveViewerPanelLayout({
        ...desktop,
        userSplitShares: { horizontal: 0.62, vertical: 0.4 },
        focusedPane: "image",
      }).sizes
    ).toEqual([0, 1]);
    expect(
      resolveViewerPanelLayout({
        ...desktop,
        userSplitShares: { horizontal: 0.62, vertical: 0.4 },
        practiceActive: true,
        practiceCanvasFraction: 0.38,
      }).sizes
    ).toEqual([0.38, 0.62]);
  });
});

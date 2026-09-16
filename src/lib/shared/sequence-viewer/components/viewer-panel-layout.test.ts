import { beforeEach, describe, expect, it } from "vitest";
import {
  clearViewerCardPaneBoxes,
  readViewerCardPaneBox,
  rememberViewerCardPaneBox,
  rememberViewerSplitCardPaneBox,
  resolveViewerCardMotionBox,
  resolveViewerPanelLayout,
} from "./viewer-panel-layout";

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

describe("the Card's motion box after the user resizes the split", () => {
  const viewport = { key: "split", vw: 1600, vh: 900 };

  beforeEach(() => {
    clearViewerCardPaneBoxes();
  });

  it("remembers the pane box the user's share produces", () => {
    rememberViewerCardPaneBox(viewport.key, viewport.vw, viewport.vh, {
      width: 1002,
      height: 847,
    });

    const box = rememberViewerSplitCardPaneBox({
      ...viewport,
      direction: "horizontal",
      share: 0.7,
      splitWidth: 1600,
      splitHeight: 847,
    });

    expect(box?.width).toBeCloseTo(480);
    expect(box?.height).toBe(847);
    expect(
      readViewerCardPaneBox(viewport.key, viewport.vw, viewport.vh)
    ).toBe(box);
  });

  it("gives the Card its live pane once the user has shrunk it", () => {
    // The Card settled at a wide pane, then the user dragged the divider so the
    // animation takes more room. The pane the Card now occupies is honest, not
    // a mid-animation sliver, so the stale wide box must not win.
    rememberViewerCardPaneBox(viewport.key, viewport.vw, viewport.vh, {
      width: 1002,
      height: 847,
    });
    rememberViewerSplitCardPaneBox({
      ...viewport,
      direction: "horizontal",
      share: 0.7,
      splitWidth: 1600,
      splitHeight: 847,
    });

    const live = { width: 479, height: 847 };
    expect(
      resolveViewerCardMotionBox({
        remembered: readViewerCardPaneBox(
          viewport.key,
          viewport.vw,
          viewport.vh
        ),
        live,
        inMotion: false,
      })
    ).toEqual(live);
  });

  it("leaves the memo alone while the split is unmeasured", () => {
    expect(
      rememberViewerSplitCardPaneBox({
        ...viewport,
        direction: "horizontal",
        share: 0.7,
        splitWidth: 0,
        splitHeight: 0,
      })
    ).toBeNull();
    expect(
      readViewerCardPaneBox(viewport.key, viewport.vw, viewport.vh)
    ).toBeNull();
  });
});

describe("resolveViewerCardMotionBox", () => {
  const remembered = { width: 800, height: 600 };

  it("uses the live box before this layout has settled once", () => {
    const live = { width: 300, height: 600 };
    expect(
      resolveViewerCardMotionBox({ remembered: null, live, inMotion: false })
    ).toEqual(live);
  });

  it("holds the remembered box while the pane is in motion", () => {
    expect(
      resolveViewerCardMotionBox({
        remembered,
        live: { width: 300, height: 600 },
        inMotion: true,
      })
    ).toEqual(remembered);
    expect(
      resolveViewerCardMotionBox({ remembered, live: null, inMotion: false })
    ).toEqual(remembered);
  });

  it("treats a pane measurably smaller than the settled box as still opening", () => {
    expect(
      resolveViewerCardMotionBox({
        remembered,
        live: { width: 700, height: 600 },
        inMotion: false,
      })
    ).toEqual(remembered);
    const settled = { width: 790, height: 600 };
    expect(
      resolveViewerCardMotionBox({ remembered, live: settled, inMotion: false })
    ).toEqual(settled);
  });
});

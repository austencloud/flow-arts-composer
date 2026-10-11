import { describe, expect, it } from "vitest";
import {
  fitEffectQuickPicker,
  QUICK_PICKER_EDGE,
  QUICK_PICKER_MAX_SIDE_WIDTH,
  QUICK_PICKER_OFF_WIDTH,
  QUICK_PICKER_OFFSET,
  QUICK_PICKER_STRIP_PAD,
  sidePanelHeight,
  stripHeight,
} from "./effect-quick-picker-fit";
import {
  CATALOG_GAP,
  CATALOG_TILE_BORDER,
  CATALOG_TILE_PAD,
  MIN_CATALOG_PORTRAIT,
} from "./effect-catalog-fit";

const COUNT = 20;
const INSET = CATALOG_TILE_PAD + CATALOG_TILE_BORDER;

// Measured on /create/generate at 1440x900 while playing: the playback area
// (right of the 64px sidebar, between the toolbars) and the player in it.
const laptop = {
  bounds: { left: 65, top: 77, width: 1365, height: 774 },
  player: { left: 440, top: 81, width: 614, height: 658 },
  count: COUNT,
};

describe("fitEffectQuickPicker", () => {
  it("puts pictures beside a laptop player, on the right", () => {
    const fit = fitEffectQuickPicker(laptop);
    expect(fit.arrangement).toBe("side");
    if (fit.arrangement !== "side") return;
    expect(fit.side).toBe("right");
    expect(fit.catalog?.cols).toBe(4);
    expect(fit.catalog?.portrait).toBeGreaterThanOrEqual(MIN_CATALOG_PORTRAIT);
    expect(sidePanelHeight(fit.catalog, COUNT)).toBeLessThanOrEqual(
      laptop.bounds.height - 2 * QUICK_PICKER_EDGE
    );
  });

  it("measures its room from its bounds, not the viewport", () => {
    // The left of the viewport holds the app's sidebar: a panel sized from
    // the viewport's edge covered it.
    const fit = fitEffectQuickPicker({
      ...laptop,
      bounds: { ...laptop.bounds, width: 1300 },
    });
    expect(fit.arrangement === "side" && fit.side).toBe("left");
    expect(fit.arrangement === "side" && fit.width).toBeLessThanOrEqual(
      laptop.player.left -
        laptop.bounds.left -
        QUICK_PICKER_OFFSET -
        QUICK_PICKER_EDGE
    );
  });

  it("opens to the left when only the left has room", () => {
    const fit = fitEffectQuickPicker({
      ...laptop,
      player: { ...laptop.player, left: 780 },
    });
    expect(fit.arrangement === "side" && fit.side).toBe("left");
  });

  it("grows with a 4K player instead of staying laptop-sized", () => {
    const fit = fitEffectQuickPicker({
      bounds: { left: 0, top: 0, width: 3840, height: 2160 },
      player: { left: 1014, top: 150, width: 1866, height: 1910 },
      count: COUNT,
    });
    expect(fit.arrangement === "side" && fit.width).toBe(
      QUICK_PICKER_MAX_SIDE_WIDTH
    );
    expect(fit.arrangement === "side" && fit.catalog?.portrait).toBeGreaterThan(
      90
    );
  });

  it("keeps the icon tiles where five rows of pictures are too tall", () => {
    const fit = fitEffectQuickPicker({
      bounds: { left: 0, top: 0, width: 960, height: 412 },
      player: { left: 160, top: 70, width: 156, height: 200 },
      count: COUNT,
    });
    expect(fit.arrangement).toBe("side");
    if (fit.arrangement !== "side") return;
    expect(fit.catalog).toBeNull();
    expect(sidePanelHeight(null, COUNT)).toBeLessThanOrEqual(
      412 - 2 * QUICK_PICKER_EDGE
    );
  });

  it.each([
    ["phone", 375, 343],
    ["tablet", 820, 770],
  ])(
    "lays one scrolling row over a %s player that fills the width",
    (_, viewportWidth, playerWidth) => {
      const fit = fitEffectQuickPicker({
        bounds: { left: 0, top: 0, width: viewportWidth, height: 1000 },
        player: {
          left: (viewportWidth - playerWidth) / 2,
          top: 120,
          width: playerWidth,
          height: playerWidth + 44,
        },
        count: COUNT,
      });
      expect(fit.arrangement).toBe("strip");
      if (fit.arrangement !== "strip") return;
      expect(fit.catalog.rows).toBe(1);
      expect(fit.catalog.cols).toBe(COUNT);
      // The last tile in view is cut part way, so the row reads as scrollable.
      const room =
        playerWidth -
        2 * QUICK_PICKER_STRIP_PAD -
        QUICK_PICKER_OFF_WIDTH -
        CATALOG_GAP;
      const inView = room / (fit.catalog.portrait + 2 * INSET + CATALOG_GAP);
      const peek = inView - Math.floor(inView);
      expect(peek).toBeGreaterThan(0.25);
      expect(peek).toBeLessThan(0.75);
      expect(fit.trackWidth).toBeGreaterThan(room);
    }
  );

  // Measured on /create/generate at 375x667 while playing: the content area
  // above the bottom navigation, and the player with its controls.
  const phone = {
    bounds: { left: 0, top: 0, width: 375, height: 623 },
    player: { left: 12, top: 126, width: 351, height: 387 },
    count: COUNT,
  };

  it("hangs the row below the controls where the toolbar leaves room", () => {
    const fit = fitEffectQuickPicker(phone);
    expect(fit.arrangement).toBe("strip");
    if (fit.arrangement !== "strip") return;
    expect(fit.side).toBe("below");
    expect(
      phone.player.top +
        phone.player.height +
        stripHeight(fit.catalog.portrait) +
        QUICK_PICKER_EDGE
    ).toBeLessThanOrEqual(phone.bounds.top + phone.bounds.height);
  });

  it("lifts the row above the controls where nothing below has room", () => {
    const fit = fitEffectQuickPicker({
      ...phone,
      bounds: { ...phone.bounds, height: 540 },
    });
    expect(fit.arrangement).toBe("strip");
    if (fit.arrangement !== "strip") return;
    expect(fit.side).toBe("above");
  });
});

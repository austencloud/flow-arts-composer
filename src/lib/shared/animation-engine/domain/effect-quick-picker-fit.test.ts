import { describe, expect, it } from "vitest";
import {
  fitEffectQuickPicker,
  QUICK_PICKER_CLOSE_WIDTH,
  QUICK_PICKER_EDGE,
  QUICK_PICKER_MAX_SIDE_WIDTH,
  QUICK_PICKER_MAX_STRIP_PORTRAIT,
  QUICK_PICKER_MIN_NARROW_SIDE_WIDTH,
  QUICK_PICKER_OFF_WIDTH,
  QUICK_PICKER_OFFSET,
  QUICK_PICKER_STRIP_GAP,
  QUICK_PICKER_STRIP_PAD,
  QUICK_PICKER_STRIP_EDGE_CLEAR,
  sidePanelHeight,
  stripHeight,
  stripPageTarget,
  stripTilePitch,
} from "./effect-quick-picker-fit";
import {
  CATALOG_GAP,
  CATALOG_TILE_BORDER,
  CATALOG_TILE_PAD,
  MIN_CATALOG_PORTRAIT,
} from "./effect-catalog-fit";

const COUNT = 20;
const INSET = CATALOG_TILE_PAD + CATALOG_TILE_BORDER;

// Measured on /create/generate at 1440x900 while playing: the content area
// (right of the 64px sidebar) and the player in it.
const laptop = {
  bounds: { left: 64, top: 0, width: 1366, height: 900 },
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

  // Measured on /create/generate while playing: a small square player with
  // too little room beside it for four pictures across.
  it.each([
    [
      "landscape phone (844x390)",
      { left: 72, top: 0, width: 762, height: 390 },
      { left: 351, top: 81, width: 205, height: 249 },
    ],
    [
      "laptop at 200% zoom (720x450)",
      { left: 0, top: 0, width: 720, height: 405 },
      { left: 252, top: 81, width: 216, height: 260 },
    ],
  ])("scrolls two pictures across beside a %s player", (_, bounds, player) => {
    // Too little room under the controls for a strip there: before this
    // panel, the strip covered the animation's bottom edge.
    const fit = fitEffectQuickPicker({
      bounds,
      player,
      roomBelow: 8,
      count: COUNT,
    });
    expect(fit.arrangement).toBe("side");
    if (fit.arrangement !== "side") return;
    expect(fit.catalog?.cols).toBe(2);
    expect(fit.width).toBeGreaterThanOrEqual(
      QUICK_PICKER_MIN_NARROW_SIDE_WIDTH
    );
    expect(fit.height).toBe(player.height);
    expect(sidePanelHeight(fit.catalog, COUNT)).toBeGreaterThan(player.height);
  });

  it.each([
    ["phone", 375, 343],
    ["tablet", 820, 770],
    // Pictures at their largest: before, the last tile in view showed whole
    // or nearly so, and the row read as complete.
    ["wide window", 1180, 1100],
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
        QUICK_PICKER_CLOSE_WIDTH -
        2 * CATALOG_GAP;
      const inView = room / (fit.catalog.portrait + 2 * INSET + CATALOG_GAP);
      const peek = inView - Math.floor(inView);
      expect(peek).toBeGreaterThan(0.25);
      expect(peek).toBeLessThan(0.75);
      expect(fit.trackWidth).toBeGreaterThan(room);
    }
  );

  // Measured on /create/generate while playing: the content area above the
  // bottom navigation, the player with its controls, and the room under them
  // before the toolbar (or, on the tablet, the open notation rail).
  const phone = {
    bounds: { left: 0, top: 0, width: 375, height: 623 },
    player: { left: 13, top: 119, width: 350, height: 394 },
    roomBelow: 47,
    count: COUNT,
  };
  const tallPhone = {
    bounds: { left: 0, top: 0, width: 412, height: 871 },
    player: { left: 13, top: 225, width: 387, height: 431 },
    roomBelow: 152,
    count: COUNT,
  };
  const tablet = {
    bounds: { left: 0, top: 0, width: 810, height: 1135 },
    player: { left: 13, top: 112, width: 785, height: 829 },
    roomBelow: 104,
    count: COUNT,
  };

  function strip(box: Parameters<typeof fitEffectQuickPicker>[0]) {
    const fit = fitEffectQuickPicker(box);
    if (fit.arrangement !== "strip") throw new Error("expected a strip");
    return fit;
  }

  it("floats the row under the controls where the room there holds it", () => {
    const fit = strip(tallPhone);
    expect(fit.side).toBe("below");
    expect(fit.height).toBe(stripHeight(fit.catalog.portrait));
    expect(fit.height + QUICK_PICKER_STRIP_GAP).toBeLessThanOrEqual(
      tallPhone.roomBelow
    );
  });

  it("floats the row over the notation rail it hides", () => {
    const fit = strip(tablet);
    expect(fit.side).toBe("below");
    expect(fit.height + QUICK_PICKER_STRIP_GAP).toBeLessThanOrEqual(
      tablet.roomBelow
    );
  });

  // Measured from a report at a 1050px window: the room under the controls
  // held the row but not with the gap above it at the pictures' largest.
  it("shrinks the pictures before it gives up the room under the controls", () => {
    const box = {
      bounds: { left: 0, top: 0, width: 1050, height: 1160 },
      player: { left: 84, top: 83, width: 877, height: 939 },
      roomBelow: 107,
      count: COUNT,
    };
    const fit = strip(box);
    expect(fit.side).toBe("below");
    expect(fit.catalog.portrait).toBeLessThan(QUICK_PICKER_MAX_STRIP_PORTRAIT);
    expect(fit.height + QUICK_PICKER_STRIP_GAP).toBeLessThanOrEqual(
      box.roomBelow
    );
  });

  it("docks along the bottom when the room under the controls is short", () => {
    const fit = strip(phone);
    expect(fit.side).toBe("dock");
    expect(fit.height).toBe(stripHeight(fit.catalog.portrait));
    expect(
      phone.player.top + phone.player.height + fit.height
    ).toBeLessThanOrEqual(phone.bounds.top + phone.bounds.height);
  });

  it("lays the row over the animation only when nothing else fits", () => {
    const fit = strip({
      ...phone,
      bounds: { ...phone.bounds, height: 540 },
    });
    expect(fit.side).toBe("above");
  });
});

describe("stripPageTarget", () => {
  // The 1050x1210 window's row: 108px tiles, 740px of them in view.
  const portrait = 108 - 2 * INSET;
  const pitch = stripTilePitch(portrait);
  const tile = pitch - CATALOG_GAP;
  const row = {
    portrait,
    viewWidth: 740,
    scrollWidth: 20 * pitch - CATALOG_GAP,
  };
  const clear = QUICK_PICKER_STRIP_EDGE_CLEAR;

  it("brings the tile cut at the end to rest clear of the start's fade", () => {
    const cut = 6; // Ghost: its right edge passes the end's fade.
    expect(cut * pitch + tile).toBeGreaterThan(row.viewWidth - clear);
    expect((cut - 1) * pitch + tile).toBeLessThanOrEqual(row.viewWidth - clear);
    const left = stripPageTarget({ ...row, scrollLeft: 0, direction: 1 });
    expect(cut * pitch - left).toBe(clear);
  });

  it("brings the tile cut at the start to rest clear of the end's fade", () => {
    const first = 12; // The first tile clear of the start's fade.
    const scrollLeft = first * pitch - clear;
    const left = stripPageTarget({ ...row, scrollLeft, direction: -1 });
    const cut = first - 1;
    expect(cut * pitch + tile - left).toBe(row.viewWidth - clear);
  });

  it("stops at either end of the row", () => {
    const end = row.scrollWidth - row.viewWidth;
    expect(
      stripPageTarget({ ...row, scrollLeft: end - 50, direction: 1 })
    ).toBe(end);
    expect(stripPageTarget({ ...row, scrollLeft: 50, direction: -1 })).toBe(0);
  });

  it("moves at least one tile even where the view holds barely one", () => {
    const narrow = { ...row, viewWidth: 150 };
    expect(
      stripPageTarget({ ...narrow, scrollLeft: 0, direction: 1 })
    ).toBeGreaterThanOrEqual(pitch);
  });
});

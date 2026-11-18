import { describe, expect, it } from "vitest";
import {
  fitEffectQuickPicker,
  gridPanelHeight,
  pictureTileHeight,
  QUICK_PICKER_EDGE,
  QUICK_PICKER_HEAD,
  QUICK_PICKER_HEAD_GAP,
  QUICK_PICKER_MAX_SIDE_WIDTH,
  QUICK_PICKER_MAX_STRIP_PORTRAIT,
  QUICK_PICKER_MIN_NARROW_SIDE_WIDTH,
  QUICK_PICKER_MIN_PLAYER_SCALE,
  QUICK_PICKER_FLOOR_PLAYER_SCALE,
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
import { EFFECTS } from "../../effects/domain/effect-meta";

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
    expect(fit.catalog?.portrait).toBeGreaterThanOrEqual(MIN_CATALOG_PORTRAIT);
  });

  it("stands the laptop player's full height, not a short box at its foot", () => {
    // Austen, 2026-10-30: the panel took 353px of a 658px player.
    const fit = fitEffectQuickPicker(laptop);
    if (fit.arrangement !== "side") throw new Error(fit.arrangement);
    expect(fit.height).toBe(laptop.player.height);
    expect(fit.scrolls).toBe(false);
    expect(fit.catalog?.fill).toBe(true);
    // Larger pictures than four across the same width would give.
    const fourAcross = Math.floor(
      (fit.width - 24 - 3 * CATALOG_GAP) / 4 - 2 * INSET
    );
    expect(fit.catalog?.portrait).toBeGreaterThan(fourAcross);
  });

  it("keeps its own height beside a player too short to share", () => {
    const fit = fitEffectQuickPicker({
      ...laptop,
      player: { ...laptop.player, height: 260 },
    });
    if (fit.arrangement !== "side") throw new Error(fit.arrangement);
    expect(fit.height).toBeNull();
    expect(fit.catalog?.fill ?? false).toBe(false);
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
    ["tablet", 820, 770],
    // Pictures at their largest: before, the last tile in view showed whole
    // or nearly so, and the row read as complete.
    ["wide window", 1180, 1100],
  ])(
    "lays one scrolling row over a %s player with too little room under it for a grid",
    (_, viewportWidth, playerWidth) => {
      // 110px under the player: the row docks there, the grid's title row
      // and a row and a half of pictures do not fit.
      const fit = fitEffectQuickPicker({
        bounds: {
          left: 0,
          top: 0,
          width: viewportWidth,
          height: 120 + playerWidth + 44 + 110,
        },
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

  // Measured on /create/generate while playing: the content area above the
  // bottom navigation, the player with its controls, and the room under them
  // before the toolbar (or, on the tablet, the open notation rail).
  // A phone held upright is never a strip (it has its own describe below):
  // this is the narrowest window that is not a phone.
  const phone = {
    bounds: { left: 0, top: 0, width: 500, height: 748 },
    player: { left: 12, top: 119, width: 475, height: 519 },
    roomBelow: 47,
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

  it("floats the row over the notation rail it hides", () => {
    // The room under the tablet's player holds no row and a half of its
    // grid, so it keeps the row, sized to the rail.
    const fit = strip(tablet);
    expect(fit.side).toBe("below");
    expect(fit.height).toBe(stripHeight(fit.catalog.portrait));
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

  it("keeps one row where there is no control row to cover", () => {
    const fit = strip({ ...phone, controls: 0 });
    expect(fit.rows).toBe(1);
    expect(fit.cover).toBe(0);
    expect(fit.side).toBe("dock");
  });

  it("keeps one row floating under the tablet's controls", () => {
    const fit = strip({ ...tablet, controls: 44 });
    expect(fit.side).toBe("below");
    expect(fit.rows).toBe(1);
    expect(fit.cover).toBe(0);
  });
});

describe("fitEffectQuickPicker on a phone held upright", () => {
  const count = EFFECTS.length;
  const controls = 44;

  // The Construct player on each phone: `bounds` is the content area (room
  // from its top to the bottom navigation), the player's box its square
  // animation plus the 44px control row, `roomAbove` the empty room between
  // the player's top and the area's top. The first three follow the sizes
  // worked out for the design (344x760, 360x591, 387x775); the rest are laid
  // out the same way.
  function phoneBox(opts: {
    width: number;
    boundsTop: number;
    boundsHeight: number;
    playerWidth: number;
    animation: number;
    playerTop: number;
  }) {
    return {
      bounds: {
        left: 0,
        top: opts.boundsTop,
        width: opts.width,
        height: opts.boundsHeight,
      },
      player: {
        left: (opts.width - opts.playerWidth) / 2,
        top: opts.playerTop,
        width: opts.playerWidth,
        height: opts.animation + controls,
      },
      roomAbove: opts.playerTop - opts.boundsTop,
      controls,
      count,
    };
  }

  const sizes = {
    "344x760": phoneBox({
      width: 344,
      boundsTop: 53,
      boundsHeight: 663,
      playerWidth: 336,
      animation: 319,
      playerTop: 136,
    }),
    "360x591": phoneBox({
      width: 360,
      boundsTop: 53,
      boundsHeight: 494,
      playerWidth: 354,
      animation: 329,
      playerTop: 53,
    }),
    "360x640": phoneBox({
      width: 360,
      boundsTop: 53,
      boundsHeight: 543,
      playerWidth: 354,
      animation: 329,
      playerTop: 53,
    }),
    "375x667": phoneBox({
      width: 375,
      boundsTop: 53,
      boundsHeight: 569,
      playerWidth: 369,
      animation: 344,
      playerTop: 53,
    }),
    "387x775": phoneBox({
      width: 387,
      boundsTop: 54,
      boundsHeight: 677,
      playerWidth: 364,
      animation: 325,
      playerTop: 54,
    }),
    "412x915": phoneBox({
      width: 412,
      boundsTop: 53,
      boundsHeight: 818,
      playerWidth: 387,
      animation: 387,
      playerTop: 225,
    }),
  };
  type SizeName = keyof typeof sizes;

  function phoneFit(name: SizeName) {
    const box = sizes[name];
    const fit = fitEffectQuickPicker(box);
    if (fit.arrangement !== "grid") {
      throw new Error(`expected the grid at ${name}, got ${fit.arrangement}`);
    }
    return { box, fit };
  }

  it.each(Object.keys(sizes) as SizeName[])(
    "%s: four across and four down, docked, never the strip or a scroll",
    (name) => {
      const { box, fit } = phoneFit(name);
      expect(fit.side).toBe("dock");
      expect(fit.catalog.cols).toBe(4);
      expect(fit.catalog.rows).toBe(4);
      expect(fit.scrolls).toBe(false);
      expect(fit.short).toBe(0);
      expect(fit.shift).toBe(0);
      if (fit.catalog.orientation === "dense") {
        expect(fit.catalog.tile).toBe(34);
        expect(fit.catalog.gap).toBe(4);
      } else {
        expect(fit.catalog.portrait).toBeGreaterThanOrEqual(
          MIN_CATALOG_PORTRAIT
        );
      }
      // Nothing under the floors: the player 80%, or 75% with the rows tight.
      expect(fit.scale).toBeGreaterThanOrEqual(
        fit.tight
          ? QUICK_PICKER_FLOOR_PLAYER_SCALE
          : QUICK_PICKER_MIN_PLAYER_SCALE
      );
      expect(fit.scale).toBeLessThanOrEqual(1);
      expect(fit.lift).toBeLessThanOrEqual(box.roomAbove);
      // The lifted, shrunk animation's bottom edge stays above the sheet.
      const animation = box.player.height - controls;
      const bottom = box.player.top - fit.lift + animation * fit.scale;
      const floor = box.bounds.top + box.bounds.height;
      expect(bottom + fit.height).toBeLessThanOrEqual(floor + 0.5);
    }
  );

  it("387x775: pictures at their smallest, not lifted, the player scaled to about 87%", () => {
    const { fit } = phoneFit("387x775");
    expect(fit.catalog.orientation).toBe("stack");
    expect(fit.catalog.portrait).toBe(MIN_CATALOG_PORTRAIT);
    expect(fit.lift).toBe(0);
    expect(fit.tight).toBe(false);
    // 12 + 44 + 8 + 36 + 8 + (4 x 64 + 3 x 6) + 12, and the sheet's border.
    expect(fit.height).toBe(395);
    expect(fit.scale).toBeCloseTo(0.868, 2);
  });

  it("344x760: pictures 75 x 64, the player lifted to the top and scaled to 84%", () => {
    const { box, fit } = phoneFit("344x760");
    expect(fit.catalog.orientation).toBe("stack");
    expect(fit.catalog.portrait).toBe(MIN_CATALOG_PORTRAIT);
    expect(pictureTileHeight(fit.catalog.portrait)).toBe(64);
    expect(fit.height).toBe(395);
    expect(fit.lift).toBe(box.roomAbove);
    expect(fit.scale).toBeCloseTo(0.84, 2);
    expect(fit.tight).toBe(false);
  });

  it("360x591: dense tiles 34 tall, the rows tight, the player at 76%", () => {
    const { fit } = phoneFit("360x591");
    expect(fit.catalog.orientation).toBe("dense");
    expect(fit.tight).toBe(true);
    // 8 + 36 + 6 + 32 + 6 + (4 x 34 + 3 x 4) + 8, and the border.
    expect(fit.height).toBe(245);
    expect(fit.scale).toBeCloseTo(0.757, 2);
    expect(fit.scale).toBeLessThan(QUICK_PICKER_MIN_PLAYER_SCALE);
  });

  it.each(["360x640", "375x667"] as SizeName[])(
    "%s: dense tiles with the ordinary rows, the player over 80%",
    (name) => {
      const { fit } = phoneFit(name);
      expect(fit.catalog.orientation).toBe("dense");
      expect(fit.tight).toBe(false);
      // 12 + 44 + 8 + 36 + 8 + 148 + 12, and the border.
      expect(fit.height).toBe(269);
      expect(fit.scale).toBeGreaterThanOrEqual(QUICK_PICKER_MIN_PLAYER_SCALE);
    }
  );

  it("412x915: the largest pictures, the player lifted and whole", () => {
    const { box, fit } = phoneFit("412x915");
    expect(fit.catalog.orientation).toBe("stack");
    expect(fit.catalog.portrait).toBeGreaterThan(MIN_CATALOG_PORTRAIT);
    expect(fit.scale).toBe(1);
    expect(fit.lift).toBeGreaterThan(0);
    expect(fit.lift).toBeLessThan(box.roomAbove);
    expect(fit.tight).toBe(false);
  });

  it("lifts only as far as the sheet needs, to the pixel", () => {
    const { box, fit } = phoneFit("412x915");
    const floor = box.bounds.top + box.bounds.height;
    const bottom = box.player.top - fit.lift + (box.player.height - controls);
    expect(floor - fit.height - bottom).toBeGreaterThanOrEqual(0);
    expect(floor - fit.height - bottom).toBeLessThan(1);
  });

  it("scales the player from its top edge also where it has no room to lift", () => {
    const { box, fit } = phoneFit("387x775");
    expect(box.roomAbove).toBe(0);
    expect(fit.lift).toBe(0);
    expect(fit.scale).toBeLessThan(1);
  });

  it("never picks the strip or a scroll for any portrait phone", () => {
    for (let height = 520; height <= 1000; height += 20) {
      for (const width of [320, 344, 360, 375, 390, 412, 430]) {
        if (height - 53 - 44 <= width) continue; // not held upright
        const fit = fitEffectQuickPicker({
          bounds: { left: 0, top: 53, width, height: height - 53 - 44 },
          player: {
            left: 3,
            top: 83,
            width: width - 6,
            height: width - 6 + controls,
          },
          roomAbove: 30,
          controls,
          count,
        });
        expect(fit.arrangement).toBe("grid");
        if (fit.arrangement !== "grid") continue;
        expect(fit.catalog.cols).toBe(4);
        expect(fit.scrolls).toBe(false);
      }
    }
  });

  it("leaves the laptop and landscape phone panels beside the player", () => {
    expect(
      fitEffectQuickPicker({
        bounds: { left: 64, top: 0, width: 1366, height: 900 },
        player: { left: 440, top: 81, width: 614, height: 658 },
        count,
      }).arrangement
    ).toBe("side");
    const landscape = fitEffectQuickPicker({
      bounds: { left: 72, top: 0, width: 762, height: 390 },
      player: { left: 351, top: 81, width: 205, height: 249 },
      roomBelow: 8,
      count,
    });
    expect(landscape.arrangement).toBe("side");
  });

  it("a window wider than a phone keeps the older grid, with room for the hand row", () => {
    const fit = fitEffectQuickPicker({
      bounds: { left: 0, top: 0, width: 600, height: 1100 },
      player: { left: 13, top: 60, width: 574, height: 574 + controls },
      controls,
      count,
    });
    if (fit.arrangement !== "grid") return;
    expect(fit.tight).toBe(false);
    expect(gridPanelHeight(fit.catalog)).toBeGreaterThan(
      2 * QUICK_PICKER_STRIP_PAD +
        QUICK_PICKER_HEAD +
        QUICK_PICKER_HEAD_GAP +
        fit.catalog.rows * pictureTileHeight(fit.catalog.portrait)
    );
  });
});

describe("fitEffectQuickPicker sliding a centred player aside", () => {
  const count = EFFECTS.length;
  // Measured on /create/construct while playing on an unfolded Galaxy Z Fold
  // 6: the content area above the bottom navigation, the player's stage, the
  // notation rail under it, and the empty room on either side of the player
  // in the layout it is centred in.
  const foldSideways = {
    bounds: { left: 0, top: 0, width: 823, height: 663 },
    player: { left: 208, top: 81, width: 408, height: 452 },
    roomBelow: 73,
    roomBeside: 195,
    count,
  };
  const foldUpright = {
    bounds: { left: 0, top: 0, width: 707, height: 779 },
    player: { left: 101, top: 77, width: 505, height: 545 },
    roomBelow: 74,
    roomBeside: 88.5,
    count,
  };

  /** A box whose fields are prototype getters, as a DOMRect's are: the
   *  component passes the player's measured DOMRect straight in. */
  class GetterRect {
    readonly #box: { left: number; top: number; width: number; height: number };
    constructor(box: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) {
      this.#box = box;
    }
    get left() {
      return this.#box.left;
    }
    get top() {
      return this.#box.top;
    }
    get width() {
      return this.#box.width;
    }
    get height() {
      return this.#box.height;
    }
  }

  it("fits a measured DOMRect player exactly as it fits a plain box", () => {
    // A spread of a DOMRect copies none of its fields: the slid player came
    // out NaN wide, and the upright Fold got a 25px side panel.
    for (const box of [
      foldSideways,
      foldUpright,
      { ...foldUpright, roomBelow: 88.66 },
    ]) {
      const measured = fitEffectQuickPicker({
        ...box,
        bounds: new GetterRect(box.bounds),
        player: new GetterRect(box.player),
      });
      expect(measured).toEqual(fitEffectQuickPicker(box));
      if (measured.arrangement === "side") {
        expect(Number.isFinite(measured.width)).toBe(true);
      }
    }
  });

  it("slides the sideways Fold's player left so every effect shows beside it", () => {
    // Before, the picker was one row under the canvas showing two and a half
    // effects, with 195px of nothing on either side of the canvas.
    const fit = fitEffectQuickPicker(foldSideways);
    expect(fit.arrangement).toBe("side");
    if (fit.arrangement !== "side") return;
    expect(fit.side).toBe("right");
    expect(fit.shift).toBeLessThan(0);
    expect(-fit.shift).toBeLessThanOrEqual(foldSideways.roomBeside);
    expect(fit.lift).toBe(0);
    expect(fit.scale).toBe(1);
    // Four pictures across sharing the player's height, every row in view.
    expect(fit.catalog?.cols).toBe(4);
    expect(fit.catalog?.fill).toBe(true);
    expect(fit.height).toBe(foldSideways.player.height);
    expect(fit.scrolls).toBe(false);
    // The panel beside the slid player stays inside the bounds.
    const slidRight =
      foldSideways.player.left + fit.shift + foldSideways.player.width;
    expect(
      slidRight + QUICK_PICKER_OFFSET + fit.width + QUICK_PICKER_EDGE
    ).toBeLessThanOrEqual(foldSideways.bounds.left + foldSideways.bounds.width);
  });

  it("slides only as far as the panel needs", () => {
    const fit = fitEffectQuickPicker({ ...foldSideways, roomBeside: 400 });
    if (fit.arrangement !== "side") throw new Error("expected a side panel");
    const atRest = fitEffectQuickPicker({ ...foldSideways, roomBeside: 0 });
    expect(atRest.arrangement).not.toBe("side");
    // A pixel less and the panel would be narrower than it is.
    expect(-fit.shift).toBeLessThan(400);
    expect(fit.width).toBe(
      foldSideways.bounds.width -
        (foldSideways.player.left + fit.shift + foldSideways.player.width) -
        QUICK_PICKER_OFFSET -
        QUICK_PICKER_EDGE
    );
  });

  it("keeps the upright Fold's picker under the player", () => {
    // The room beside a player that nearly fills the width is too narrow
    // for the panel even slid all the way over.
    const fit = fitEffectQuickPicker(foldUpright);
    expect(fit.arrangement).not.toBe("side");
    expect(fit.shift).toBe(0);
  });

  it("never slides a player whose room beside it already holds the panel", () => {
    const fit = fitEffectQuickPicker({
      bounds: { left: 64, top: 0, width: 1366, height: 900 },
      player: { left: 440, top: 81, width: 614, height: 658 },
      roomBeside: 370,
      count,
    });
    expect(fit.arrangement).toBe("side");
    expect(fit.shift).toBe(0);
  });

  it("never slides a phone held upright, whose player fills the width", () => {
    const fit = fitEffectQuickPicker({
      bounds: { left: 0, top: 0, width: 375, height: 623 },
      player: { left: 13, top: 119, width: 350, height: 394 },
      roomBelow: 47,
      roomBeside: 0,
      count,
    });
    expect(fit.arrangement).not.toBe("side");
    expect(fit.shift).toBe(0);
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

  it("goes back as far as keeps the tile cut at the start in clear view", () => {
    const first = 12; // The first tile clear of the start's fade.
    const left = stripPageTarget({
      ...row,
      scrollLeft: first * pitch - clear,
      direction: -1,
    });
    const cutRight = (first - 1) * pitch + tile;
    expect(cutRight - left).toBeLessThanOrEqual(row.viewWidth - clear);
    // One tile further back would push it under the end's fade.
    expect(cutRight - (left - pitch)).toBeGreaterThan(row.viewWidth - clear);
  });

  it("stops where a swipe would settle: a tile clear of the start's fade", () => {
    for (const direction of [1, -1] as const) {
      const left = stripPageTarget({
        ...row,
        scrollLeft: 8 * pitch - clear,
        direction,
      });
      expect((left + clear) % pitch).toBe(0);
    }
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

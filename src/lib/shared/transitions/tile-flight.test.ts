import { describe, expect, it, vi } from "vitest";
import {
  ARM_EXPIRY_MS,
  createTileFlight,
  flightGeometry,
  isPlainPress,
  TILE_WINDOW_NAME,
} from "./tile-flight.svelte";

/** Press, navigate and land, the way the root layout reports it. */
function flyTo(
  flight: ReturnType<typeof createTileFlight>,
  href = "/composer"
) {
  flight.arm("composer", href);
  flight.navigationStarting(href.split("#")[0]);
  flight.navigationSettled("/", href.split("#")[0]!);
}

describe("arming a tile flight", () => {
  it("flies only the pressed tile, only to where it was pressed for", () => {
    const flight = createTileFlight();
    flight.arm("composer", "/composer");

    expect(flight.decide("/", "/composer")).toBe("open");
    expect(flight.decide("/", "/faq")).toBeNull();
    expect(flight.decide("/about", "/composer")).toBeNull();
    expect(flight.isFlying("composer")).toBe(true);
    expect(flight.isFlying("faq")).toBe(false);
  });

  it("does not fly for the header's link to the same URL", () => {
    const flight = createTileFlight();
    flight.navigationStarting("/composer");
    expect(flight.decide("/", "/composer")).toBeNull();
  });

  it("reads a chip's destination without its hash", () => {
    const flight = createTileFlight();
    flight.arm("guide", "/guide#start");
    expect(flight.decide("/", "/guide")).toBe("open");
  });

  it("lets go when the press's navigation is cancelled", () => {
    const flight = createTileFlight();
    flight.arm("composer", "/composer");
    flight.disarm();

    expect(flight.decide("/", "/composer")).toBeNull();
    expect(flight.isFlying("composer")).toBe(false);
  });

  it("lets go when another navigation replaces the press", () => {
    const flight = createTileFlight();
    flight.arm("composer", "/composer");
    flight.navigationStarting("/faq");
    expect(flight.decide("/", "/composer")).toBeNull();
  });

  it("lets go by itself when no navigation ever starts", () => {
    vi.useFakeTimers();
    const flight = createTileFlight();
    flight.arm("composer", "/composer");
    vi.advanceTimersByTime(ARM_EXPIRY_MS);
    expect(flight.isFlying("composer")).toBe(false);
    vi.useRealTimers();
  });

  it("clears the press once the navigation lands", () => {
    const flight = createTileFlight();
    flyTo(flight);
    expect(flight.armedRoute).toBeNull();
    expect(flight.decide("/", "/composer")).toBeNull();
  });
});

describe("the trip back", () => {
  it("flies back into the tile after a tile flight", () => {
    const flight = createTileFlight();
    flyTo(flight);
    expect(flight.decide("/composer", "/")).toBe("close");

    flight.begin("close");
    expect(flight.isFlying("composer")).toBe(true);
    expect(flight.isFlying("faq")).toBe(false);
  });

  it("does not fly back after arriving by the header link", () => {
    const flight = createTileFlight();
    flight.navigationStarting("/composer");
    flight.navigationSettled("/", "/composer");
    expect(flight.decide("/composer", "/")).toBeNull();
  });

  it("flies back only once", () => {
    const flight = createTileFlight();
    flyTo(flight);
    flight.navigationSettled("/composer", "/");
    expect(flight.decide("/composer", "/")).toBeNull();
  });

  it("forgets the tile once the visitor moves on to another page", () => {
    const flight = createTileFlight();
    flyTo(flight);
    flight.navigationSettled("/composer", "/faq");
    flight.navigationSettled("/faq", "/composer");
    expect(flight.decide("/composer", "/")).toBeNull();
  });

  it("keeps the tile through a hash change on the same page", () => {
    const flight = createTileFlight();
    flyTo(flight);
    flight.navigationSettled("/composer", "/composer");
    expect(flight.decide("/composer", "/")).toBe("close");
  });

  it("forgets an earlier flight when a later trip came by the header", () => {
    const flight = createTileFlight();
    flyTo(flight);
    flight.navigationSettled("/composer", "/");
    flight.navigationSettled("/", "/composer");
    expect(flight.decide("/composer", "/")).toBeNull();
  });
});

describe("what each end calls itself", () => {
  it("names only the arriving page of an opening flight", () => {
    const flight = createTileFlight();
    flight.arm("faq", "/faq");
    expect(flight.arrivingContentName("/faq")).toBeUndefined();

    flight.begin("open");
    expect(flight.arrivingContentName("/faq")).toBe(TILE_WINDOW_NAME);
    expect(flight.arrivingContentName("/")).toBeUndefined();

    flight.end();
    expect(flight.arrivingContentName("/faq")).toBeUndefined();
  });

  it("names the homepage as it arrives on the trip back", () => {
    const flight = createTileFlight();
    flyTo(flight);
    expect(flight.arrivingContentName("/")).toBeUndefined();

    flight.begin("close");
    expect(flight.arrivingContentName("/")).toBe("page-arriving");
    expect(flight.arrivingContentName("/composer")).toBeUndefined();

    flight.end();
    expect(flight.arrivingContentName("/")).toBeUndefined();
  });

  it("leaves the homepage unnamed in a glide between hosts", () => {
    const flight = createTileFlight();
    flight.begin("resident");
    expect(flight.arrivingContentName("/")).toBeUndefined();
  });

  it("fades the arriving page only in a glide, never in a tile flight", () => {
    const flight = createTileFlight();
    expect(flight.contentFades).toBe(false);
    flight.begin("resident");
    expect(flight.contentFades).toBe(true);
    flight.begin("close");
    expect(flight.contentFades).toBe(false);
    flight.begin("open");
    expect(flight.contentFades).toBe(false);
  });
});

describe("isPlainPress", () => {
  const press = (overrides: Partial<MouseEvent> = {}) =>
    ({
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    }) as MouseEvent;

  it("rejects anything that opens elsewhere or was already handled", () => {
    expect(isPlainPress(press())).toBe(true);
    expect(isPlainPress(press({ ctrlKey: true }))).toBe(false);
    expect(isPlainPress(press({ metaKey: true }))).toBe(false);
    expect(isPlainPress(press({ shiftKey: true }))).toBe(false);
    expect(isPlainPress(press({ altKey: true }))).toBe(false);
    expect(isPlainPress(press({ button: 1 }))).toBe(false);
    expect(isPlainPress(press({ defaultPrevented: true }))).toBe(false);
  });
});

describe("flightGeometry", () => {
  const viewport = { width: 1000, height: 800 };
  const tile = { x: 100, y: 500, width: 200, height: 150 };
  const home = { x: 0, y: 64, width: 1000, height: 736 };
  const page = { x: 0, y: 64, width: 1000, height: 3000 };
  const open = { direction: "open", tile, page, home, viewport } as const;
  const close = { ...open, direction: "close" } as const;

  it("opens from the tile to the part of the page on screen", () => {
    const vars = flightGeometry(open);
    expect(vars["--tile-flight-from-x"]).toBe("100px");
    expect(vars["--tile-flight-from-y"]).toBe("500px");
    expect(vars["--tile-flight-from-w"]).toBe("200px");
    expect(vars["--tile-flight-from-h"]).toBe("150px");
    // Stops at the bottom of the screen, not the bottom of a tall page.
    expect(vars["--tile-flight-to-x"]).toBe("0px");
    expect(vars["--tile-flight-to-y"]).toBe("64px");
    expect(vars["--tile-flight-to-w"]).toBe("1000px");
    expect(vars["--tile-flight-to-h"]).toBe("736px");
  });

  it("closes as the mirror of opening", () => {
    const opening = flightGeometry(open);
    const closing = flightGeometry(close);
    for (const edge of ["x", "y", "w", "h"]) {
      expect(closing[`--tile-flight-from-${edge}`]).toBe(
        opening[`--tile-flight-to-${edge}`]
      );
      expect(closing[`--tile-flight-to-${edge}`]).toBe(
        opening[`--tile-flight-from-${edge}`]
      );
    }
  });

  it("keeps the page box whole, so its picture stays pinned", () => {
    const vars = flightGeometry(open);
    expect(vars["--tile-flight-page-y"]).toBe("64px");
    expect(vars["--tile-flight-page-h"]).toBe("3000px");
    expect(vars["--tile-flight-tile-y"]).toBe("500px");
    expect(vars["--tile-flight-tile-h"]).toBe("150px");
  });

  it("starts from what was on screen when the page was scrolled", () => {
    const vars = flightGeometry({
      ...close,
      page: { x: 0, y: -400, width: 1000, height: 3000 },
    });
    expect(vars["--tile-flight-page-y"]).toBe("-400px");
    expect(vars["--tile-flight-from-y"]).toBe("0px");
    expect(vars["--tile-flight-from-h"]).toBe("800px");
    // The middle of the screen is 800px down a page that starts 400px above it.
    expect(vars["--tile-flight-screen-x"]).toBe("500px");
    expect(vars["--tile-flight-screen-y"]).toBe("800px");
  });

  it("scales a tall page about the middle of what is on screen", () => {
    const vars = flightGeometry(open);
    expect(vars["--tile-flight-screen-x"]).toBe("500px");
    expect(vars["--tile-flight-screen-y"]).toBe("368px");
  });

  it("recedes the homepage into the tile's centre, from the home box's corner", () => {
    const vars = flightGeometry({
      ...open,
      home: { x: 40, y: 64, width: 960, height: 736 },
    });
    expect(vars["--tile-flight-origin-x"]).toBe("160px");
    expect(vars["--tile-flight-origin-y"]).toBe("511px");
  });
});

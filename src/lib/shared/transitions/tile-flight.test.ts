import { describe, expect, it, vi } from "vitest";
import {
  ARM_EXPIRY_MS,
  createTileFlight,
  flightGeometry,
  isPlainPress,
} from "./tile-flight.svelte";

/** Press, navigate and land, the way the root layout reports it. */
function flyTo(
  flight: ReturnType<typeof createTileFlight>,
  href = "/composer"
) {
  flight.arm(href);
  flight.navigationStarting(href.split("#")[0]);
  flight.navigationSettled("/", href.split("#")[0]!);
}

describe("arming a tile flight", () => {
  it("flies only to where the tile was pressed for", () => {
    const flight = createTileFlight();
    flight.arm("/composer");

    expect(flight.decide("/", "/composer")).toBe("open");
    expect(flight.decide("/", "/faq")).toBeNull();
    expect(flight.decide("/about", "/composer")).toBeNull();
  });

  it("does not fly for the header's link to the same URL", () => {
    const flight = createTileFlight();
    flight.navigationStarting("/composer");
    expect(flight.decide("/", "/composer")).toBeNull();
  });

  it("reads a chip's destination without its hash", () => {
    const flight = createTileFlight();
    flight.arm("/guide#start");
    expect(flight.decide("/", "/guide")).toBe("open");
  });

  it("lets go when the press's navigation is cancelled", () => {
    const flight = createTileFlight();
    flight.arm("/composer");
    flight.disarm();

    expect(flight.decide("/", "/composer")).toBeNull();
  });

  it("lets go when another navigation replaces the press", () => {
    const flight = createTileFlight();
    flight.arm("/composer");
    flight.navigationStarting("/faq");
    expect(flight.decide("/", "/composer")).toBeNull();
  });

  it("lets go by itself when no navigation ever starts", () => {
    vi.useFakeTimers();
    const flight = createTileFlight();
    flight.arm("/composer");
    vi.advanceTimersByTime(ARM_EXPIRY_MS);
    expect(flight.decide("/", "/composer")).toBeNull();
    vi.useRealTimers();
  });

  it("clears the press once the navigation lands", () => {
    const flight = createTileFlight();
    flyTo(flight);
    expect(flight.decide("/", "/composer")).toBeNull();
  });
});

describe("the trip back", () => {
  it("pushes back to home after a tile flight", () => {
    const flight = createTileFlight();
    flyTo(flight);
    expect(flight.decide("/composer", "/")).toBe("close");
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
    flight.arm("/faq");
    expect(flight.arrivingContentName("/faq")).toBeUndefined();

    flight.begin("open");
    expect(flight.arrivingContentName("/faq")).toBe("page-arriving");
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
  const home = { x: 0, y: 64, width: 1000, height: 736 };
  const page = { x: 0, y: 64, width: 1000, height: 3000 };

  it("scales a tall page about the middle of what is on screen", () => {
    const vars = flightGeometry({ leaving: home, arriving: page, viewport });
    expect(vars["--tile-flight-arriving-x"]).toBe("500px");
    expect(vars["--tile-flight-arriving-y"]).toBe("368px");
  });

  it("gives each picture its own origin", () => {
    const vars = flightGeometry({
      leaving: { x: 40, y: 64, width: 960, height: 400 },
      arriving: page,
      viewport,
    });
    expect(vars["--tile-flight-leaving-x"]).toBe("480px");
    expect(vars["--tile-flight-leaving-y"]).toBe("200px");
    expect(vars["--tile-flight-arriving-y"]).toBe("368px");
  });

  it("finds what is on screen when the page was scrolled", () => {
    const vars = flightGeometry({
      leaving: { x: 0, y: -400, width: 1000, height: 3000 },
      arriving: home,
      viewport,
    });
    // The middle of the screen is 800px down a page that starts 400px above it.
    expect(vars["--tile-flight-leaving-x"]).toBe("500px");
    expect(vars["--tile-flight-leaving-y"]).toBe("800px");
  });

  it("returns the two origin pairs and nothing about the tile", () => {
    const vars = flightGeometry({ leaving: home, arriving: page, viewport });
    expect(Object.keys(vars).sort()).toEqual([
      "--tile-flight-arriving-x",
      "--tile-flight-arriving-y",
      "--tile-flight-leaving-x",
      "--tile-flight-leaving-y",
    ]);
  });
});

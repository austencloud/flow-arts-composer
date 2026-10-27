import { afterEach, describe, expect, it, vi } from "vitest";
import {
  noteArrivalOrigin,
  takeArrivalOrigin,
} from "#lib/features/create/shared/workspace-panel/sequence-display/services/arrival-origin.js";

// The shared setup replaces document.createElement with fakes, so the card is
// built in a fresh document.
const page = document.implementation.createHTMLDocument();

function tappedCard(box: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const card = page.createElement("button");
  card.style.setProperty("--border-primary", "#f00");
  const picture = page.createElement("div");
  picture.className = "picture";
  card.append(picture);
  card.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
    }) as DOMRect;
  return card;
}

describe("arrival origin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    takeArrivalOrigin();
  });

  it("hands the tapped card's box and a copy of its picture to the stage once", () => {
    const card = tappedCard({ left: 20, top: 700, width: 95, height: 95 });
    noteArrivalOrigin(card);

    const origin = takeArrivalOrigin();
    expect(origin?.rect).toEqual({ left: 20, top: 700, width: 95, height: 95 });
    expect(origin?.picture?.className).toBe("picture");
    expect(origin?.picture).not.toBe(card.firstElementChild);
    expect(origin?.picture?.style.getPropertyValue("--border-primary")).toBe(
      "#f00"
    );
    expect(takeArrivalOrigin()).toBeNull();
  });

  it("drops a note too old to belong to this pick", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    noteArrivalOrigin(tappedCard({ left: 0, top: 0, width: 95, height: 95 }));
    now.mockReturnValue(2600);
    expect(takeArrivalOrigin()).toBeNull();
  });

  it("notes nothing for a card with no size", () => {
    noteArrivalOrigin(tappedCard({ left: 0, top: 0, width: 0, height: 0 }));
    expect(takeArrivalOrigin()).toBeNull();
  });
});

/**
 * Filter ids are document-global. When every turn column declared the same
 * `turn-color-blue` / `turn-color-red` ids, each one painted with whichever
 * column came first in the DOM, so a default-colored animation overlay turned
 * every card cell's numbers back to red and blue under custom prop colors.
 * Each column must resolve its numbers to its own filter and its own colors.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import TurnsColumn from "./TurnsColumn.svelte";

const LETTER_DIMENSIONS = { width: 80, height: 100 };

function mountColumn(left: string, right: string) {
  return render(TurnsColumn, {
    turnsTuple: "(s, 1, 2)",
    letter: "A",
    letterDimensions: LETTER_DIMENSIONS,
    leftColorOverride: left,
    rightColorOverride: right,
  });
}

/** The flood colors the column's numbers resolve to through the document. */
function paintedColors(container: HTMLElement): string[] {
  const images = [...container.querySelectorAll("g.turn-number image")];
  return images.map((image) => {
    const ref = image.getAttribute("filter") ?? "";
    const id = /url\(#(.+)\)/.exec(ref)?.[1] ?? "";
    const filter = document.getElementById(id);
    expect(filter && container.contains(filter)).toBe(true);
    return filter!.querySelector("feFlood")!.getAttribute("flood-color")!;
  });
}

describe("TurnsColumn filter ids", () => {
  it("paints each column's numbers with that column's own colors", () => {
    const first = mountColumn("#3575E2", "#ED1C24");
    const second = mountColumn("#00ff88", "#ff00ff");

    expect(paintedColors(first.container)).toEqual(["#3575E2", "#ED1C24"]);
    expect(paintedColors(second.container)).toEqual(["#00ff88", "#ff00ff"]);
  });
});

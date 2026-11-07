import { describe, expect, it } from "vitest";
import { CANVAS_DOCK, explorerLayout, tileSide } from "./explorer-layout";

describe("explorerLayout", () => {
  it("gives a phone its tiles beside the canvas when that leaves the canvas larger", () => {
    const layout = explorerLayout(355, 437);
    expect(layout.mode).toBe("stack");
    expect(layout.tilesBeside).toBe(true);
    expect(layout.tileColumns).toBe(1);
  });

  it("gives a beside tile column whatever width the canvas leaves", () => {
    expect(explorerLayout(355, 437).tileColumn).toBe(72);
    const roomy = explorerLayout(530, 537);
    expect(roomy.tilesBeside).toBe(true);
    expect(roomy.tileColumn).toBeGreaterThan(72);
  });

  it("puts a row of four under the canvas on a tall phone", () => {
    const layout = explorerLayout(392, 700);
    expect(layout.mode).toBe("stack");
    expect(layout.tilesBeside).toBe(false);
    expect(layout.tileColumns).toBe(4);
  });

  it("sets tiles beside the canvas on the unfolded Fold, what-plays a tap away", () => {
    const layout = explorerLayout(680, 537);
    expect(layout.mode).toBe("split");
    expect(layout.tileColumns).toBe(2);
    expect(layout.studioSide).toBe(true);
  });

  it("never narrows the canvas column below what its controls need", () => {
    expect(explorerLayout(940, 358).canvasColumn).toBe(320);
  });

  it("uses three columns on a laptop whose room is too short for the quad", () => {
    const layout = explorerLayout(1382, 500);
    expect(layout.mode).toBe("trio");
    expect(layout.canvasColumn).toBe(500 - CANVAS_DOCK);
  });

  it("keeps the four boxes when the room holds them", () => {
    expect(explorerLayout(1480, 680).mode).toBe("quad");
    expect(explorerLayout(790, 790).mode).toBe("quad");
  });

  it("runs the quad's tiles in a row when the top half is wide and short", () => {
    expect(explorerLayout(1480, 620).tileColumns).toBe(4);
    expect(explorerLayout(790, 790).tileColumns).toBe(2);
  });

  it("chooses the tile arrangement with the larger tiles", () => {
    const [wide, tall] = [
      tileSide(600, 200, 4),
      tileSide(600, 200, 2),
    ];
    expect(wide).toBeGreaterThan(tall);
    const layout = explorerLayout(940, 358);
    expect(layout.tileColumns).toBe(4);
  });
});

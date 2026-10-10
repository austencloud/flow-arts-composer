import { describe, it, expect } from "vitest";
import { resolveWallRuns } from "#lib/features/museum/services/wall-run-resolver.js";

// isWall over a 6x5 room border (room bounds x:0..5, y:0..4), with a 1-tile
// door gap on the south border at x=2.
const room = { x: 0, y: 0, w: 6, h: 5 };
function isWall(x: number, y: number): boolean {
  const onBorder =
    x === room.x ||
    x === room.x + room.w - 1 ||
    y === room.y ||
    y === room.y + room.h - 1;
  if (!onBorder) return false;
  if (y === room.y + room.h - 1 && x === 2) return false; // south door gap
  return true;
}

describe("resolveWallRuns", () => {
  it("merges each solid border into one run", () => {
    const { runs } = resolveWallRuns(room, isWall);
    // north border (y=0) is solid x:0..5
    expect(runs).toContainEqual({ axis: "x", fixed: 0, start: 0, end: 5 });
  });

  it("splits a border at a door gap into two runs", () => {
    const { runs, doors } = resolveWallRuns(room, isWall);
    // south border (y=4) split around x=2 → x:0..1 and x:3..5
    expect(runs).toContainEqual({ axis: "x", fixed: 4, start: 0, end: 1 });
    expect(runs).toContainEqual({ axis: "x", fixed: 4, start: 3, end: 5 });
    expect(doors).toContainEqual({ axis: "x", fixed: 4, start: 2, end: 2 });
  });
});

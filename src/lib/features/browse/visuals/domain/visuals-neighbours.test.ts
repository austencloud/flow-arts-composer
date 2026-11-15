import { describe, expect, it } from "vitest";
import { pieceNeighbours } from "./visuals-neighbours.js";

const list = [{ artifactId: "a" }, { artifactId: "b" }, { artifactId: "c" }];

describe("pieceNeighbours", () => {
  it("finds both neighbours in the middle", () => {
    const n = pieceNeighbours(list, "b")!;
    expect(n.position).toBe(2);
    expect(n.total).toBe(3);
    expect(n.previous?.artifactId).toBe("a");
    expect(n.next?.artifactId).toBe("c");
  });

  it("has no previous at the start and no next at the end", () => {
    expect(pieceNeighbours(list, "a")!.previous).toBeNull();
    expect(pieceNeighbours(list, "a")!.next?.artifactId).toBe("b");
    expect(pieceNeighbours(list, "c")!.next).toBeNull();
    expect(pieceNeighbours(list, "c")!.previous?.artifactId).toBe("b");
  });

  it("is a lone piece with both arrows off", () => {
    const n = pieceNeighbours([{ artifactId: "x" }], "x")!;
    expect([n.position, n.total, n.previous, n.next]).toEqual([1, 1, null, null]);
  });

  it("is null for a piece that is not in the list", () => {
    expect(pieceNeighbours(list, "zzz")).toBeNull();
  });
});

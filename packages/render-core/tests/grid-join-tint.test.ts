import { describe, expect, it } from "vitest";
import {
  getGridJoinLayout,
  type JoinedGridPoint,
} from "../src/calculations/grid-join-layout.js";
import {
  joinedPointColors,
  joinedPointsHands,
  mixHexColors,
} from "../src/calculations/grid-join-tint.js";

const HANDS = { left: "#0000ff", right: "#ff0000" } as const;

function point(
  hands: ("left" | "right")[],
  x = 0,
  kind: JoinedGridPoint["kind"] = "hand"
): JoinedGridPoint {
  return {
    kind,
    x,
    y: 0,
    members: hands.map((hand) => ({ hand, location: "e" as const })),
  };
}

describe("mixHexColors", () => {
  it("moves the share asked for, channel by channel", () => {
    expect(mixHexColors("#ffffff", "#000000", 0)).toBe("#ffffff");
    expect(mixHexColors("#ffffff", "#000000", 1)).toBe("#000000");
    expect(mixHexColors("#000000", "#ff8000", 0.5)).toBe("#804000");
  });

  it("reads 3-digit hex and leaves unreadable colors alone", () => {
    expect(mixHexColors("#fff", "#000", 0.5)).toBe("#808080");
    expect(mixHexColors("white", "#000000", 0.5)).toBe("white");
    expect(mixHexColors("#ffffff", "rgb(0,0,0)", 0.5)).toBe("#ffffff");
  });
});

describe("joinedPointColors", () => {
  it("leans each grid's points toward its hand and shared ones toward both", () => {
    const points = [
      point(["left"], 0),
      point(["right"], 100),
      point(["left", "right"], 200),
    ];
    expect(joinedPointColors(points, "#ffffff", HANDS, 0.5)).toEqual([
      "#8080ff",
      "#ff8080",
      "#c080c0",
    ]);
  });

  it("treats points of different kinds at one spot as shared", () => {
    const points = [
      point(["left"], 50, "center"),
      point(["right"], 50, "hand"),
    ];
    expect(joinedPointsHands(points)).toEqual(["both", "both"]);
  });

  it("keeps the base color at zero tint", () => {
    expect(joinedPointColors([point(["right"])], "#000000", HANDS, 0)).toEqual([
      "#000000",
    ]);
  });
});

describe("joinedPointsHands on planned layouts", () => {
  it("one step east: each center sits on the other grid's hand point", () => {
    const { points } = getGridJoinLayout({ toward: "e", steps: 1 }, "diamond");
    const hands = joinedPointsHands(points);
    const centers = points.flatMap((p, i) =>
      p.kind === "center" ? [hands[i]] : []
    );
    expect(centers).toEqual(["both", "both"]);
    // Points away from the seam stay with one grid.
    expect(hands.filter((h) => h === "left").length).toBeGreaterThan(0);
    expect(hands.filter((h) => h === "right").length).toBeGreaterThan(0);
  });

  it("two steps east: the merged hand point is shared", () => {
    const { points } = getGridJoinLayout({ toward: "e", steps: 2 }, "diamond");
    const hands = joinedPointsHands(points);
    const merged = points.findIndex((p) => p.members.length > 1);
    expect(merged).toBeGreaterThanOrEqual(0);
    expect(hands[merged]).toBe("both");
    expect(hands.filter((h) => h === "both")).toHaveLength(1);
  });
});

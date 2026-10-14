import { describe, expect, it } from "vitest";
import {
  filterByName,
  pickShelf,
  SHELF_CAP,
} from "#lib/features/library/components/collection-picker/collection-picker-shelf.js";

function col(id: string, daysAgo: number, systemType?: string) {
  return {
    id,
    name: id,
    updatedAt: new Date(Date.UTC(2026, 9, 14) - daysAgo * 86_400_000),
    systemType,
  };
}

describe("pickShelf", () => {
  it("shows a short library whole", () => {
    const all = [col("a", 1), col("b", 2), col("c", 3)];
    expect(pickShelf(all, () => false).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps ticked and system collections, fills with the most recent, in library order", () => {
    const all = [
      col("fav", 400, "favorites"),
      col("old-ticked", 300),
      col("d1", 1),
      col("d9", 9),
      col("d2", 2),
      col("d8", 8),
      col("d3", 3),
      col("d7", 7),
      col("d4", 4),
      col("d6", 6),
    ];
    const shelf = pickShelf(all, (c) => c.id === "old-ticked");
    expect(shelf.map((c) => c.id)).toEqual([
      "fav",
      "old-ticked",
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
    expect(shelf).toHaveLength(SHELF_CAP);
  });

  it("lets ticked collections push the shelf past the cap", () => {
    const all = Array.from({ length: 12 }, (_, i) => col(`c${i}`, i));
    const ticked = new Set(["c3", "c5", "c7", "c9", "c10", "c11", "c4"]);
    const shelf = pickShelf(all, (c) => ticked.has(c.id));
    expect(shelf.map((c) => c.id)).toEqual([
      "c3",
      "c4",
      "c5",
      "c7",
      "c9",
      "c10",
      "c11",
    ]);
  });

  it("does not hide a single straggler", () => {
    const all = Array.from({ length: SHELF_CAP + 1 }, (_, i) =>
      col(`c${i}`, i)
    );
    expect(pickShelf(all, () => false)).toHaveLength(SHELF_CAP + 1);
  });

  it("treats a broken updatedAt as oldest instead of throwing", () => {
    const all = [
      ...Array.from({ length: 7 }, (_, i) => col(`c${i}`, i)),
      { id: "bad", name: "bad", updatedAt: new Date(NaN) },
    ];
    const shelf = pickShelf(all, () => false);
    expect(shelf.map((c) => c.id)).not.toContain("bad");
    expect(shelf).toHaveLength(SHELF_CAP);
  });
});

describe("filterByName", () => {
  const all = [
    { name: "Poi Combos" },
    { name: "Teaching" },
    { name: "Zan's Diamond" },
  ];

  it("matches case-insensitively on any part of the name", () => {
    expect(filterByName(all, "  COMB ").map((c) => c.name)).toEqual([
      "Poi Combos",
    ]);
  });

  it("returns everything for a blank query", () => {
    expect(filterByName(all, "   ")).toHaveLength(3);
  });
});

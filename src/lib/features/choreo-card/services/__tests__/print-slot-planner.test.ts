// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { planPrintSlots } from "../print-slot-planner";
import type { CardPair } from "../types";
import { TND_ELEMENTS, type TnDElement } from "../../domain/tnd-element";

// Sentinel pairs — the planner never touches canvas internals, so fakes suffice.
function pair(label: string): CardPair {
  return { front: { label } as unknown as HTMLCanvasElement, back: {} as HTMLCanvasElement, label };
}
const EL = (element: string) => TND_ELEMENTS.find((e) => e.element === element)! as TnDElement;

describe("planPrintSlots", () => {
  it("groups by fixed TND_ELEMENTS order and pads each color to whole sheets", () => {
    const pairs = [pair("fire1"), pair("water1")];
    const elements = [EL("fire"), EL("water")];
    const slots = planPrintSlots(pairs, elements, 1, 9);

    expect(slots.length).toBe(18);
    expect(slots[0]!.item?.label).toBe("water1");
    expect(slots[0]!.elementName).toBe("water");
    expect(slots[1]!.item).toBeNull();
    expect(slots[1]!.elementName).toBe("water");
    expect(slots[9]!.item?.label).toBe("fire1");
    expect(slots[9]!.elementName).toBe("fire");
  });

  it("cut-collates: each card repeated N times consecutively", () => {
    const pairs = [pair("a"), pair("b")];
    const elements = [EL("fire"), EL("fire")];
    const slots = planPrintSlots(pairs, elements, 3, 9);

    const labels = slots.slice(0, 6).map((s) => s.item?.label);
    expect(labels).toEqual(["a", "a", "a", "b", "b", "b"]);
    expect(slots.slice(0, 6).map((s) => s.copyIndex)).toEqual([
      0, 1, 2, 0, 1, 2,
    ]);
    expect(slots.length).toBe(9);
    expect(slots[6]!.item).toBeNull();
    expect(slots[6]!.copyIndex).toBeNull();
  });

  it("puts untagged cards in a trailing bucket with null elementName", () => {
    const pairs = [pair("u1"), pair("fire1")];
    const elements = [undefined, EL("fire")];
    const slots = planPrintSlots(pairs, elements, 1, 9);

    expect(slots[0]!.item?.label).toBe("fire1");
    expect(slots[9]!.item?.label).toBe("u1");
    expect(slots[9]!.elementName).toBeNull();
  });

  it("cut-collation: when copies == cardsPerPage, each page has one card repeated", () => {
    const pairs = [pair("A"), pair("B"), pair("C")];
    const elements = [EL("water"), EL("water"), EL("water")];
    const slots = planPrintSlots(pairs, elements, 9, 9);

    // 3 cards × 9 copies = 27 slots = 3 pages of 9
    expect(slots.length).toBe(27);
    // Page 1: all A
    expect(slots.slice(0, 9).every((s) => s.item?.label === "A")).toBe(true);
    // Page 2: all B
    expect(slots.slice(9, 18).every((s) => s.item?.label === "B")).toBe(true);
    // Page 3: all C
    expect(slots.slice(18, 27).every((s) => s.item?.label === "C")).toBe(true);
  });

  it("copies < 1 is clamped to 1", () => {
    const slots = planPrintSlots([pair("a")], [EL("fire")], 0, 9);
    expect(slots.filter((s) => s.item).length).toBe(1);
  });

  it("passes through with no element data (single padded bucket)", () => {
    const pairs = [pair("a"), pair("b")];
    const slots = planPrintSlots(pairs, [], 1, 9);
    expect(slots.length).toBe(9);
    expect(slots.slice(0, 2).map((s) => s.item?.label)).toEqual(["a", "b"]);
    expect(slots[0]!.elementName).toBeNull();
  });

  describe("groupByElement=false (normal fill)", () => {
    it("ignores element grouping and pads only the final sheet", () => {
      const pairs = [pair("fire1"), pair("water1"), pair("water2")];
      const elements = [EL("fire"), EL("water"), EL("water")];
      const slots = planPrintSlots(pairs, elements, 1, 9, false);

      // 3 cards → one sheet, no inter-color blanks, source order preserved.
      expect(slots.length).toBe(9);
      expect(slots.slice(0, 3).map((s) => s.item?.label)).toEqual(["fire1", "water1", "water2"]);
      expect(slots[3]!.item).toBeNull();
      expect(slots.every((s) => s.elementName === null)).toBe(true);
    });

    it("cut-collates: each card repeated N times consecutively", () => {
      const pairs = [pair("a"), pair("b")];
      const slots = planPrintSlots(pairs, [EL("fire"), EL("water")], 2, 9, false);

      expect(slots.slice(0, 4).map((s) => s.item?.label)).toEqual(["a", "a", "b", "b"]);
      expect(slots.length).toBe(9);
      expect(slots[4]!.item).toBeNull();
    });

    it("fills whole sheets with no blanks when the count divides evenly", () => {
      const pairs = Array.from({ length: 9 }, (_, i) => pair(`c${i}`));
      const slots = planPrintSlots(pairs, [], 1, 9, false);
      expect(slots.length).toBe(9);
      expect(slots.every((s) => s.item)).toBe(true);
    });
  });

  describe("firstOnTop (reverse so deck's FIRST card lands on top of the stack)", () => {
    // Helper: the flat sequence of real (non-blank) card labels in draw order.
    const realOrder = (slots: ReturnType<typeof planPrintSlots>) =>
      slots.filter((s) => s.item).map((s) => (s.item as { label: string }).label);

    // THE invariant: the physical stack reads the authored order top-to-bottom
    // iff the firstOnTop draw order is the EXACT reverse of the forward draw
    // order — across ALL families, not just within each. This is the property
    // that was broken (only within-section reversal put the last section on top).
    it("reverses the WHOLE real-card order vs forward — grouped, across families", () => {
      const pairs = [pair("f1"), pair("f2"), pair("w1"), pair("w2")];
      const elements = [EL("fire"), EL("fire"), EL("water"), EL("water")];

      const fwd = realOrder(planPrintSlots(pairs, elements, 1, 9, true, false));
      const rev = realOrder(planPrintSlots(pairs, elements, 1, 9, true, true));

      // Whatever the forward family+letter order is, firstOnTop is its full
      // reverse → the first forward card is the LAST real card drawn (on top).
      expect(rev).toEqual([...fwd].reverse());
      expect(rev[rev.length - 1]).toBe(fwd[0]);
    });

    it("reverses the WHOLE real-card order vs forward — ungrouped", () => {
      const pairs = [pair("a"), pair("b"), pair("c")];
      const fwd = realOrder(planPrintSlots(pairs, [], 1, 9, false, false));
      const rev = realOrder(planPrintSlots(pairs, [], 1, 9, false, true));
      expect(rev).toEqual([...fwd].reverse()); // ["c","b","a"]
    });

    it("reverses the WHOLE real-card order vs forward — with copies", () => {
      const pairs = [pair("a"), pair("b"), pair("c")];
      const elements = [EL("fire"), EL("water"), EL("water")];
      const fwd = realOrder(planPrintSlots(pairs, elements, 3, 9, true, false));
      const rev = realOrder(planPrintSlots(pairs, elements, 3, 9, true, true));
      expect(rev).toEqual([...fwd].reverse());
    });

    it("still cut-collates: each card's N copies stay consecutive", () => {
      const pairs = [pair("a"), pair("b")];
      const slots = planPrintSlots(pairs, [], 3, 9, false, true);
      // b's copies then a's (a is drawn last → on top).
      expect(slots.slice(0, 6).map((s) => s.item?.label)).toEqual(["b", "b", "b", "a", "a", "a"]);
    });

    it("keeps card↔element pairing correct when reversed", () => {
      const pairs = [pair("f1"), pair("w1")];
      const elements = [EL("fire"), EL("water")];
      const slots = planPrintSlots(pairs, elements, 1, 9, true, true);
      expect(slots.find((s) => s.item?.label === "f1")?.elementName).toBe("fire");
      expect(slots.find((s) => s.item?.label === "w1")?.elementName).toBe("water");
    });
  });
});

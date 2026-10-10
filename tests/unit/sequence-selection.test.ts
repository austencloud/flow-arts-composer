import { describe, it, expect } from "vitest";
import { SequenceSelection } from "#lib/shared/selection/sequence-selection.svelte.js";

describe("SequenceSelection", () => {
  it("starts with nothing hovered or selected", () => {
    const s = new SequenceSelection();
    expect(s.hoveredId).toBeNull();
    expect(s.selectedId).toBeNull();
    expect(s.isHovered("a")).toBe(false);
    expect(s.isSelected("a")).toBe(false);
  });

  it("hover(id) sets the hovered group; hover(null) clears it", () => {
    const s = new SequenceSelection();
    s.hover("a");
    expect(s.isHovered("a")).toBe(true);
    expect(s.isHovered("b")).toBe(false);
    s.hover(null);
    expect(s.hoveredId).toBeNull();
  });

  it("select(id) is single-select: selecting b replaces a", () => {
    const s = new SequenceSelection();
    s.select("a");
    expect(s.isSelected("a")).toBe(true);
    s.select("b");
    expect(s.isSelected("a")).toBe(false);
    expect(s.isSelected("b")).toBe(true);
  });

  it("toggle(id) selects when unselected and clears when re-toggled", () => {
    const s = new SequenceSelection();
    s.toggle("a");
    expect(s.isSelected("a")).toBe(true);
    s.toggle("a");
    expect(s.selectedId).toBeNull();
  });

  it("clear() deselects but leaves hover untouched", () => {
    const s = new SequenceSelection();
    s.select("a");
    s.hover("a");
    s.clear();
    expect(s.selectedId).toBeNull();
    expect(s.isHovered("a")).toBe(true);
  });
});

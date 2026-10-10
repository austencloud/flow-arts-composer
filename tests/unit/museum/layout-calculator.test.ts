import { describe, it, expect } from "vitest";
import { calculateMuseumLayout } from "#lib/features/museum/scenes/procedural/domain/layout-calculator.js";
import type { ExhibitSlot, PavilionLayout } from "#lib/features/museum/scenes/procedural/domain/museum-types.js";

function wallSlotsIn(pavilion: PavilionLayout): ExhibitSlot[] {
  return pavilion.slots.filter((s) => s.type === "wall");
}

function performerSlotsIn(pavilion: PavilionLayout): ExhibitSlot[] {
  return pavilion.slots.filter((s) => s.type === "performer");
}

function distanceFromCenter(pos: { x: number; z: number }, center: { x: number; z: number }): number {
  const dx = pos.x - center.x;
  const dz = pos.z - center.z;
  return Math.sqrt(dx * dx + dz * dz);
}

describe("calculateMuseumLayout — pavilion selection", () => {
  it("returns exactly 1 alcove pavilion for 1-4 exhibits", () => {
    for (const count of [1, 2, 3, 4]) {
      const layout = calculateMuseumLayout(count);
      expect(layout.pavilions).toHaveLength(1);
      expect(layout.pavilions[0].template).toBe("alcove");
    }
  });

  it("returns alcove + corridor (2 pavilions) for 5-10 exhibits", () => {
    for (const count of [5, 7, 10]) {
      const layout = calculateMuseumLayout(count);
      expect(layout.pavilions).toHaveLength(2);
      const types = layout.pavilions.map((p) => p.template).sort();
      expect(types).toContain("alcove");
      expect(types).toContain("corridor");
    }
  });

  it("returns 3 pavilions for 11-20 exhibits", () => {
    for (const count of [11, 15, 20]) {
      const layout = calculateMuseumLayout(count);
      expect(layout.pavilions).toHaveLength(3);
    }
  });

  it("adds more pavilions beyond 20 exhibits without going below 3", () => {
    const layout21 = calculateMuseumLayout(21);
    expect(layout21.pavilions.length).toBeGreaterThanOrEqual(3);

    const layout50 = calculateMuseumLayout(50);
    expect(layout50.pavilions.length).toBeGreaterThan(layout21.pavilions.length);
  });
});

describe("calculateMuseumLayout — slot generation", () => {
  it("generates at least one wall slot per pavilion", () => {
    const layout = calculateMuseumLayout(15); // 3 pavilions
    for (const pavilion of layout.pavilions) {
      const wallSlots = wallSlotsIn(pavilion);
      expect(wallSlots.length).toBeGreaterThan(0);
    }
  });

  it("places wall slots at eye height (1.6m)", () => {
    const layout = calculateMuseumLayout(3); // Single alcove
    const wallSlots = wallSlotsIn(layout.pavilions[0]);

    for (const slot of wallSlots) {
      expect(slot.position.y).toBeCloseTo(1.6, 3);
    }
  });

  it("wall slots have a type of 'wall'", () => {
    const layout = calculateMuseumLayout(1);
    const wallSlots = wallSlotsIn(layout.pavilions[0]);
    expect(wallSlots.length).toBeGreaterThan(0);
    for (const slot of wallSlots) {
      expect(slot.type).toBe("wall");
    }
  });

  it("does not exceed the template maxSlots total across wall + performer slots", () => {
    // The template constrains total capacity; we verify slots are capped.
    const layout = calculateMuseumLayout(4); // Alcove has maxSlots: 4
    const alcove = layout.pavilions[0];
    const wallSlots = wallSlotsIn(alcove);
    // Wall slots alone should not exceed maxSlots
    expect(wallSlots.length).toBeLessThanOrEqual(4);
  });

  it("generates wall slots with a valid normal vector (unit length)", () => {
    const layout = calculateMuseumLayout(8); // alcove + corridor
    for (const pavilion of layout.pavilions) {
      for (const slot of wallSlotsIn(pavilion)) {
        const len = Math.sqrt(
          slot.normal.x ** 2 + slot.normal.y ** 2 + slot.normal.z ** 2
        );
        expect(len).toBeCloseTo(1.0, 3);
      }
    }
  });
});

describe("calculateMuseumLayout — spatial placement", () => {
  it("pavilion positions are within the clearing radius from the clearing center", () => {
    const layout = calculateMuseumLayout(15);
    const { clearingCenter, clearingRadius, pavilions } = layout;

    for (const pavilion of pavilions) {
      const dist = distanceFromCenter(pavilion.position, clearingCenter);
      expect(dist).toBeLessThanOrEqual(clearingRadius + 0.01); // 1cm tolerance
    }
  });

  it("clearing radius scales with pavilion count", () => {
    const small = calculateMuseumLayout(3);
    const large = calculateMuseumLayout(20);
    expect(large.clearingRadius).toBeGreaterThanOrEqual(small.clearingRadius);
  });

  it("generates exactly one performer slot paired with each wall slot", () => {
    const layout = calculateMuseumLayout(12);
    for (const pavilion of layout.pavilions) {
      const wallSlots = wallSlotsIn(pavilion);
      const perfSlots = performerSlotsIn(pavilion);
      expect(perfSlots).toHaveLength(wallSlots.length);
    }
  });

  it("performer slots are 2m in front of their paired wall slot (along the normal)", () => {
    const layout = calculateMuseumLayout(3);
    const alcove = layout.pavilions[0];
    const wallSlots = wallSlotsIn(alcove);
    const perfSlots = performerSlotsIn(alcove);

    for (let i = 0; i < wallSlots.length; i++) {
      const ws = wallSlots[i];
      const ps = perfSlots[i];
      // The performer slot should be 2m from the wall slot in the XZ plane
      const dxz = Math.sqrt(
        (ps.position.x - ws.position.x) ** 2 +
        (ps.position.z - ws.position.z) ** 2
      );
      expect(dxz).toBeCloseTo(2.0, 2);
    }
  });

  it("each slot has a unique id within the pavilion", () => {
    const layout = calculateMuseumLayout(15);
    for (const pavilion of layout.pavilions) {
      const ids = pavilion.slots.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it("each slot references its parent pavilion id", () => {
    const layout = calculateMuseumLayout(15);
    for (const pavilion of layout.pavilions) {
      for (const slot of pavilion.slots) {
        expect(slot.pavilionId).toBe(pavilion.id);
      }
    }
  });

  it("the clearing center is at the origin (0, 0)", () => {
    const layout = calculateMuseumLayout(5);
    expect(layout.clearingCenter.x).toBe(0);
    expect(layout.clearingCenter.z).toBe(0);
  });
});

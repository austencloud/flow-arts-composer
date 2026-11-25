import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { parkCars } from "../../../src/routes/test/site-walk/look/site-walk-car-list";
import {
  SURROUND_SIZES,
  type CarShape,
} from "../../../src/routes/test/site-walk/site-walk-around";
import { carParts } from "../../../src/routes/test/site-walk/site-walk-furniture";

const car = (over: Partial<CarShape> = {}): CarShape => ({
  at: { x: 3, z: -2 },
  turn: 0.7,
  body: "sedan",
  colour: "#2a3550",
  ...over,
});

function middle(list: BufferGeometry[]) {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const g of list) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      x += p.getX(i);
      z += p.getZ(i);
      n += 1;
    }
  }
  return { x: x / n, z: z / n };
}

describe("parking the real cars", () => {
  it("points each the way the plan's own car points", () => {
    for (const turn of [0, 0.7, 2, -1.3, Math.PI]) {
      const shape = car({ turn });
      const head = middle(carParts(shape).head);
      const placement = parkCars([shape], false)[0]!.placements[0]!;
      const nose = {
        x: Math.cos(placement.rotation),
        z: -Math.sin(placement.rotation),
      };
      const ahead = { x: head.x - shape.at.x, z: head.z - shape.at.z };
      const length = Math.hypot(ahead.x, ahead.z);
      expect((ahead.x * nose.x + ahead.z * nose.z) / length).toBeCloseTo(1, 3);
    }
  });

  it("keeps the plan's colour on each car", () => {
    const cars = [
      car({ colour: "#102030" }),
      car({ colour: "#aabbcc" }),
      car({ colour: "#102030", body: "suv" }),
    ];
    const seen: string[] = [];
    for (const fleet of parkCars(cars, false))
      for (const p of fleet.placements)
        seen.push(fleet.model.paint!.variants[p.paintIndex]!);
    expect(seen.sort()).toEqual(["#102030", "#102030", "#aabbcc"]);
  });

  it("never parks a car longer than the space the plan gives it", () => {
    for (const fleet of parkCars(
      [car(), car(), car({ body: "suv" }), car({ body: "suv" })],
      false
    )) {
      const longest = Math.max(
        SURROUND_SIZES.car.sedan.length,
        SURROUND_SIZES.car.suv.length
      );
      expect(fleet.model.lengthMeters).toBeLessThanOrEqual(longest + 1e-9);
    }
  });

  it("loads fewer bodies on a phone, and none for no cars", () => {
    const cars = Array.from({ length: 8 }, (_, i) =>
      car({ body: i % 2 ? "suv" : "sedan" })
    );
    expect(parkCars(cars, true).length).toBeLessThan(
      parkCars(cars, false).length
    );
    expect(parkCars([], false)).toEqual([]);
  });

  it("parks every car it is given", () => {
    const cars = Array.from({ length: 9 }, (_, i) =>
      car({ body: i % 3 ? "sedan" : "suv", at: { x: i, z: 0 } })
    );
    const placed = parkCars(cars, false).flatMap((f) => f.placements);
    expect(placed.map((p) => p.x).sort()).toEqual(cars.map((c) => c.at.x));
  });
});

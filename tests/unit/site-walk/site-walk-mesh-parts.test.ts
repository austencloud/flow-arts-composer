import { describe, expect, it } from "vitest";
import { Vector3, type BufferGeometry } from "three";
import {
  flat,
  strip,
} from "../../../src/routes/test/site-walk/site-walk-mesh-parts";

/** Every triangle's own facing, from its winding. A double-sided material lights the far side of a triangle that faces away. */
function facings(g: BufferGeometry): number[] {
  const p = g.getAttribute("position");
  const index = g.getIndex()!;
  const out: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(p, index.getX(i + k))
    ) as [Vector3, Vector3, Vector3];
    out.push(b.sub(a).cross(c.sub(a)).normalize().y);
  }
  return out;
}

const square = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
];
const ell = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 2 },
  { x: 2, z: 2 },
  { x: 2, z: 5 },
  { x: 0, z: 5 },
];

describe("flat ground", () => {
  it("faces the sky whichever way round its points run", () => {
    for (const shape of [
      square,
      [...square].reverse(),
      ell,
      [...ell].reverse(),
    ]) {
      const g = flat(shape, 0);
      expect(g).not.toBeNull();
      for (const y of facings(g!)) expect(y).toBeCloseTo(1);
    }
  });

  it("strips face the sky in both directions", () => {
    for (const [a, b] of [
      [
        { x: 0, z: 0 },
        { x: 5, z: 2 },
      ],
      [
        { x: 5, z: 2 },
        { x: 0, z: 0 },
      ],
    ] as const) {
      for (const y of facings(strip(a, b, 0.4, 0.1)!)) expect(y).toBeCloseTo(1);
    }
  });
});

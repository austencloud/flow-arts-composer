/**
 * A body's shape in a couple of thousand triangles, for its shadow.
 *
 * A guest is forty thousand triangles; eighty of them again in the sun's view
 * would double the frame. Their shadows only need the outline, so every vertex
 * is snapped to a small grid, cells become single points and the triangles that
 * collapse are dropped. Thin parts survive because a cell keeps the average of
 * its own points, not the cell's middle.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";

export interface Shape {
  position: Float32Array;
  index: Uint32Array;
}

export function coarseShape(
  parts: readonly Shape[],
  cell = 0.03
): BufferGeometry {
  const ids = new Map<string, number>();
  const sums: number[] = [];
  const triangles: number[] = [];
  const seen = new Set<string>();
  for (const { position, index } of parts) {
    const to = new Uint32Array(position.length / 3);
    for (let i = 0; i < to.length; i++) {
      const x = position[i * 3]!;
      const y = position[i * 3 + 1]!;
      const z = position[i * 3 + 2]!;
      const key = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
        sums.push(0, 0, 0, 0);
      }
      sums[id * 4]! += x;
      sums[id * 4 + 1]! += y;
      sums[id * 4 + 2]! += z;
      sums[id * 4 + 3]! += 1;
      to[i] = id;
    }
    for (let t = 0; t + 2 < index.length; t += 3) {
      const a = to[index[t]!]!;
      const b = to[index[t + 1]!]!;
      const c = to[index[t + 2]!]!;
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((p, q) => p - q).join();
      if (seen.has(key)) continue;
      seen.add(key);
      triangles.push(a, b, c);
    }
  }
  const out = new Float32Array(ids.size * 3);
  for (let i = 0; i < ids.size; i++) {
    for (let k = 0; k < 3; k++)
      out[i * 3 + k] = sums[i * 4 + k]! / sums[i * 4 + 3]!;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  g.setIndex(triangles);
  return g;
}

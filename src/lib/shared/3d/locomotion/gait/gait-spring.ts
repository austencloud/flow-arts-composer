/** Critically damped springs: quick to answer, never past the mark, the same at any frame rate. */
import type { Vector3 } from "three";

export interface Spring {
  x: number;
  v: number;
}

/** Step toward `target`; `half` is the half-life in seconds. */
export function spring(s: Spring, target: number, half: number, dt: number): number {
  const y = (4 * Math.LN2) / half / 2;
  const j0 = s.x - target;
  const j1 = s.v + j0 * y;
  const e = Math.exp(-y * dt);
  s.x = e * (j0 + j1 * dt) + target;
  s.v = e * (s.v - j1 * y * dt);
  return s.x;
}

/** Step a vector and its speed toward nothing. */
export function fadeVector(x: Vector3, v: Vector3, half: number, dt: number): void {
  const y = (4 * Math.LN2) / half / 2;
  const e = Math.exp(-y * dt);
  for (const k of ["x", "y", "z"] as const) {
    const j1 = v[k] + x[k] * y;
    x[k] = e * (x[k] + j1 * dt);
    v[k] = e * (v[k] - j1 * y * dt);
  }
}

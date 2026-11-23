/**
 * Per-particle transforms that sit inside the caller's transform.
 *
 * An effect renderer draws inside the transform it is handed: the Shape
 * Engine's Ratios stage runs its canvas at the screen's pixel ratio, with tips
 * in CSS pixels. A particle's own placement (rotation, stretch, position) is
 * therefore composed onto that base, never set in its place. Plain arithmetic
 * on the six numbers, so hundreds of particles a frame allocate nothing.
 */

/** The six numbers of a 2D affine transform, as `ctx.setTransform` takes them. */
export interface BaseTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Set `base x particle` as the context transform. The particle matrix is in
 * the same order `ctx.setTransform` takes (a, b, c, d, e, f).
 */
export function setParticleTransform(
  ctx: CanvasRenderingContext2D,
  base: BaseTransform,
  pa: number,
  pb: number,
  pc: number,
  pd: number,
  pe: number,
  pf: number
): void {
  ctx.setTransform(
    base.a * pa + base.c * pb,
    base.b * pa + base.d * pb,
    base.a * pc + base.c * pd,
    base.b * pc + base.d * pd,
    base.a * pe + base.c * pf + base.e,
    base.b * pe + base.d * pf + base.f
  );
}

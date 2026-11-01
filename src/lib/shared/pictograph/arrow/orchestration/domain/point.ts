/**
 * An x/y pair for arrow positions and adjustments.
 *
 * The arrow pipeline used fabric's `Point` for this, and only ever read `x` and
 * `y`. Importing fabric put its whole bundle (about 274 KB) on every page that
 * places an arrow, including a scanned sequence, so the pipeline keeps its own.
 */
export class Point {
  constructor(
    public x = 0,
    public y = 0
  ) {}
}

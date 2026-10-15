type ArtworkCenter = { x: number; y: number };

export function artworkSwapRatio(
  previous: ArtworkCenter | null,
  next: ArtworkCenter | undefined
): number {
  if (!previous || !next || previous.x <= 0 || next.x <= 0) return 1;
  const ratio = previous.x / next.x;
  return Number.isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 0.01
    ? ratio
    : 1;
}

// Keeps a replacement at its predecessor's size until that size has painted.
export class PropSwapRelease {
  private frame: number | null = null;
  private generation = 0;

  constructor(
    private request: typeof requestAnimationFrame = (callback) =>
      requestAnimationFrame(callback),
    private cancel: typeof cancelAnimationFrame = (id) =>
      cancelAnimationFrame(id)
  ) {}

  start(
    ratio: number,
    reduced: boolean,
    update: (scale: number, snapping: boolean) => void
  ): void {
    this.destroy();
    if (reduced || ratio === 1) {
      update(1, false);
      return;
    }
    const generation = this.generation;
    update(ratio, true);
    this.frame = this.request(() => {
      if (generation !== this.generation) return;
      this.frame = this.request(() => {
        if (generation !== this.generation) return;
        this.frame = null;
        update(1, false);
      });
    });
  }

  destroy(): void {
    this.generation++;
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
  }
}

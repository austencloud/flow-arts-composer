// Each Generate panel owns its timer so leaving one cannot reset another's placements.
export class PlacementResetTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(reset: () => void, delayMs: number): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      reset();
    }, delayMs);
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

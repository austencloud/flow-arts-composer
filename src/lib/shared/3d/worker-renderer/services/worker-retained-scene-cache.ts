export interface WorkerRetainedScene {
  environment: string;
  reducedMotion: boolean;
  estimatedBytes: number;
  dispose(): void;
}

/**
 * A return visit only keeps one scene alive, and only when its decoded assets
 * fit a small budget. This avoids turning a convenient back-navigation into a
 * second full scene's worth of GPU memory for a long editing session.
 */
export class WorkerRetainedSceneCache<T extends WorkerRetainedScene> {
  private entry: T | null = null;

  constructor(private readonly maxEstimatedBytes: number) {}

  get count(): number {
    return this.entry ? 1 : 0;
  }

  get retainedBytes(): number {
    return this.entry?.estimatedBytes ?? 0;
  }

  retain(candidate: T): boolean {
    this.clear();
    if (candidate.estimatedBytes > this.maxEstimatedBytes) {
      candidate.dispose();
      return false;
    }
    this.entry = candidate;
    return true;
  }

  take(environment: string, reducedMotion: boolean): T | null {
    const candidate = this.entry;
    if (!candidate) return null;
    this.entry = null;
    if (
      candidate.environment === environment &&
      candidate.reducedMotion === reducedMotion
    ) {
      return candidate;
    }
    candidate.dispose();
    return null;
  }

  clear(): void {
    this.entry?.dispose();
    this.entry = null;
  }
}

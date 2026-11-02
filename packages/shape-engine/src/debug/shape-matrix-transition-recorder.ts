const FRAME_BUDGET_MS = 1000 / 60;
// A 60 Hz presentation interval is 16.67 ms. The half-millisecond tolerance
// keeps timer quantization (16.7/16.8) honest without pretending a 20 ms frame
// made its deadline.
export const MISSED_VSYNC_THRESHOLD_MS = FRAME_BUDGET_MS + 0.5;
const OUTLIER_CUTOFF_MS = 1000;
const MAX_RECORDS = 24;

type TransitionStatus = "running" | "settled" | "superseded" | "cleared";

export interface TransitionRecord {
  id: number;
  key: string;
  status: TransitionStatus;
  requestedAt: number;
  buildStartedAt?: number | null;
  buildReadyAt?: number | null;
  canvasReadyAt: number | null;
  motionReadyAt: number | null;
  fadeStartedAt: number | null;
  settledAt: number | null;
  frameGaps: number[];
}

export interface ShapeMatrixTransitionSummary {
  id: number;
  key: string;
  status: TransitionStatus;
  requestToCanvasMs: number | null;
  requestToBuildMs: number | null;
  requestToBuildReadyMs: number | null;
  buildMs: number | null;
  requestToMotionMs: number | null;
  requestToFadeMs: number | null;
  fadeMs: number | null;
  totalMs: number | null;
  frames: number;
  effectiveFps: number | null;
  p95FrameMs: number | null;
  worstFrameMs: number | null;
  missedFrames: number;
  missedFramePct: number;
}

interface ShapeMatrixTransitionDiagnostics {
  summary: () => ShapeMatrixTransitionSummary[];
  log: () => ShapeMatrixTransitionSummary[];
  reset: () => void;
  request: (key: string) => number;
  frameBudgetMs: number;
  missedVsyncThresholdMs: number;
}

declare global {
  var __tkaShapeMatrixTransitions: ShapeMatrixTransitionDiagnostics | undefined;
}

function elapsed(start: number, end: number | null): number | null {
  return end === null ? null : end - start;
}

export function summarizeShapeMatrixTransition(
  record: TransitionRecord
): ShapeMatrixTransitionSummary {
  const frameGaps = record.frameGaps.filter(
    (gap) => gap > 0 && gap <= OUTLIER_CUTOFF_MS
  );
  const sorted = [...frameGaps].sort((a, b) => a - b);
  const totalFrameMs = sorted.reduce((sum, gap) => sum + gap, 0);
  const missedFrames = sorted.filter(
    (gap) => gap > MISSED_VSYNC_THRESHOLD_MS
  ).length;

  return {
    id: record.id,
    key: record.key,
    status: record.status,
    requestToBuildMs: elapsed(
      record.requestedAt,
      record.buildStartedAt ?? null
    ),
    requestToBuildReadyMs: elapsed(
      record.requestedAt,
      record.buildReadyAt ?? null
    ),
    buildMs:
      record.buildStartedAt == null
        ? null
        : elapsed(record.buildStartedAt, record.buildReadyAt ?? null),
    requestToCanvasMs: elapsed(record.requestedAt, record.canvasReadyAt),
    requestToMotionMs: elapsed(record.requestedAt, record.motionReadyAt),
    requestToFadeMs: elapsed(record.requestedAt, record.fadeStartedAt),
    fadeMs:
      record.fadeStartedAt === null
        ? null
        : elapsed(record.fadeStartedAt, record.settledAt),
    totalMs: elapsed(record.requestedAt, record.settledAt),
    frames: sorted.length,
    effectiveFps:
      totalFrameMs > 0 ? (sorted.length / totalFrameMs) * 1000 : null,
    p95FrameMs:
      sorted.length > 0
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
        : null,
    worstFrameMs: sorted.at(-1) ?? null,
    missedFrames,
    missedFramePct:
      sorted.length > 0 ? (missedFrames / sorted.length) * 100 : 0,
  };
}

function diagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.MODE === "test") return false;
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("tka-shape-matrix-transition-stats") === "1";
  } catch {
    return false;
  }
}

/**
 * Samples the browser's presentation clock from the moment a realization is
 * requested until its crossfade really finishes. The animation engine already
 * measures its own update callback; this recorder covers the missing interval:
 * async canvas startup, Svelte flushes, style/paint, and the composited fade.
 */
export class ShapeMatrixTransitionRecorder {
  readonly enabled: boolean;

  #nextId = 1;
  #records: TransitionRecord[] = [];
  #open = new Map<number, TransitionRecord>();
  #animationFrame: number | null = null;
  #lastFrameAt: number | null = null;

  constructor(enabled = diagnosticsEnabled()) {
    this.enabled = enabled;
    if (!this.enabled) return;
    globalThis.__tkaShapeMatrixTransitions = {
      summary: () => this.summary(),
      log: () => this.logSummary(),
      reset: () => this.reset(),
      request: (key: string) => this.requested(key),
      frameBudgetMs: FRAME_BUDGET_MS,
      missedVsyncThresholdMs: MISSED_VSYNC_THRESHOLD_MS,
    };
  }

  requested(key: string): number {
    if (!this.enabled) return 0;
    // A newer interaction owns the destination. Older builds and handoffs may
    // finish their cleanup, but they must not remain reported as running.
    for (const id of [...this.#open.keys()]) this.#finish(id, "superseded");
    const record: TransitionRecord = {
      id: this.#nextId++,
      key,
      status: "running",
      requestedAt: performance.now(),
      buildStartedAt: null,
      buildReadyAt: null,
      canvasReadyAt: null,
      motionReadyAt: null,
      fadeStartedAt: null,
      settledAt: null,
      frameGaps: [],
    };
    this.#records.push(record);
    this.#open.set(record.id, record);
    this.#mark(record, "requested");
    this.#startSampling();
    return record.id;
  }

  /** Attach the build/render pipeline to the newest user interaction. */
  claimLatest(key: string): number {
    if (!this.enabled) return 0;
    const latest = [...this.#open.values()].at(-1);
    if (!latest) return this.requested(key);
    latest.key = key;
    return latest.id;
  }

  buildStarted(id: number): void {
    this.#stamp(id, "buildStartedAt", "build-start");
  }

  buildReady(id: number): void {
    this.#stamp(id, "buildReadyAt", "build-ready");
  }

  canvasReady(id: number): void {
    this.#stamp(id, "canvasReadyAt", "canvas-ready");
  }

  motionReady(id: number): void {
    this.#stamp(id, "motionReadyAt", "motion-ready");
  }

  fadeStarted(id: number): void {
    this.#stamp(id, "fadeStartedAt", "fade-start");
  }

  settled(id: number): void {
    this.#finish(id, "settled");
  }

  superseded(id: number): void {
    this.#finish(id, "superseded");
  }

  clearOpen(): void {
    for (const id of [...this.#open.keys()]) this.#finish(id, "cleared");
  }

  summary(): ShapeMatrixTransitionSummary[] {
    return this.#records.map(summarizeShapeMatrixTransition);
  }

  /** Explicit manual output; polling `summary()` never adds console work. */
  logSummary(): ShapeMatrixTransitionSummary[] {
    const summaries = this.summary();
    console.table(summaries.slice(-MAX_RECORDS));
    return summaries;
  }

  reset(): void {
    this.clearOpen();
    this.#records = [];
    this.#lastFrameAt = null;
  }

  destroy(): void {
    this.clearOpen();
    if (
      this.#animationFrame !== null &&
      typeof cancelAnimationFrame !== "undefined"
    )
      cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
    this.#lastFrameAt = null;
  }

  #stamp(
    id: number,
    field:
      | "buildStartedAt"
      | "buildReadyAt"
      | "canvasReadyAt"
      | "motionReadyAt"
      | "fadeStartedAt",
    mark: string
  ): void {
    const record = this.#open.get(id);
    if (!record || record[field] !== null) return;
    record[field] = performance.now();
    this.#mark(record, mark);
  }

  #finish(id: number, status: Exclude<TransitionStatus, "running">): void {
    const record = this.#open.get(id);
    if (!record) return;
    record.status = status;
    record.settledAt = performance.now();
    this.#open.delete(id);
    this.#mark(record, status);
    if (status === "settled") {
      try {
        performance.measure(
          `tka:shape-matrix:transition:${record.id}:total`,
          `tka:shape-matrix:transition:${record.id}:requested`,
          `tka:shape-matrix:transition:${record.id}:settled`
        );
      } catch {
        // DevTools marks are diagnostics; a browser implementation may omit them.
      }
    }
    if (this.#records.length > MAX_RECORDS) {
      this.#records.splice(0, this.#records.length - MAX_RECORDS);
    }
  }

  #mark(record: TransitionRecord, phase: string): void {
    try {
      performance.mark(`tka:shape-matrix:transition:${record.id}:${phase}`, {
        detail: { key: record.key },
      });
    } catch {
      // Timing marks must never affect the interaction they are measuring.
    }
  }

  #startSampling(): void {
    if (this.#animationFrame !== null) return;
    // Unit and server environments can exercise the timing ledger without a
    // presentation clock. Browser diagnostics still sample every frame.
    if (typeof requestAnimationFrame === "undefined") return;
    this.#animationFrame = requestAnimationFrame(this.#sampleFrame);
  }

  #sampleFrame = (now: number): void => {
    if (this.#lastFrameAt !== null) {
      const gap = now - this.#lastFrameAt;
      for (const record of this.#open.values()) record.frameGaps.push(gap);
    }
    this.#lastFrameAt = now;

    if (this.#open.size === 0) {
      this.#animationFrame = null;
      this.#lastFrameAt = null;
      return;
    }
    this.#animationFrame = requestAnimationFrame(this.#sampleFrame);
  };
}

let sharedRecorder: ShapeMatrixTransitionRecorder | null = null;

export function getShapeMatrixTransitionRecorder(): ShapeMatrixTransitionRecorder {
  sharedRecorder ??= new ShapeMatrixTransitionRecorder();
  return sharedRecorder;
}

/** Begins at the control interaction, before reactive state or realization work. */
export function requestShapeMatrixTransition(key: string): number {
  return getShapeMatrixTransitionRecorder().requested(key);
}

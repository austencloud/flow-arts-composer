export interface WorkerRendererResponsivenessResult {
  requestId: number;
  requestedAt: number;
  mainThreadMaxGapMs: number;
  mainThreadMaxGapPhase: string | null;
  mainThreadGapsOver50Ms: number;
  outgoingWorkerMaxFrameGapMs: number;
  outgoingWorkerMaxFrameGapPhase: string | null;
  outgoingFrameSamples: number;
  lastOutgoingFrameAt: number | null;
}

export interface WorkerRendererResponsivenessState extends WorkerRendererResponsivenessResult {
  previousTimerAt: number;
  currentPhase: string | null;
}

export function createWorkerRendererResponsivenessState(
  requestId: number,
  requestedAt: number
): WorkerRendererResponsivenessState {
  return {
    requestId,
    requestedAt,
    previousTimerAt: requestedAt,
    mainThreadMaxGapMs: 0,
    mainThreadMaxGapPhase: null,
    mainThreadGapsOver50Ms: 0,
    outgoingWorkerMaxFrameGapMs: 0,
    outgoingWorkerMaxFrameGapPhase: null,
    outgoingFrameSamples: 0,
    lastOutgoingFrameAt: null,
    currentPhase: "worker",
  };
}

export function recordMainThreadTimer(
  state: WorkerRendererResponsivenessState,
  now: number
): void {
  const gap = now - state.previousTimerAt;
  state.previousTimerAt = now;
  if (gap > state.mainThreadMaxGapMs) {
    state.mainThreadMaxGapMs = gap;
    state.mainThreadMaxGapPhase = state.currentPhase;
  }
  if (gap > 50) state.mainThreadGapsOver50Ms += 1;
}

export function recordOutgoingWorkerFrame(
  state: WorkerRendererResponsivenessState,
  deltaMs: number,
  receivedAt = performance.now()
): void {
  const gap =
    state.lastOutgoingFrameAt === null
      ? receivedAt - state.requestedAt
      : receivedAt - state.lastOutgoingFrameAt;
  state.lastOutgoingFrameAt = receivedAt;
  state.outgoingFrameSamples += 1;
  const measuredGap = Math.max(deltaMs, gap);
  if (measuredGap > state.outgoingWorkerMaxFrameGapMs) {
    state.outgoingWorkerMaxFrameGapMs = measuredGap;
    state.outgoingWorkerMaxFrameGapPhase = state.currentPhase;
  }
}

export class WorkerRendererResponsivenessProbe {
  private active: WorkerRendererResponsivenessState | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  begin(requestId: number): void {
    this.end();
    const requestedAt = performance.now();
    const active = createWorkerRendererResponsivenessState(
      requestId,
      requestedAt
    );
    this.active = active;
    this.interval = setInterval(() => {
      if (this.active === active) {
        recordMainThreadTimer(active, performance.now());
      }
    }, 16);
  }

  setPhase(phase: string | null): void {
    if (this.active) this.active.currentPhase = phase;
  }

  recordOutgoingFrame(deltaMs: number): void {
    if (this.active) recordOutgoingWorkerFrame(this.active, deltaMs);
  }

  end(): WorkerRendererResponsivenessResult | null {
    const active = this.active;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.active = null;
    if (!active) return null;
    return {
      requestId: active.requestId,
      requestedAt: active.requestedAt,
      mainThreadMaxGapMs: active.mainThreadMaxGapMs,
      mainThreadMaxGapPhase: active.mainThreadMaxGapPhase,
      mainThreadGapsOver50Ms: active.mainThreadGapsOver50Ms,
      outgoingWorkerMaxFrameGapMs: active.outgoingWorkerMaxFrameGapMs,
      outgoingWorkerMaxFrameGapPhase: active.outgoingWorkerMaxFrameGapPhase,
      outgoingFrameSamples: active.outgoingFrameSamples,
      lastOutgoingFrameAt: active.lastOutgoingFrameAt,
    };
  }
}

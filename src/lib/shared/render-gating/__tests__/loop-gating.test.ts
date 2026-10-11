import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnimationLoop } from "#lib/shared/animation-engine/services/animation-loop.js";
import { AnimationRenderLoop } from "#lib/shared/animation-engine/services/animation-render-loop.js";
import type {
  RenderLoopConfig,
  RenderFrameParams,
} from "#lib/shared/animation-engine/services/IAnimationRenderLoop.js";
import type { RenderActivityGate } from "../render-activity-gate";

// A directly controllable gate. The gate's own signal plumbing is covered in
// render-activity-gate.test.ts; these tests only care that the loops react to
// the transition correctly.
function makeControllableGate(initial = false): RenderActivityGate & {
  set(active: boolean): void;
  setSilently(active: boolean): void;
} {
  let active = initial;
  const listeners = new Set<(next: boolean) => void>();
  return {
    get active(): boolean {
      return active;
    },
    set(next: boolean): void {
      if (next === active) return;
      active = next;
      for (const listener of listeners) listener(next);
    },
    // Flip without notifying — reproduces the frame in which the gate has
    // already closed but the subscription has not run yet.
    setSilently(next: boolean): void {
      active = next;
    },
    attach: () => {},
    detach: () => {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hold: () => {},
    release: () => {},
    snapshot: () => ({
      active,
      intersecting: active,
      documentVisible: true,
      holds: [],
      attached: true,
    }),
    dispose: () => {
      listeners.clear();
    },
  };
}

// A rAF stub that hands back frame callbacks so a test can advance the clock by
// hand and read the deltas the loop produced.
function installRafStub(): {
  pending: Array<{ id: number; fn: FrameRequestCallback }>;
  cancelled: number[];
  step(timestamp: number): void;
} {
  const pending: Array<{ id: number; fn: FrameRequestCallback }> = [];
  const cancelled: number[] = [];
  let nextId = 1;

  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    const id = nextId++;
    pending.push({ id, fn });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelled.push(id);
    const index = pending.findIndex((entry) => entry.id === id);
    if (index >= 0) pending.splice(index, 1);
  });

  return {
    pending,
    cancelled,
    step(timestamp: number): void {
      const frame = pending.shift();
      if (!frame) throw new Error("no frame scheduled");
      frame.fn(timestamp);
    },
  };
}

describe("AnimationLoop — activity gating", () => {
  let raf: ReturnType<typeof installRafStub>;

  beforeEach(() => {
    raf = installRafStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("start() schedules nothing while the gate is closed", () => {
    const loop = new AnimationLoop();
    loop.setActivityGate(makeControllableGate(false));

    loop.start(() => {}, 1);

    expect(raf.pending).toHaveLength(0);
    expect(loop.isPumping()).toBe(false);
  });

  it("still reports isRunning() while parked, so a gated pause is not read as stopped", () => {
    const loop = new AnimationLoop();
    loop.setActivityGate(makeControllableGate(false));
    loop.start(() => {}, 1);

    expect(loop.isRunning()).toBe(true);
    expect(loop.isPumping()).toBe(false);
  });

  it("resumes by itself when the gate opens — the caller never re-starts it", () => {
    const loop = new AnimationLoop();
    const gate = makeControllableGate(false);
    loop.setActivityGate(gate);
    loop.start(() => {}, 1);
    expect(raf.pending).toHaveLength(0);

    gate.set(true);

    expect(raf.pending).toHaveLength(1);
    expect(loop.isPumping()).toBe(true);
  });

  it("cancels the pending frame when the gate closes mid-run", () => {
    const loop = new AnimationLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(() => {}, 1);
    expect(raf.pending).toHaveLength(1);

    gate.set(false);

    expect(raf.pending).toHaveLength(0);
    expect(raf.cancelled).toHaveLength(1);
    expect(loop.isPumping()).toBe(false);
  });

  it("re-seeds the clock on resume, so a long pause never becomes a huge delta", () => {
    const deltas: number[] = [];
    const loop = new AnimationLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start((dt) => deltas.push(dt), 1);

    // Two normal frames, 16ms apart.
    raf.step(1000);
    raf.step(1016);
    expect(deltas).toEqual([16]);

    // Scrolled away for thirty seconds.
    gate.set(false);
    gate.set(true);

    // The first frame back re-seeds instead of advancing.
    raf.step(31016);
    expect(deltas).toEqual([16]);

    // And the frame after it advances by its own real gap, not the paused span.
    raf.step(31032);
    expect(deltas).toEqual([16, 16]);
  });

  it("un-gating with null resumes a loop the caller still wants running", () => {
    const loop = new AnimationLoop();
    const gate = makeControllableGate(false);
    loop.setActivityGate(gate);
    loop.start(() => {}, 1);
    expect(raf.pending).toHaveLength(0);

    loop.setActivityGate(null);

    expect(raf.pending).toHaveLength(1);
  });

  it("bails out of a frame whose gate closed between schedule and dispatch", () => {
    const deltas: number[] = [];
    const loop = new AnimationLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start((dt) => deltas.push(dt), 1);
    raf.step(1000);
    raf.step(1016);
    expect(deltas).toEqual([16]);

    gate.setSilently(false);
    raf.step(1032);

    expect(deltas).toEqual([16]);
    expect(raf.pending).toHaveLength(0);
    expect(loop.isPumping()).toBe(false);
  });

  it("does not resume a loop that was explicitly stopped", () => {
    const loop = new AnimationLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(() => {}, 1);
    loop.stop();

    gate.set(false);
    gate.set(true);

    expect(raf.pending).toHaveLength(0);
    expect(loop.isRunning()).toBe(false);
  });
});

describe("AnimationRenderLoop — activity gating", () => {
  let raf: ReturnType<typeof installRafStub>;

  beforeEach(() => {
    raf = installRafStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeLoop(): AnimationRenderLoop {
    const loop = new AnimationRenderLoop();
    // Only `renderer` gates rAF scheduling in start()/triggerRender().
    loop.initialize({ renderer: {} } as unknown as RenderLoopConfig);
    return loop;
  }

  const params = () => ({}) as RenderFrameParams;

  it("start() schedules nothing while the gate is closed", () => {
    const loop = makeLoop();
    loop.setActivityGate(makeControllableGate(false));

    loop.start(params);

    expect(raf.pending).toHaveLength(0);
    expect(loop.isRunning()).toBe(false);
  });

  it("triggerRender() while closed is remembered and drawn on resume", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(false);
    loop.setActivityGate(gate);

    loop.triggerRender(params);
    expect(raf.pending).toHaveLength(0);

    gate.set(true);
    expect(raf.pending).toHaveLength(1);
    expect(loop.isRunning()).toBe(true);
  });

  it("cancels the pending frame when the gate closes mid-run", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(params);
    expect(loop.isRunning()).toBe(true);

    gate.set(false);

    expect(loop.isRunning()).toBe(false);
    expect(raf.cancelled).toHaveLength(1);
  });

  it("resumes into a clean warm-up rather than a cold restart", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(params);

    gate.set(false);
    expect(loop.getDiagnostics().isRunning).toBe(false);

    gate.set(true);
    const diagnostics = loop.getDiagnostics();
    expect(diagnostics.isRunning).toBe(true);
    expect(diagnostics.consecutiveIdleFrames).toBe(0);
    expect(diagnostics.framesRenderedSinceStart).toBe(0);
    expect(diagnostics.loopStartTime).toBe(0);
  });

  it("does not double-schedule when the gate reports active twice", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(false);
    loop.setActivityGate(gate);
    loop.start(params);

    gate.set(true);
    gate.set(false);
    gate.set(true);

    expect(raf.pending).toHaveLength(1);
  });

  it("bails out of a frame whose gate closed between schedule and dispatch", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(params);
    expect(raf.pending).toHaveLength(1);

    gate.setSilently(false);
    raf.step(1000);

    // No self-reschedule: the loop must not resurrect itself past a closed gate.
    expect(raf.pending).toHaveLength(0);
    expect(loop.isRunning()).toBe(false);
  });

  it("an externally driven loop ignores the gate entirely", () => {
    const loop = makeLoop();
    loop.setExternallyDriven(true);
    const gate = makeControllableGate(false);

    loop.setActivityGate(gate);
    loop.start(params);
    loop.triggerRender(params);

    // No rAF either way — but crucially, closing/opening the gate never touches
    // the deterministic driver's state.
    expect(raf.pending).toHaveLength(0);
    expect(raf.cancelled).toHaveLength(0);
  });

  it("setActivityGate(null) releases the subscription", () => {
    const loop = makeLoop();
    const gate = makeControllableGate(true);
    loop.setActivityGate(gate);
    loop.start(params);

    loop.setActivityGate(null);
    gate.set(false);

    // Detached: the gate closing no longer parks the loop.
    expect(loop.isRunning()).toBe(true);
  });
});

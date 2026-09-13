/**
 * Metronome lifecycle contract.
 *
 * The metronome runs a lookahead scheduler: a 25ms polling timer queues Web
 * Audio clicks up to 100ms into the future, plus a wall-clock `setTimeout` for
 * each beat callback. Everything that makes that scheme correct is invisible
 * from the outside — a second scheduler loop, a click already queued on the
 * audio thread, or a beat callback still pending after stop all produce wrong
 * output that nothing in the UI reports. Hence a fake AudioContext with a
 * hand-driven clock: the audio clock and the timer clock advance together, so
 * every scheduling decision is deterministic.
 *
 * These are timing-graph invariants, not perceptual claims: a fake context
 * cannot show that a click was heard, only when the metronome asked for it.
 */

import { Metronome } from "$lib/shared/audio/metronome";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ScheduledClick {
  startTime: number;
  /** Last `stop(time)` the metronome asked for; the spec keeps the latest. */
  stopTime: number | null;
  /** Oscillator frequency at the moment it was started (accent = 1200Hz). */
  frequency: number;
  /** Gain at the moment it was started (accent = 0.3, regular = 0.2). */
  gain: number;
  disconnected: boolean;
}

class FakeAudioParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class FakeGainNode {
  gain = new FakeAudioParam();
  constructor(readonly record: ScheduledClick) {}
  connect(): void {}
  disconnect(): void {
    this.record.disconnected = true;
  }
}

class FakeOscillator {
  frequency = new FakeAudioParam();
  gainNode: FakeGainNode | null = null;
  constructor(readonly record: ScheduledClick) {}
  connect(node: FakeGainNode): void {
    this.gainNode = node;
  }
  disconnect(): void {}
  start(time: number): void {
    this.record.startTime = time;
    this.record.frequency = this.frequency.value;
    this.record.gain = this.gainNode?.gain.value ?? Number.NaN;
  }
  stop(time: number): void {
    this.record.stopTime = time;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** Browsers hand back a suspended context outside a user gesture. */
  static initialState: "running" | "suspended" = "running";

  state: "running" | "suspended" | "closed";
  currentTime = 0;
  destination = {};
  clicks: ScheduledClick[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  constructor() {
    this.state = FakeAudioContext.initialState;
    FakeAudioContext.instances.push(this);
  }

  /** createOscillator/createGain are called as a pair, in that order. */
  createOscillator(): FakeOscillator {
    const record: ScheduledClick = {
      startTime: Number.NaN,
      stopTime: null,
      frequency: Number.NaN,
      gain: Number.NaN,
      disconnected: false,
    };
    this.clicks.push(record);
    return new FakeOscillator(record);
  }

  createGain(): FakeGainNode {
    return new FakeGainNode(this.clicks[this.clicks.length - 1]);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

/** The context the metronome constructed for this test. */
function ctx(): FakeAudioContext {
  const instance = FakeAudioContext.instances.at(-1);
  if (!instance) throw new Error("Metronome never constructed an AudioContext");
  return instance;
}

/** Audio-clock seconds carry accumulated float error; compare at 1µs. */
function seconds(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Advance the audio clock and the timer clock in lockstep, one 25ms scheduler
 * poll at a time. The audio clock moves first so each poll sees the time that
 * has actually elapsed.
 */
function advance(milliseconds: number): void {
  const polls = milliseconds / 25;
  if (!Number.isInteger(polls)) {
    throw new Error(`advance() takes whole 25ms polls, got ${milliseconds}`);
  }
  for (let poll = 0; poll < polls; poll += 1) {
    ctx().currentTime = seconds(ctx().currentTime + 0.025);
    vi.advanceTimersByTime(25);
  }
}

/** Click start times, in audio-clock seconds, in the order they were queued. */
function clickTimes(): number[] {
  return ctx().clicks.map((click) => seconds(click.startTime));
}

function installFakeAudio(): Metronome {
  vi.useFakeTimers();
  FakeAudioContext.instances = [];
  FakeAudioContext.initialState = "running";
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
  return new Metronome();
}

describe("Metronome scheduling lifecycle", () => {
  let metronome: Metronome;
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    metronome = installFakeAudio();
  });

  afterEach(() => {
    metronome.dispose();
    vi.useRealTimers();
    (window as unknown as { AudioContext: unknown }).AudioContext =
      originalAudioContext;
  });

  it("schedules one click per beat on a single lookahead loop", () => {
    expect(metronome.start(120)).toBe(true);
    advance(1000);

    // 120bpm = 0.5s/beat. One second of transport, plus the 100ms lookahead,
    // covers beats at 0, 0.5 and 1.0.
    expect(clickTimes()).toEqual([0, 0.5, 1]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("replaces the running scheduler instead of stacking a second one", () => {
    metronome.start(60);
    advance(200);
    const clicksBeforeRestart = clickTimes().length;

    // A tempo change restarts the metronome. The old loop must not survive:
    // two loops share `nextClickTime`, so they interleave onto one corrupted
    // grid and only the newer one's timer is reachable from stop().
    metronome.start(120);
    advance(1000);

    expect(vi.getTimerCount()).toBe(1);
    expect(clickTimes().slice(clicksBeforeRestart)).toEqual([0.2, 0.7, 1.2]);
  });

  it("stops scheduling for good after stop(), across a restart", () => {
    metronome.start(60);
    advance(200);
    metronome.start(120);
    advance(200);

    metronome.stop();
    const clicksAtStop = clickTimes().length;
    advance(2000);

    expect(clickTimes().length).toBe(clicksAtStop);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels clicks already queued in the lookahead window on stop()", () => {
    metronome.start(120);
    // 0.45s in, the scheduler has queued the 0.5s beat: it falls inside the
    // 100ms lookahead. That click sits on the audio thread and outlives a stop
    // that only clears the polling timer.
    advance(450);
    expect(clickTimes()).toEqual([0, 0.5]);

    metronome.stop();

    const queuedAhead = ctx().clicks.filter(
      (click) => click.startTime > ctx().currentTime
    );
    expect(queuedAhead).toHaveLength(1);
    // Per the Web Audio spec an oscillator whose stop time precedes its start
    // time never sounds, so stopping at "now" silences the pending click.
    for (const click of queuedAhead) {
      expect(click.stopTime).not.toBeNull();
      expect(click.stopTime!).toBeLessThanOrEqual(ctx().currentTime);
      expect(click.stopTime!).toBeLessThan(click.startTime);
    }
  });

  it("does not fire beat callbacks queued before stop()", () => {
    const onStep = vi.fn();
    metronome.start(120, onStep);
    advance(450);

    const beatsAtStop = onStep.mock.calls.length;
    expect(beatsAtStop).toBeGreaterThan(0);
    metronome.stop();
    advance(1000);

    expect(onStep).toHaveBeenCalledTimes(beatsAtStop);
  });

  it("unlocks a suspended context when started", () => {
    FakeAudioContext.initialState = "suspended";

    expect(metronome.start(120)).toBe(true);

    expect(ctx().resumeCalls).toBeGreaterThan(0);
    expect(ctx().state).toBe("running");
  });

  it("releases finished click nodes while running", () => {
    metronome.start(180);
    advance(2000);

    // Nodes whose 50ms envelope has finished are disconnected as the scheduler
    // passes them; a run must not accumulate one live node per beat.
    const finished = ctx().clicks.filter(
      (click) => click.startTime + 0.05 < ctx().currentTime
    );
    expect(finished.length).toBeGreaterThan(3);
    expect(finished.every((click) => click.disconnected)).toBe(true);
  });
});

describe("Metronome mute, accent and disposal contracts", () => {
  let metronome: Metronome;
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    metronome = installFakeAudio();
  });

  afterEach(() => {
    metronome.dispose();
    vi.useRealTimers();
    (window as unknown as { AudioContext: unknown }).AudioContext =
      originalAudioContext;
  });

  it("keeps beat callbacks running while muted", () => {
    const onStep = vi.fn();
    metronome.setEnabled(false);
    metronome.start(120, onStep);
    advance(1000);

    expect(metronome.enabled).toBe(false);
    expect(clickTimes()).toEqual([]);
    expect(onStep.mock.calls.map(([beat]) => beat)).toEqual([0, 1, 2]);
  });

  it("accents the first beat of every four at the documented levels", () => {
    metronome.start(120);
    advance(2000);

    expect(ctx().clicks.map((click) => click.frequency)).toEqual([
      1200, 800, 800, 800, 1200,
    ]);
    expect(ctx().clicks.map((click) => click.gain)).toEqual([
      0.3, 0.2, 0.2, 0.2, 0.3,
    ]);
  });

  it("recovers a context the browser suspended mid-session", () => {
    // The practice cockpit unlocks audio on the Start tap and then drives its
    // own beats through tick(). Nothing on that path unlocks again, so a
    // suspension — hidden tab, iOS interruption — freezes currentTime and
    // silences the rest of the session.
    metronome.resume();
    metronome.tick();
    const resumesBeforeSuspension = ctx().resumeCalls;
    const clicksBeforeSuspension = ctx().clicks.length;

    ctx().state = "suspended";
    metronome.tick(true);

    expect(ctx().resumeCalls).toBe(resumesBeforeSuspension + 1);
    expect(ctx().state).toBe("running");
    // Queued, not dropped: the opening count-in tick fires while the first
    // resume() is still settling and has to survive it.
    expect(ctx().clicks.length).toBe(clicksBeforeSuspension + 1);
  });

  it("releases finished nodes on the tick-driven path", () => {
    metronome.resume();
    metronome.tick();
    const first = ctx().clicks[0];

    // A practice ramp drives beats itself; no scheduler poll runs to prune, so
    // each tick has to release the click before it.
    ctx().currentTime = 1;
    metronome.tick();

    expect(first.disconnected).toBe(true);
    expect(ctx().clicks[1].disconnected).toBe(false);
  });

  it("closes the audio context on dispose and stops the scheduler", () => {
    metronome.start(120);
    advance(100);

    metronome.dispose();

    expect(ctx().closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

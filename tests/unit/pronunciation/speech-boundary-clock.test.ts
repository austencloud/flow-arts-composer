import { beforeEach, describe, expect, it, vi } from "vitest";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { SampleRing } from "#lib/features/lab/pronunciation-recorder/domain/sample-ring.js";
import { createCorpusSession } from "#lib/features/lab/pronunciation-recorder/state/corpus-session-state.svelte.js";
import type { SpeechBoundaryHandlers } from "#lib/features/lab/pronunciation-recorder/services/contracts/ISpeechBoundaryDetector.js";

/**
 * The detector and the ring have to be on one timeline.
 *
 * The ring counts samples from zero at `capture.start()`. The detector reports
 * when a word began and ended. If those are measured against different origins
 * — a wall clock against a sample clock — the numbers still look like seconds,
 * the code still type-checks, and every single read comes back null. The
 * session re-queues each word without saying why, and stops a few words in.
 *
 * The existing session tests miss it because their fake capture returns samples
 * for any span asked of it. These use a real ring.
 */

const SAMPLE_RATE = 48_000;

/** A capture whose ring behaves like the real one and whose clock starts at zero. */
function ringCapture() {
  const ring = new SampleRing(SAMPLE_RATE * 30);
  return {
    sampleRate: SAMPLE_RATE,
    audioContext: null,
    get clock() {
      return ring.writtenSamples;
    },
    levelDb: -20,
    async start() {},
    /** Advance the clock as if the microphone had been running that long. */
    advanceSeconds(seconds: number) {
      ring.write(new Float32Array(Math.round(seconds * SAMPLE_RATE)));
    },
    readSeconds(from: number, to: number) {
      const samples = ring.read(
        Math.max(0, Math.round(from * SAMPLE_RATE)),
        Math.round(to * SAMPLE_RATE)
      );
      return samples ? { samples, sampleRate: SAMPLE_RATE } : null;
    },
    async stop() {},
  };
}

function harness(detectorFailure?: Error) {
  const capture = ringCapture();
  let handlers: SpeechBoundaryHandlers | null = null;
  let clockSeconds: (() => number) | null = null;
  const written: string[] = [];

  const session = createCorpusSession({
    words: [[Letter.A, Letter.B]],
    capture,
    detector: {
      async start(given) {
        if (detectorFailure) throw detectorFailure;
        handlers = given.handlers;
        clockSeconds = given.clockSeconds;
      },
      async stop() {},
    },
    store: {
      supportsDirectSave: () => true,
      async connect() {
        return { name: "corpus", directSave: true };
      },
      async writeWord(id) {
        written.push(id);
      },
      async writeSession() {},
      async finish() {},
    },
    microphone: {
      async connect() {
        return { stream: {} as MediaStream, devices: [], settings: { label: "fake" } };
      },
    },
  });

  return {
    session,
    capture,
    written,
    get handlers() {
      return handlers!;
    },
    get clockSeconds() {
      return clockSeconds!;
    },
  };
}

describe("the detector's clock", () => {
  it("is the capture's clock, not the page's", async () => {
    const h = harness();
    await h.session.start();

    h.capture.advanceSeconds(3);

    // Whatever the page has been open for, the detector is told the microphone
    // has been running for three seconds.
    expect(h.clockSeconds()).toBeCloseTo(3, 3);
  });

  it("reports spans the ring can actually return", async () => {
    const h = harness();
    await h.session.start();

    // Two seconds of room tone, then a one-second word ending now.
    h.capture.advanceSeconds(3);
    const now = h.clockSeconds();
    h.handlers.onSpeechEnd({ startSeconds: now - 1, endSeconds: now - 0.5 });
    await h.session.settled();

    expect(h.written).toEqual(["001"]);
  });

  it("loses every word when the two clocks disagree", async () => {
    // The failure this file exists for, stated as a test: a detector timing
    // against page uptime hands over spans that are minutes past anything the
    // ring holds, and the session silently records nothing.
    const h = harness();
    await h.session.start();
    h.capture.advanceSeconds(3);

    const pageUptime = 240;
    h.handlers.onSpeechEnd({ startSeconds: pageUptime - 1, endSeconds: pageUptime });
    await h.session.settled();

    expect(h.written).toEqual([]);
  });

  it("says why it could not start", async () => {
    // A bare "failed" was the only account of a denied microphone, an expired
    // sign-in, and a detector that never opened.
    const h = harness(new Error("The speech detector could not start listening."));
    await h.session.start();

    expect(h.session.status).toBe("failed");
    expect(h.session.failure).toBe("The speech detector could not start listening.");
  });
});

describe("SileroBoundaryDetector", () => {
  let config: Record<string, any> = {};

  beforeEach(() => {
    vi.resetModules();
    config = {};
  });

  /** Stands in for the library, recording the options it was constructed with. */
  function mockVad(instance: Record<string, unknown> = {}) {
    vi.doMock("@ricky0123/vad-web", () => ({
      MicVAD: {
        new: async (given: Record<string, unknown>) => {
          config = given;
          return { errored: false, async start() {}, destroy() {}, ...instance };
        },
      },
    }));
    return import(
      "#lib/features/lab/pronunciation-recorder/services/implementations/SileroBoundaryDetector.js"
    );
  }

  const noHandlers = { onSpeechStart: () => {}, onSpeechEnd: () => {} };

  it("times its spans on the clock it was given", async () => {
    const { SileroBoundaryDetector } = await mockVad();

    let captureSeconds = 0;
    const spans: Array<{ startSeconds: number; endSeconds: number }> = [];
    const detector = new SileroBoundaryDetector();
    await detector.start({
      stream: {} as MediaStream,
      context: null,
      handlers: { onSpeechStart: () => {}, onSpeechEnd: (span) => spans.push(span) },
      clockSeconds: () => captureSeconds,
    });

    captureSeconds = 5;
    config.onSpeechStart();
    captureSeconds = 6.7;
    config.onSpeechEnd();

    // The end is charged back by the redemption window, because the callback
    // only fires once that much non-speech has held.
    expect(spans).toEqual([{ startSeconds: 5, endSeconds: 6 }]);
  });

  it("listens on the capture's own audio context", async () => {
    // Two contexts on one microphone is two graphs, and Chrome can hand back
    // the second one suspended: no frame is ever scored, no word ever ends, and
    // the meter driven by the first one keeps moving.
    const { SileroBoundaryDetector } = await mockVad();
    const context = { state: "running" } as unknown as AudioContext;

    await new SileroBoundaryDetector().start({
      stream: {} as MediaStream,
      context,
      handlers: noHandlers,
      clockSeconds: () => 0,
    });

    expect(config.audioContext).toBe(context);
    // Owning the start is what makes a failed one throwable.
    expect(config.startOnLoad).toBe(false);
  });

  it("fails loudly when the detector cannot listen", async () => {
    // The library records a failed start on the instance and returns normally.
    // Unread, that is a live meter over a session that ignores every word.
    const { SileroBoundaryDetector } = await mockVad({ errored: true });

    await expect(
      new SileroBoundaryDetector().start({
        stream: {} as MediaStream,
        context: null,
        handlers: noHandlers,
        clockSeconds: () => 0,
      })
    ).rejects.toThrow(/could not start listening/i);
  });
});

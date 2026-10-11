import { describe, expect, it } from "vitest";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { createCorpusSession } from "#lib/features/lab/pronunciation-recorder/state/corpus-session-state.svelte.js";
import type { SpeechBoundaryHandlers } from "#lib/features/lab/pronunciation-recorder/services/contracts/ISpeechBoundaryDetector.js";

const WORDS = [
  [Letter.A, Letter.B],
  [Letter.C, Letter.D],
  [Letter.E, Letter.F],
];

interface StoreFaults {
  /** Reject `writeWord` while this returns true, as a denied upload does. */
  failWrite?: () => boolean;
  failSession?: () => boolean;
}

function harness(words = WORDS, faults: StoreFaults = {}) {
  let handlers: SpeechBoundaryHandlers | null = null;
  const written: Array<{ id: string; letters: readonly string[]; bytes: number }> = [];
  const sessions: unknown[] = [];

  const capture = {
    sampleRate: 48_000,
    audioContext: null,
    clock: 0,
    levelDb: -20,
    async start() {},
    readSeconds(from: number, to: number) {
      return { samples: new Float32Array(Math.round((to - from) * 48_000)), sampleRate: 48_000 };
    },
    async stop() {},
  };

  const session = createCorpusSession({
    words,
    capture,
    detector: {
      async start(given) {
        handlers = given.handlers;
      },
      async stop() {},
    },
    store: {
      supportsDirectSave: () => true,
      async connect() {
        return { name: "corpus", directSave: true };
      },
      async writeWord(id, letters, wav) {
        if (faults.failWrite?.()) {
          throw new Error("Firebase Storage: User does not have permission. (storage/unauthorized)");
        }
        written.push({ id, letters, bytes: wav.size });
      },
      async writeSession(record) {
        if (faults.failSession?.()) throw new Error("session index rejected");
        sessions.push(record);
      },
      async finish() {},
    },
    microphone: { async connect() {
      return { stream: {} as MediaStream, devices: [], settings: { label: "fake" } };
    } },
  });

  /** One spoken word of `seconds`, ending `at` on the capture clock. */
  const speak = async (at: number, seconds: number) => {
    handlers!.onSpeechStart();
    handlers!.onSpeechEnd({ startSeconds: at - seconds, endSeconds: at });
    await session.settled();
  };

  /** Starts a read without finishing it, so the mid-read state can be read. */
  const beginSpeaking = () => handlers!.onSpeechStart();

  return { session, speak, beginSpeaking, written, sessions };
}

describe("createCorpusSession", () => {
  it("advances to the next word after each read and writes it before showing the next", async () => {
    const { session, speak, written } = harness();
    await session.start();

    expect(session.currentWord).toEqual([Letter.A, Letter.B]);
    expect(session.nextWord).toEqual([Letter.C, Letter.D]);

    await speak(2, 1.0);

    expect(written).toHaveLength(1);
    expect(written[0]!.id).toBe("001");
    expect(written[0]!.letters).toEqual([Letter.A, Letter.B]);
    expect(written[0]!.bytes).toBeGreaterThan(44);
    expect(session.currentWord).toEqual([Letter.C, Letter.D]);
  });

  it("cuts lead-in and tail around the reported speech", async () => {
    // Cutting exactly at the boundary clips the plosive the detector missed and
    // leaves the aligner nothing to anchor the first phone against.
    const { session, speak, written } = harness();
    await session.start();
    await speak(2, 1.0);

    const expectedSeconds = 1.0 + 0.25 * 2;
    expect(written[0]!.bytes).toBeCloseTo(44 + expectedSeconds * 48_000 * 3, -3);
  });

  it("re-queues a read that came in far too short, without asking", async () => {
    // A fourth word, because the rate tracker only starts judging after three
    // seed reads: with the three-word list the queue is already empty by then
    // and the short read lands on a finished session instead of the re-queue.
    const { session, speak, written } = harness([...WORDS, [Letter.G, Letter.H]]);
    await session.start();

    await speak(2, 1.0);
    await speak(4, 1.0);
    await speak(6, 1.0);
    const before = written.length;
    await speak(8, 0.1);

    expect(written).toHaveLength(before);
    expect(session.retired).toEqual([]);
    expect(session.status).toBe("running");
    // Re-queued rather than dropped: the word is still the one being asked for.
    expect(session.currentWord).toEqual([Letter.G, Letter.H]);
    expect(session.remaining).toBe(1);
  });

  it("finishes on its own when the queue empties", async () => {
    const { session, speak } = harness();
    await session.start();
    await speak(2, 1.0);
    await speak(4, 1.0);
    await speak(6, 1.0);

    expect(session.status).toBe("finished");
    expect(session.currentWord).toBeNull();
  });

  it("stops early when every read fails, rather than reading into a dead microphone", async () => {
    const many = Array.from({ length: 30 }, () => [Letter.A, Letter.B, Letter.C, Letter.D]);
    const { session, speak } = harness(many);
    await session.start();

    await speak(2, 1.2);
    await speak(4, 1.2);
    await speak(6, 1.2);
    for (let index = 0; index < 4; index++) await speak(8 + index * 2, 0.05);

    expect(session.status).toBe("aborted");
    expect(session.abortReason).not.toBeNull();
  });

  it("says so when the recording cannot be saved, instead of going quiet", async () => {
    // The shipped bug: uploads landed on a storage path no rule granted, so
    // `writeWord` threw. The word never advanced, nothing appeared on screen,
    // and he read into a session that had already stopped listening to him.
    const { session, speak } = harness(WORDS, { failWrite: () => true });
    await session.start();

    await speak(2, 1.0);

    expect(session.failure).toMatch(/could not save the recording/i);
    expect(session.failure).toMatch(/storage\/unauthorized/);
    expect(session.status).toBe("running");
  });

  it("keeps taking words after one that could not be saved", async () => {
    // The mechanism that made one rejected upload end the whole sitting: every
    // read is chained onto the last, and a rejected link skips every `.then`
    // after it without running, forever.
    let deny = true;
    const { session, speak, written } = harness([...WORDS, [Letter.G, Letter.H]], {
      failWrite: () => deny,
    });
    await session.start();

    await speak(2, 1.0);
    expect(written).toEqual([]);

    deny = false;
    await speak(4, 1.0);

    expect(written).toHaveLength(1);
    expect(session.failure).toBeNull();
  });

  it("stops with the real reason when nothing can be saved", async () => {
    const many = Array.from({ length: 30 }, () => [Letter.A, Letter.B, Letter.C, Letter.D]);
    const { session, speak } = harness(many, { failWrite: () => true });
    await session.start();

    for (let index = 0; index < 3; index++) await speak(2 + index * 2, 1.2);

    expect(session.status).toBe("aborted");
    expect(session.abortReason).toBe("early-failures");
    // Carried into the report, so it does not blame the one part that worked.
    expect(session.failure).toMatch(/storage\/unauthorized/);
  });

  it("keeps the words when only the session index fails to save", async () => {
    const { session, speak, written } = harness(WORDS, { failSession: () => true });
    await session.start();

    await speak(2, 1.0);

    expect(written).toHaveLength(1);
    expect(session.status).toBe("running");
    expect(session.currentWord).toEqual([Letter.C, Letter.D]);
    expect(session.failure).toMatch(/could not save the session index/i);
  });

  it("confirms the word it saved, by name, after the prompt has moved on", async () => {
    // The complaint this answers: the only sign a read had been taken was the
    // word changing, and it changed whether or not anything was kept.
    const { session, speak } = harness();
    await session.start();

    expect(session.readState).toBe("waiting");
    await speak(2, 1.0);

    expect(session.readState).toBe("saved");
    // The word it is confirming, not the one now on the prompt.
    expect(session.judgedWord).toEqual([Letter.A, Letter.B]);
    expect(session.currentWord).toEqual([Letter.C, Letter.D]);
  });

  it("says it is hearing him, and then that the word is over", async () => {
    const { session, beginSpeaking } = harness();
    await session.start();

    beginSpeaking();
    expect(session.readState).toBe("hearing");
    expect(session.judgedWord).toEqual([Letter.A, Letter.B]);
  });

  it("holds the confirmation until the next read starts", async () => {
    // No timer decides how long the verdict is up. It stays until he is busy
    // again, which is exactly as long as he can read it.
    const { session, speak, beginSpeaking } = harness();
    await session.start();
    await speak(2, 1.0);

    expect(session.readState).toBe("saved");

    beginSpeaking();
    expect(session.readState).toBe("hearing");
  });

  it("names the word it threw away instead of re-queueing in silence", async () => {
    const { session, speak } = harness([...WORDS, [Letter.G, Letter.H]]);
    await session.start();
    await speak(2, 1.0);
    await speak(4, 1.0);
    await speak(6, 1.0);
    await speak(8, 0.1);

    expect(session.readState).toBe("retry");
    // The word the verdict is about, which by now is not the one on the prompt.
    expect(session.judgedWord).toEqual([Letter.G, Letter.H]);
  });

  it("reports a refused save the same way as a bad read", async () => {
    const { session, speak } = harness(WORDS, { failWrite: () => true });
    await session.start();
    await speak(2, 1.0);

    expect(session.readState).toBe("retry");
  });

  it("throws away a burst too short to be speech, before the tracker is seeded", async () => {
    // The first three reads used to be accepted unconditionally, so a cough
    // during the opening of a sitting was written to the corpus as a word.
    const { session, speak, written } = harness();
    await session.start();

    await speak(2, 0.15);

    expect(written).toEqual([]);
    expect(session.readState).toBe("retry");
    expect(session.judgedWord).toEqual([Letter.A, Letter.B]);
  });

  it("persists coverage after every word so a closed tab can resume", async () => {
    const { session, speak, sessions } = harness();
    await session.start();
    await speak(2, 1.0);

    expect(sessions).toHaveLength(1);
    expect((sessions[0] as { wordsRecorded: number }).wordsRecorded).toBe(1);
  });
});

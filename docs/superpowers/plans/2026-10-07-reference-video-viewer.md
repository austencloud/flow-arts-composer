# Reference Video Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Reference video card in the staff grip lab that loads up to three camera videos of a real performance, syncs them by a clap, and drives the 3D performer from the timing Austen mapped in Post Studio, with each video shown beside a 3D view.

**Architecture:** Three pure modules (clap finder, reference clock, take lookup) carry the logic and the tests. A Svelte state class owns the loaded videos and the shared clock. Three components (panel, stage, transport) render it. The lab page swaps its four-pane grid for the reference layout while videos are loaded and feeds the reference clock's phase into the existing performer.

**Tech Stack:** Svelte 5 runes, Threlte, Vitest (`--config tests/config/vitest.config.ts`), Web Audio `decodeAudioData`, HTML video.

**Design note:** `docs/superpowers/specs/2026-10-07-reference-video-viewer-design.md`.

## Ground rules for every task

- Work in `E:/worktrees/tka-platform/reference-viewer` on `codex/reference-video-viewer`. Its `node_modules` is a junction to the primary checkout (Task 0). Never run `pnpm install` or `npm install` here.
- Run tests from the worktree: `npx vitest run --config tests/config/vitest.config.ts <file>`.
- Commit only the task's files with an explicit pathspec: `git commit -m "..." -- <paths>`. End messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never touch port 5173 or its process.

## File map

| File                                                               | Responsibility                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/routes/test/staff-grip/reference/clap-finder.ts`              | Pure: samples in, clap time out                                           |
| `src/routes/test/staff-grip/reference/reference-audio.ts`          | Browser: decode a video file's opening audio to mono samples              |
| `src/routes/test/staff-grip/reference/reference-clock.ts`          | Pure: timed-video seconds to lab phase, landing navigation, follower time |
| `src/routes/test/staff-grip/reference/reference-take.ts`           | Pure: find the post take and timing that match a picked file              |
| `src/routes/test/staff-grip/reference/reference-cameras.ts`        | Camera presets and per-video saved camera                                 |
| `src/routes/test/staff-grip/reference/reference-session.svelte.ts` | State: loaded videos, master clock, status, phase                         |
| `src/routes/test/staff-grip/reference/ReferencePanel.svelte`       | Rail card: add, list, offsets, presets, status                            |
| `src/routes/test/staff-grip/reference/ReferenceStage.svelte`       | Video row over 3D row, keeps videos in step                               |
| `src/routes/test/staff-grip/reference/ReferenceTransport.svelte`   | Play, frame and landing steps, scrub, speed                               |
| `src/routes/test/staff-grip/+page.svelte`                          | Mount the card, swap layouts, feed phase, pause synthetic clock           |
| `tests/unit/staff-grip-reference/*.test.ts`                        | Unit tests for the three pure modules                                     |

---

### Task 0: Worktree dependencies

- [ ] **Step 1: Link node_modules to the primary checkout**

```powershell
cmd /c mklink /J E:\worktrees\tka-platform\reference-viewer\node_modules E:\tka-platform\node_modules
```

Expected: `Junction created for ...`.

- [ ] **Step 2: Confirm vitest starts**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/3d-animation/staff-grip-url-contract.test.ts`
Expected: 1 passed.

---

### Task 1: Clap finder

**Files:**

- Create: `src/routes/test/staff-grip/reference/clap-finder.ts`
- Test: `tests/unit/staff-grip-reference/clap-finder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { findClapSeconds } from "../../../src/routes/test/staff-grip/reference/clap-finder";

const RATE = 48_000;

/** Deterministic noise so a failure reproduces. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff - 0.5;
  };
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE));
}

function addClap(samples: Float32Array, atSeconds: number, seed = 7): void {
  const random = noise(seed);
  const start = Math.round(atSeconds * RATE);
  for (let i = 0; i < Math.round(0.08 * RATE); i += 1) {
    const index = start + i;
    if (index >= samples.length) break;
    samples[index]! += 1.8 * random() * Math.exp(-i / (0.012 * RATE));
  }
}

function addMusic(samples: Float32Array, fromSeconds = 0, level = 0.3): void {
  const hiss = noise(99);
  for (let i = Math.round(fromSeconds * RATE); i < samples.length; i += 1) {
    const t = i / RATE;
    samples[i]! +=
      level * 0.6 * Math.sin(2 * Math.PI * 220 * t) +
      level * 0.4 * Math.sin(2 * Math.PI * 330 * t) +
      0.01 * hiss();
  }
}

describe("findClapSeconds", () => {
  it("finds a clap in a quiet room to within 2 ms", () => {
    const samples = silence(8);
    addClap(samples, 3.217);
    const found = findClapSeconds(samples, RATE);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - 3.217)).toBeLessThan(0.002);
  });

  it("finds a clap over steady music", () => {
    const samples = silence(10);
    addMusic(samples);
    addClap(samples, 5.5);
    const found = findClapSeconds(samples, RATE);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - 5.5)).toBeLessThan(0.002);
  });

  it("takes the clap, not music that starts after it", () => {
    const samples = silence(8);
    addClap(samples, 1.5);
    addMusic(samples, 3, 0.8);
    const found = findClapSeconds(samples, RATE);
    expect(Math.abs(found! - 1.5)).toBeLessThan(0.002);
  });

  it("returns null when nothing claps", () => {
    const samples = silence(10);
    addMusic(samples);
    expect(findClapSeconds(samples, RATE)).toBeNull();
  });

  it("ignores a clap past the search window", () => {
    const samples = silence(6);
    addClap(samples, 4);
    expect(findClapSeconds(samples, RATE, { searchSeconds: 2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/clap-finder.test.ts`
Expected: FAIL, cannot resolve `clap-finder`.

- [ ] **Step 3: Implement**

```ts
/**
 * Finds the clap that starts a multi-camera recording.
 *
 * Every camera hears the same clap, so its time in each video is what lines
 * the videos up. The signal is differenced first: a clap is broadband and
 * survives that almost whole, while sung or played tones, which carry most of
 * music's energy, nearly vanish. Short windows of the differenced energy are
 * then compared with the stretch just before them. The first window that is
 * both loud and a big jump over its past is the clap; the best window in the
 * next 50 ms settles which one. The answer is the first sample above half the
 * clap's peak, so two cameras agree to well under a video frame.
 */

export interface ClapSearchOptions {
  /** How far into the recording to look, seconds. */
  searchSeconds?: number;
  /** The clap's energy must exceed the stretch before it by this factor. */
  minJump?: number;
  /** And its differenced RMS must reach this level (full scale is 1). */
  minLevel?: number;
}

const WINDOW_SECONDS = 0.01;
const HOP_SECONDS = 0.005;
const BACKGROUND_SECONDS = 0.15;
const SETTLE_SECONDS = 0.05;

export function findClapSeconds(
  samples: Float32Array,
  sampleRate: number,
  options: ClapSearchOptions = {},
): number | null {
  const searchSeconds = options.searchSeconds ?? 20;
  const minJump = options.minJump ?? 20;
  const minLevel = options.minLevel ?? 0.1;
  const window = Math.max(2, Math.round(WINDOW_SECONDS * sampleRate));
  const hop = Math.max(1, Math.round(HOP_SECONDS * sampleRate));
  const end = Math.min(samples.length, Math.round(searchSeconds * sampleRate));

  const energies: number[] = [];
  for (let start = 1; start + window <= end; start += hop) {
    let sum = 0;
    for (let i = start; i < start + window; i += 1) {
      const step = samples[i]! - samples[i - 1]!;
      sum += step * step;
    }
    energies.push(sum / window);
  }

  const backgroundHops = Math.max(
    2,
    Math.round(BACKGROUND_SECONDS / HOP_SECONDS),
  );
  const settleHops = Math.max(1, Math.round(SETTLE_SECONDS / HOP_SECONDS));
  const jumpAt = (index: number): number => {
    let background = 0;
    // The hop just before overlaps this window, so it is left out.
    for (let b = index - backgroundHops; b < index - 1; b += 1) {
      background += energies[b]!;
    }
    background /= backgroundHops - 1;
    return energies[index]! / Math.max(background, 1e-10);
  };
  const qualifies = (index: number): boolean =>
    Math.sqrt(energies[index]!) >= minLevel && jumpAt(index) >= minJump;

  let first = -1;
  for (let index = backgroundHops; index < energies.length; index += 1) {
    if (qualifies(index)) {
      first = index;
      break;
    }
  }
  if (first < 0) return null;

  let best = first;
  for (
    let index = first + 1;
    index < Math.min(energies.length, first + settleHops);
    index += 1
  ) {
    if (jumpAt(index) > jumpAt(best)) best = index;
  }

  const from = Math.max(0, 1 + (best - 1) * hop);
  const to = Math.min(end, 1 + best * hop + window);
  let peak = 0;
  for (let i = from; i < to; i += 1)
    peak = Math.max(peak, Math.abs(samples[i]!));
  for (let i = from; i < to; i += 1) {
    if (Math.abs(samples[i]!) >= peak / 2) return i / sampleRate;
  }
  return (1 + best * hop) / sampleRate;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/clap-finder.test.ts`
Expected: 5 passed. If "takes the clap, not music" fails because the music's abrupt start wins, the first-qualifying rule is broken; if a 2 ms bound fails, inspect `from`/`to` refinement before loosening anything.

- [ ] **Step 5: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/clap-finder.ts tests/unit/staff-grip-reference/clap-finder.test.ts
git commit -m "feat(staff-grip): find the clap that syncs reference videos" -- src/routes/test/staff-grip/reference/clap-finder.ts tests/unit/staff-grip-reference/clap-finder.test.ts
```

---

### Task 2: Opening-audio decoder

**Files:**

- Create: `src/routes/test/staff-grip/reference/reference-audio.ts`

No unit test: it is a thin wrapper over the browser decoder, checked in Task 9.

- [ ] **Step 1: Implement**

```ts
/**
 * The opening seconds of a video's sound as one mono channel, for the clap
 * finder. Null when the browser cannot decode the file's audio or it has none.
 */
export interface DecodedOpening {
  samples: Float32Array;
  sampleRate: number;
}

export async function decodeOpeningAudio(
  file: Blob,
  seconds = 20,
): Promise<DecodedOpening | null> {
  if (typeof AudioContext === "undefined") return null;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const length = Math.min(
      buffer.length,
      Math.round(seconds * buffer.sampleRate),
    );
    const samples = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1)
        samples[i]! += data[i]! / buffer.numberOfChannels;
    }
    return { samples, sampleRate: buffer.sampleRate };
  } catch {
    return null;
  } finally {
    void context.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(staff-grip): decode a reference video's opening audio" -- src/routes/test/staff-grip/reference/reference-audio.ts
```

(Add the file first: `git add -- src/routes/test/staff-grip/reference/reference-audio.ts`.)

---

### Task 3: Reference clock

**Files:**

- Create: `src/routes/test/staff-grip/reference/reference-clock.ts`
- Test: `tests/unit/staff-grip-reference/reference-clock.test.ts`

Lab phase convention (from `LiveSequencePerformer3D.svelte`): phase 0 is the start of move 1, phase k is move k landed and move k+1 starting, and the lab wraps at the step count. That equals `SequenceFrame.passArrival`, clamped below the step count so a landed last move does not wrap to the opening.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  createTakeTiming,
  resolveTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

import {
  LANDED_PHASE_MARGIN,
  adjacentLandingSeconds,
  followerVideoSeconds,
  labPhaseAtVideoSeconds,
} from "../../../src/routes/test/staff-grip/reference/reference-clock";

const MOVE_BEATS = [1, 1, 1, 1];

function resolved() {
  const timing = createTakeTiming({
    sequenceId: "seq-test",
    takeKey: "local:a.mp4:1:1",
    durationSeconds: 30,
    bpm: 60,
    now: 1,
  });
  timing.sections[0] = {
    ...timing.sections[0]!,
    tempo: "locked",
    beatOneSeconds: 2,
    lastPosition: 8,
  };
  return resolveTakeTiming(timing, MOVE_BEATS);
}

describe("labPhaseAtVideoSeconds", () => {
  it("lands each move on its whole phase, wrapping each pass", () => {
    const timing = resolved();
    const landings = timing.sections[0]!.landings.filter(
      (landing) => landing.position >= 1 && landing.position <= 7,
    );
    expect(landings.length).toBe(7);
    for (const landing of landings) {
      const phase = labPhaseAtVideoSeconds(timing, MOVE_BEATS, landing.seconds);
      expect(phase).toBeCloseTo(
        landing.position % 4 === 0
          ? 4 - LANDED_PHASE_MARGIN
          : landing.position % 4,
        3,
      );
    }
  });

  it("is between two landings while a move is in flight", () => {
    const timing = resolved();
    const [, one, two] = timing.sections[0]!.landings;
    const phase = labPhaseAtVideoSeconds(
      timing,
      MOVE_BEATS,
      (one!.seconds + two!.seconds) / 2,
    )!;
    expect(phase).toBeGreaterThan(one!.position % 4);
    expect(phase).toBeLessThan(two!.position % 4 || 4);
  });

  it("holds the opening before the first move", () => {
    expect(labPhaseAtVideoSeconds(resolved(), MOVE_BEATS, 0)).toBe(0);
  });

  it("holds the last landing after the performance ends", () => {
    expect(labPhaseAtVideoSeconds(resolved(), MOVE_BEATS, 29)).toBeCloseTo(
      4 - LANDED_PHASE_MARGIN,
      6,
    );
  });
});

describe("adjacentLandingSeconds", () => {
  it("steps to the next and previous landing", () => {
    const timing = resolved();
    const seconds = timing.sections[0]!.landings.map(
      (landing) => landing.seconds,
    );
    const middle = (seconds[2]! + seconds[3]!) / 2;
    expect(adjacentLandingSeconds(timing, middle, 1)).toBeCloseTo(
      seconds[3]!,
      6,
    );
    expect(adjacentLandingSeconds(timing, middle, -1)).toBeCloseTo(
      seconds[2]!,
      6,
    );
    expect(adjacentLandingSeconds(timing, seconds[2]!, 1)).toBeCloseTo(
      seconds[3]!,
      6,
    );
  });

  it("returns null past the last landing", () => {
    expect(adjacentLandingSeconds(resolved(), 29.9, 1)).toBeNull();
  });
});

describe("followerVideoSeconds", () => {
  it("shifts a follower by the difference between the claps", () => {
    expect(
      followerVideoSeconds(
        10,
        { clapSeconds: 2, manualOffsetSeconds: 0 },
        { clapSeconds: 3.5, manualOffsetSeconds: 0.1 },
      ),
    ).toBeCloseTo(11.6, 9);
  });

  it("uses only the manual offset when either clap is missing", () => {
    expect(
      followerVideoSeconds(
        10,
        { clapSeconds: null, manualOffsetSeconds: 0 },
        { clapSeconds: 3.5, manualOffsetSeconds: -0.2 },
      ),
    ).toBeCloseTo(9.8, 9);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/reference-clock.test.ts`
Expected: FAIL, cannot resolve `reference-clock`.

- [ ] **Step 3: Implement**

```ts
/**
 * Time in the reference videos, in the lab's terms.
 *
 * The timed video is the clock. Its timing, mapped in Post Studio, says where
 * in the sequence the performer is at each moment; this module turns that
 * into the lab's phase. The other videos follow the timed one, shifted by
 * however much later or earlier each heard the clap.
 */
import { sequenceFrameAt } from "$lib/shared/media-composition/domain/sequence-frame";
import {
  takeSampleAt,
  type ResolvedTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * How far below the step count a landed last move sits. The lab wraps a
 * phase equal to the step count back to the opening, which is a different
 * pose for a sequence that does not return to its start.
 */
export const LANDED_PHASE_MARGIN = 0.001;

/** The lab phase at a time in the timed video; null when nothing is mapped. */
export function labPhaseAtVideoSeconds(
  resolved: ResolvedTakeTiming,
  moveBeats: readonly number[],
  seconds: number,
): number | null {
  const sample = takeSampleAt(resolved, seconds);
  if (!sample) return null;
  const frame = sequenceFrameAt(sample.arrival, moveBeats, {
    endArrival: sample.endArrival,
  });
  if (frame.phase === "opening") return 0;
  return Math.min(frame.passArrival, moveBeats.length - LANDED_PHASE_MARGIN);
}

const SAME_MOMENT_SECONDS = 1 / 240;

/** The landing after (1) or before (-1) a time, across every mapped section. */
export function adjacentLandingSeconds(
  resolved: ResolvedTakeTiming,
  seconds: number,
  direction: 1 | -1,
): number | null {
  const times = resolved.sections
    .flatMap((section) => section.landings.map((landing) => landing.seconds))
    .sort((a, b) => a - b);
  if (direction === 1) {
    return times.find((time) => time > seconds + SAME_MOMENT_SECONDS) ?? null;
  }
  for (let index = times.length - 1; index >= 0; index -= 1) {
    if (times[index]! < seconds - SAME_MOMENT_SECONDS) return times[index]!;
  }
  return null;
}

export interface ReferenceSync {
  /** When this video heard the clap; null when none was found. */
  clapSeconds: number | null;
  /** Austen's own nudge on top of the clap, seconds. */
  manualOffsetSeconds: number;
}

/** Where a follower video should be when the timed one is at `masterSeconds`. */
export function followerVideoSeconds(
  masterSeconds: number,
  master: ReferenceSync,
  follower: ReferenceSync,
): number {
  const clapShift =
    master.clapSeconds !== null && follower.clapSeconds !== null
      ? follower.clapSeconds - master.clapSeconds
      : 0;
  return masterSeconds + clapShift + follower.manualOffsetSeconds;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/reference-clock.test.ts`
Expected: 8 passed. If the landing test finds fewer than 7 landings, print `timing.sections[0].landings` and adjust only the fixture (beat one, `lastPosition`), never the module.

- [ ] **Step 5: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/reference-clock.ts tests/unit/staff-grip-reference/reference-clock.test.ts
git commit -m "feat(staff-grip): turn reference video time into lab phase" -- src/routes/test/staff-grip/reference/reference-clock.ts tests/unit/staff-grip-reference/reference-clock.test.ts
```

---

### Task 4: Take lookup

**Files:**

- Create: `src/routes/test/staff-grip/reference/reference-take.ts`
- Test: `tests/unit/staff-grip-reference/reference-take.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

import {
  timedTakeForFile,
  timingForTake,
} from "../../../src/routes/test/staff-grip/reference/reference-take";

const FILE = { name: "front.mp4", size: 1000, lastModified: 42 };
const KEY = "local:front.mp4:1000:42";
const MOVE_BEATS = [1, 1, 1, 1];

function project() {
  const base = createEmptyPostProject({ sequenceId: "seq-test", now: 1 });
  return {
    ...base,
    takes: [
      {
        id: "take-1",
        label: "Front",
        ref: { kind: "local" as const, ...FILE },
        takeKey: KEY,
        durationSeconds: 30,
      },
    ],
  };
}

function mapped(updatedAt: number): TakeTiming {
  const timing = createTakeTiming({
    sequenceId: "seq-test",
    takeKey: KEY,
    durationSeconds: 30,
    bpm: 60,
    now: updatedAt,
  });
  timing.sections[0] = {
    ...timing.sections[0]!,
    tempo: "locked",
    beatOneSeconds: 2,
  };
  return timing;
}

describe("timingForTake", () => {
  it("prefers the newer of the saved and embedded timings", () => {
    const post = { ...project(), timings: { "take-1": mapped(5) } };
    const saved = mapped(9);
    expect(timingForTake(post, post.takes[0]!, () => saved)?.updatedAt).toBe(9);
    expect(
      timingForTake(post, post.takes[0]!, () => mapped(3))?.updatedAt,
    ).toBe(5);
  });

  it("ignores an embedded timing for another take", () => {
    const post = {
      ...project(),
      timings: { "take-1": { ...mapped(5), takeKey: "local:other.mp4:1:1" } },
    };
    expect(timingForTake(post, post.takes[0]!, () => null)).toBeNull();
  });
});

describe("timedTakeForFile", () => {
  it("finds the take whose file matches and whose timing is mapped", () => {
    const found = timedTakeForFile(project(), FILE, MOVE_BEATS, () =>
      mapped(5),
    );
    expect(found?.take.id).toBe("take-1");
  });

  it("returns null for a file the post does not hold", () => {
    expect(
      timedTakeForFile(project(), { ...FILE, size: 999 }, MOVE_BEATS, () =>
        mapped(5),
      ),
    ).toBeNull();
  });

  it("returns null when the take has no timing yet", () => {
    expect(
      timedTakeForFile(project(), FILE, MOVE_BEATS, () => null),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/reference-take.test.ts`
Expected: FAIL, cannot resolve `reference-take`.

- [ ] **Step 3: Implement**

```ts
/**
 * Which post take a picked video file is, and the timing Post Studio would
 * open for it. A local take keeps only its file's name, size and date, so a
 * picked file is matched on those three.
 */
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import {
  TakeTimingSchema,
  isTakeTimingMapped,
  resolveTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

export interface PickedFileIdentity {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

export type LoadSavedTiming = (
  sequenceId: string,
  takeKey: string,
) => TakeTiming | null;

export interface TimedTake {
  take: PostTake;
  timing: TakeTiming;
}

function takesForFile(
  project: PostProject,
  file: PickedFileIdentity,
): PostTake[] {
  return project.takes.filter(
    (take) =>
      take.ref.kind === "local" &&
      take.ref.name === file.name &&
      take.ref.size === file.size &&
      take.ref.lastModified === file.lastModified,
  );
}

/** Same rule as the editor's `openTiming`: the newer of saved and embedded. */
export function timingForTake(
  project: PostProject,
  take: PostTake,
  loadSaved: LoadSavedTiming,
): TakeTiming | null {
  const saved = loadSaved(project.sequenceId, take.takeKey);
  const embedded = project.timings?.[take.id];
  const validEmbedded =
    embedded?.sequenceId === project.sequenceId &&
    embedded.takeKey === take.takeKey &&
    TakeTimingSchema.safeParse(embedded).success
      ? embedded
      : null;
  if (saved && validEmbedded) {
    return saved.updatedAt > validEmbedded.updatedAt ? saved : validEmbedded;
  }
  return validEmbedded ?? saved;
}

/** The first take of this file with a mapped timing, or null. */
export function timedTakeForFile(
  project: PostProject,
  file: PickedFileIdentity,
  moveBeats: readonly number[],
  loadSaved: LoadSavedTiming,
): TimedTake | null {
  for (const take of takesForFile(project, file)) {
    const timing = timingForTake(project, take, loadSaved);
    if (timing && isTakeTimingMapped(resolveTakeTiming(timing, moveBeats))) {
      return { take, timing };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference/reference-take.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/reference-take.ts tests/unit/staff-grip-reference/reference-take.test.ts
git commit -m "feat(staff-grip): match reference videos to their Post Studio takes" -- src/routes/test/staff-grip/reference/reference-take.ts tests/unit/staff-grip-reference/reference-take.test.ts
```

---

### Task 5: Camera presets

**Files:**

- Create: `src/routes/test/staff-grip/reference/reference-cameras.ts`

Presets frame the whole body. Azimuth follows `InspectionView`: 0 faces the performer from the audience, positive swings to the performer's left.

- [ ] **Step 1: Implement**

```ts
import type { InspectionView } from "../inspection-framing";

const body = (
  id: string,
  label: string,
  azimuthDeg: number,
  elevationDeg = 6,
): InspectionView => ({
  id,
  label,
  hint: "Your camera",
  subject: "body",
  azimuthDeg,
  elevationDeg,
  grid: "reference",
});

export const REFERENCE_CAMERA_PRESETS: readonly InspectionView[] = [
  body("front", "Front", 0),
  body("quarter-left", "Three-quarter left", 45),
  body("left", "Left side", 90),
  body("quarter-right", "Three-quarter right", -45),
  body("right", "Right side", -90),
  body("back", "Back", 180),
  body("overhead", "Overhead", 0, 68),
];

/** First guesses for the first, second and third video. */
export const DEFAULT_PRESET_BY_SLOT = [
  "front",
  "left",
  "quarter-right",
] as const;

export function referencePreset(id: string): InspectionView {
  return (
    REFERENCE_CAMERA_PRESETS.find((preset) => preset.id === id) ??
    REFERENCE_CAMERA_PRESETS[0]!
  );
}

type Vec3 = [number, number, number];

export interface SavedReferenceCamera {
  presetId: string;
  /** The dragged camera, when Austen fine-tuned it. */
  shot: { position: Vec3; target: Vec3 } | null;
}

const PREFIX = "tka:staff-grip:reference-camera:v1:";

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export function loadReferenceCamera(
  videoKey: string,
): SavedReferenceCamera | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(PREFIX + videoKey) ?? "null",
    ) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const { presetId, shot } = raw as Record<string, unknown>;
    if (typeof presetId !== "string") return null;
    const validShot =
      shot &&
      typeof shot === "object" &&
      isVec3((shot as Record<string, unknown>).position) &&
      isVec3((shot as Record<string, unknown>).target)
        ? (shot as SavedReferenceCamera["shot"])
        : null;
    return { presetId, shot: validShot };
  } catch {
    return null;
  }
}

export function saveReferenceCamera(
  videoKey: string,
  camera: SavedReferenceCamera,
): void {
  try {
    localStorage.setItem(PREFIX + videoKey, JSON.stringify(camera));
  } catch {
    // A full or blocked store only costs the remembered angle.
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/reference-cameras.ts
git commit -m "feat(staff-grip): camera presets for reference videos" -- src/routes/test/staff-grip/reference/reference-cameras.ts
```

---

### Task 6: Reference session state

**Files:**

- Create: `src/routes/test/staff-grip/reference/reference-session.svelte.ts`

- [ ] **Step 1: Implement**

```ts
/**
 * The reference videos loaded into the lab and the one clock they share.
 *
 * The timed video, the one whose Post Studio take carries mapped timing, is
 * the clock; without one the first video is, and the performer stays where
 * the lab put it. Files live only for this visit: a browser cannot reopen a
 * local file from a saved name, so Austen picks them again next time.
 */
import { auth } from "$lib/shared/auth/firebase";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  resolveTakeTiming,
  takeTimingStatus,
  type ResolvedTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { loadPostProject } from "$lib/shared/media-composition/services/post-project-store";
import {
  localTakeKey,
  loadTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";

import { findClapSeconds } from "./clap-finder";
import {
  DEFAULT_PRESET_BY_SLOT,
  loadReferenceCamera,
  saveReferenceCamera,
  type SavedReferenceCamera,
} from "./reference-cameras";
import { decodeOpeningAudio } from "./reference-audio";
import {
  adjacentLandingSeconds,
  followerVideoSeconds,
  labPhaseAtVideoSeconds,
} from "./reference-clock";
import { timedTakeForFile, type TimedTake } from "./reference-take";

export const MAX_REFERENCE_VIDEOS = 3;
export const FRAME_SECONDS = 1 / 30;

export type ClapState = "finding" | "found" | "none";

export interface ReferenceVideo {
  key: string;
  name: string;
  url: string;
  clapSeconds: number | null;
  clapState: ClapState;
  manualOffsetSeconds: number;
  durationSeconds: number | null;
  camera: SavedReferenceCamera;
}

export type ReferenceStatus =
  | "empty"
  | "loading"
  | "no-post"
  | "no-timing"
  | "stale"
  | "ready";

export class ReferenceSession {
  videos = $state.raw<ReferenceVideo[]>([]);
  timed = $state.raw<TimedTake | null>(null);
  postFound = $state(false);
  loading = $state(false);
  /** Seconds in the clock video. */
  time = $state(0);
  playing = $state(false);
  speed = $state(1);

  readonly #files = new Map<string, File>();
  readonly #getSequence: () => SequenceData | null;

  constructor(getSequence: () => SequenceData | null) {
    this.#getSequence = getSequence;
  }

  readonly active = $derived(this.videos.length > 0);

  readonly moveBeats = $derived(
    this.#getSequence()?.steps.map((step) => step.duration ?? 1) ?? [],
  );

  readonly resolved = $derived.by((): ResolvedTakeTiming | null =>
    this.timed && this.moveBeats.length > 0
      ? resolveTakeTiming(this.timed.timing, this.moveBeats)
      : null,
  );

  readonly clockKey = $derived(
    this.timed
      ? (this.videos.find((video) => video.key === this.timed!.take.takeKey)
          ?.key ?? null)
      : (this.videos[0]?.key ?? null),
  );

  readonly status = $derived.by((): ReferenceStatus => {
    if (this.videos.length === 0) return "empty";
    if (this.loading) return "loading";
    if (!this.postFound) return "no-post";
    if (!this.timed) return "no-timing";
    if (takeTimingStatus(this.timed.timing, this.moveBeats) === "stale")
      return "stale";
    return "ready";
  });

  readonly labPhase = $derived(
    this.resolved
      ? labPhaseAtVideoSeconds(this.resolved, this.moveBeats, this.time)
      : null,
  );

  readonly durationSeconds = $derived(
    this.videos.find((video) => video.key === this.clockKey)?.durationSeconds ??
      0,
  );

  /** Where one video should be right now. */
  videoSeconds(video: ReferenceVideo): number {
    const clock = this.videos.find(
      (candidate) => candidate.key === this.clockKey,
    );
    if (!clock || video.key === clock.key) return this.time;
    return followerVideoSeconds(this.time, clock, video);
  }

  async addFiles(files: Iterable<File>, sequenceId: string): Promise<void> {
    const room = MAX_REFERENCE_VIDEOS - this.videos.length;
    const added = [...files]
      .filter((file) => file.type.startsWith("video/"))
      .filter((file) => !this.#files.has(localTakeKey(file)))
      .slice(0, Math.max(0, room));
    if (added.length === 0) return;
    const fresh = added.map((file, index): ReferenceVideo => {
      const key = localTakeKey(file);
      this.#files.set(key, file);
      return {
        key,
        name: file.name,
        url: URL.createObjectURL(file),
        clapSeconds: null,
        clapState: "finding",
        manualOffsetSeconds: 0,
        durationSeconds: null,
        camera: loadReferenceCamera(key) ?? {
          presetId:
            DEFAULT_PRESET_BY_SLOT[this.videos.length + index] ?? "front",
          shot: null,
        },
      };
    });
    this.videos = [...this.videos, ...fresh];
    await this.findTimedTake(sequenceId);
    for (const video of fresh) void this.#findClap(video.key);
  }

  /** Reads the post again, e.g. after Austen maps timing in another tab. */
  async findTimedTake(sequenceId: string): Promise<void> {
    this.loading = true;
    try {
      // The post and timing stores key by the signed-in user, whom Firebase
      // restores after the page loads.
      await auth.authStateReady();
      const project = loadPostProject(sequenceId);
      this.postFound = project !== null;
      let timed: TimedTake | null = null;
      if (project) {
        for (const video of this.videos) {
          const file = this.#files.get(video.key);
          if (!file) continue;
          timed = timedTakeForFile(
            project,
            file,
            this.moveBeats,
            loadTakeTiming,
          );
          if (timed) break;
        }
      }
      this.timed = timed;
    } finally {
      this.loading = false;
    }
  }

  async #findClap(key: string): Promise<void> {
    const file = this.#files.get(key);
    const decoded = file ? await decodeOpeningAudio(file) : null;
    const clap = decoded
      ? findClapSeconds(decoded.samples, decoded.sampleRate)
      : null;
    this.#update(key, {
      clapSeconds: clap,
      clapState: clap === null ? "none" : "found",
    });
  }

  #update(key: string, patch: Partial<ReferenceVideo>): void {
    this.videos = this.videos.map((video) =>
      video.key === key ? { ...video, ...patch } : video,
    );
  }

  setDuration(key: string, seconds: number): void {
    if (Number.isFinite(seconds))
      this.#update(key, { durationSeconds: seconds });
  }

  setManualOffset(key: string, seconds: number): void {
    this.#update(key, { manualOffsetSeconds: seconds });
  }

  setCamera(key: string, camera: SavedReferenceCamera): void {
    saveReferenceCamera(key, camera);
    this.#update(key, { camera });
  }

  remove(key: string, sequenceId: string): void {
    const video = this.videos.find((candidate) => candidate.key === key);
    if (video) URL.revokeObjectURL(video.url);
    this.#files.delete(key);
    this.videos = this.videos.filter((candidate) => candidate.key !== key);
    if (this.videos.length === 0) this.playing = false;
    void this.findTimedTake(sequenceId);
  }

  seek(seconds: number): void {
    this.time = Math.min(Math.max(0, seconds), this.durationSeconds || seconds);
  }

  stepFrame(direction: 1 | -1): void {
    this.playing = false;
    this.seek(this.time + direction * FRAME_SECONDS);
  }

  stepLanding(direction: 1 | -1): void {
    if (!this.resolved) return;
    const next = adjacentLandingSeconds(this.resolved, this.time, direction);
    if (next === null) return;
    this.playing = false;
    this.seek(next);
  }

  dispose(): void {
    for (const video of this.videos) URL.revokeObjectURL(video.url);
    this.#files.clear();
    this.videos = [];
  }
}
```

- [ ] **Step 2: Type-check the reference folder**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "staff-grip/reference"` (PowerShell). The repo's `npm run check` is blind in reduced mode, so this targeted read of tsc output is the narrow check. Expected: no lines.

- [ ] **Step 3: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/reference-session.svelte.ts
git commit -m "feat(staff-grip): reference session state and shared clock" -- src/routes/test/staff-grip/reference/reference-session.svelte.ts
```

---

### Task 7: Panel, stage and transport components

**Files:**

- Create: `src/routes/test/staff-grip/reference/ReferencePanel.svelte`
- Create: `src/routes/test/staff-grip/reference/ReferenceStage.svelte`
- Create: `src/routes/test/staff-grip/reference/ReferenceTransport.svelte`

- [ ] **Step 1: ReferencePanel.svelte**

```svelte
<!--
  The Reference video card: add up to three camera videos of a real
  performance, see how each one synced, and nudge or re-aim it.
-->
<script lang="ts">
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";

  import { REFERENCE_CAMERA_PRESETS } from "./reference-cameras";
  import {
    FRAME_SECONDS,
    MAX_REFERENCE_VIDEOS,
    type ReferenceSession,
    type ReferenceVideo,
  } from "./reference-session.svelte";

  let { session, sequenceId }: { session: ReferenceSession; sequenceId: string } = $props();

  let input: HTMLInputElement | null = $state(null);

  const statusText = $derived(
    {
      empty: "Add up to three videos of yourself doing this sequence, started with one clap.",
      loading: "Reading your post…",
      "no-post": "This sequence has no Post Studio post yet. Add the videos there and map the timing on one of them.",
      "no-timing": "None of these videos has mapped timing in Post Studio, so the performer stays where the lab puts it.",
      stale: "The sequence changed after its timing was mapped. The performer follows the old landings.",
      ready: "The performer follows your timed video.",
    }[session.status]
  );

  function syncText(video: ReferenceVideo): string {
    if (session.timed && video.key === session.timed.take.takeKey) return "Timed in Post Studio";
    if (video.clapState === "finding") return "Listening for the clap…";
    if (video.clapState === "none") return "No clap found; line it up by hand";
    return `Clap at ${video.clapSeconds!.toFixed(2)} s`;
  }
</script>

<section class="card" aria-label="Reference video">
  <h2 class="card-title">Reference video</h2>
  <p class="note">{statusText}</p>
  {#if session.status === "no-post" || session.status === "no-timing" || session.status === "stale"}
    <div class="row">
      <a class="link" href={`/post?project=${encodeURIComponent(sequenceId)}`} target="_blank" rel="noopener">Open Post Studio</a>
      <button type="button" class="link" onclick={() => void session.findTimedTake(sequenceId)}>Check again</button>
    </div>
  {/if}

  {#each session.videos as video (video.key)}
    <div class="video-row">
      <div class="row">
        <span class="name" title={video.name}>{video.name}</span>
        <button type="button" class="link" aria-label={`Remove ${video.name}`} onclick={() => session.remove(video.key, sequenceId)}>Remove</button>
      </div>
      <span class="note">{syncText(video)}</span>
      <label class="field">
        <span class="field-label">Camera</span>
        <select
          value={video.camera.presetId}
          onchange={(event) => session.setCamera(video.key, { presetId: event.currentTarget.value, shot: null })}
        >
          {#each REFERENCE_CAMERA_PRESETS as preset (preset.id)}
            <option value={preset.id}>{preset.label}</option>
          {/each}
        </select>
      </label>
      {#if !(session.timed && video.key === session.timed.take.takeKey)}
        <ScrubbableNumber
          label="Offset"
          unit="s"
          value={video.manualOffsetSeconds}
          min={-5}
          max={5}
          step={FRAME_SECONDS}
          format={(value) => value.toFixed(3)}
          onchange={(value) => session.setManualOffset(video.key, value)}
        />
      {/if}
    </div>
  {/each}

  {#if session.videos.length < MAX_REFERENCE_VIDEOS}
    <input
      bind:this={input}
      class="hidden"
      type="file"
      accept="video/*"
      multiple
      onchange={(event) => {
        const files = event.currentTarget.files;
        if (files) void session.addFiles(files, sequenceId);
        event.currentTarget.value = "";
      }}
    />
    <button type="button" class="add" onclick={() => input?.click()}>
      {session.videos.length === 0 ? "Add videos" : "Add another video"}
    </button>
  {/if}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }
  .card-title {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }
  .note,
  .field-label {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }
  .video-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  select,
  .add {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
    font: inherit;
    padding: 0 0.75rem;
  }
  .link {
    background: none;
    border: none;
    padding: 0.25rem 0;
    color: var(--theme-accent, #8ab4ff);
    font: inherit;
    cursor: pointer;
    min-height: 44px;
  }
  .hidden {
    display: none;
  }
</style>
```

- [ ] **Step 2: ReferenceStage.svelte**

```svelte
<!--
  Each reference video over the 3D view aimed the same way. The clock video
  plays natively; the others are pulled back into step whenever they drift
  more than a couple of frames, and every video is seeked while paused.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import type { ReferenceSession, ReferenceVideo } from "./reference-session.svelte";

  let {
    session,
    pane,
  }: {
    session: ReferenceSession;
    pane: Snippet<[ReferenceVideo, number, number]>;
  } = $props();

  const elements: Record<string, HTMLVideoElement> = {};
  let paneWidths = $state<number[]>([]);
  let paneHeights = $state<number[]>([]);
  const DRIFT_SECONDS = 0.08;

  $effect(() => {
    const playing = session.playing;
    const speed = session.speed;
    for (const video of session.videos) {
      const element = elements[video.key];
      if (!element) continue;
      element.playbackRate = speed;
      if (playing) void element.play().catch(() => (session.playing = false));
      else element.pause();
    }
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const clock = session.clockKey ? elements[session.clockKey] : undefined;
      if (clock) session.time = clock.currentTime;
      for (const video of session.videos) {
        const element = elements[video.key];
        if (!element || video.key === session.clockKey) continue;
        const target = session.videoSeconds(video);
        if (Math.abs(element.currentTime - target) > DRIFT_SECONDS) element.currentTime = Math.max(0, target);
      }
      if (clock?.ended) session.playing = false;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (session.playing) return;
    for (const video of session.videos) {
      const element = elements[video.key];
      if (!element) continue;
      const target = Math.max(0, session.videoSeconds(video));
      if (Math.abs(element.currentTime - target) > 1 / 120) element.currentTime = target;
    }
  });
</script>

<div class="reference" style:--columns={session.videos.length}>
  {#each session.videos as video, index (video.key)}
    <div class="cell video-cell">
      <video
        bind:this={elements[video.key]}
        src={video.url}
        muted={video.key !== session.clockKey}
        playsinline
        preload="auto"
        onloadedmetadata={(event) => session.setDuration(video.key, event.currentTarget.duration)}
      ></video>
      <span class="label">{video.name}</span>
    </div>
  {/each}
  {#each session.videos as video, index (video.key)}
    <div class="cell" bind:clientWidth={paneWidths[index]} bind:clientHeight={paneHeights[index]}>
      {@render pane(video, index, (paneWidths[index] ?? 1) / Math.max(1, paneHeights[index] ?? 1))}
    </div>
  {/each}
</div>

<style>
  .reference {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1px;
  }
  .cell {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .label {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.6);
    font-size: var(--font-size-compact, 0.75rem);
  }
</style>
```

- [ ] **Step 3: ReferenceTransport.svelte**

```svelte
<!-- Play, frame and landing steps, scrub and speed for the reference clock. -->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  import type { ReferenceSession } from "./reference-session.svelte";

  let { session }: { session: ReferenceSession } = $props();

  // SegmentedControl takes string values.
  const speeds = [
    { value: "0.25", label: "¼×" },
    { value: "0.5", label: "½×" },
    { value: "1", label: "1×" },
  ];
</script>

<div class="transport" aria-label="Reference playback">
  <button type="button" aria-label="Previous landing" disabled={!session.resolved} onclick={() => session.stepLanding(-1)}>
    <i class="fas fa-backward-step" aria-hidden="true"></i>
  </button>
  <button type="button" aria-label="Back one frame" onclick={() => session.stepFrame(-1)}>
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
  </button>
  <button type="button" class="play" aria-label={session.playing ? "Pause" : "Play"} onclick={() => (session.playing = !session.playing)}>
    <i class={session.playing ? "fas fa-pause" : "fas fa-play"} aria-hidden="true"></i>
  </button>
  <button type="button" aria-label="Forward one frame" onclick={() => session.stepFrame(1)}>
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
  <button type="button" aria-label="Next landing" disabled={!session.resolved} onclick={() => session.stepLanding(1)}>
    <i class="fas fa-forward-step" aria-hidden="true"></i>
  </button>
  <input
    type="range"
    aria-label="Video time"
    min="0"
    max={session.durationSeconds || 1}
    step="0.001"
    value={session.time}
    oninput={(event) => {
      session.playing = false;
      session.seek(Number(event.currentTarget.value));
    }}
  />
  <span class="time">{session.time.toFixed(2)} s</span>
  <SegmentedControl options={speeds} value={String(session.speed)} density="tight" ariaLabel="Playback speed" onchange={(speed) => (session.speed = Number(speed))} />
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  button {
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
  }
  button:disabled {
    opacity: 0.4;
  }
  input[type="range"] {
    flex: 1;
    min-width: 0;
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 5ch;
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add -- src/routes/test/staff-grip/reference/ReferencePanel.svelte src/routes/test/staff-grip/reference/ReferenceStage.svelte src/routes/test/staff-grip/reference/ReferenceTransport.svelte
git commit -m "feat(staff-grip): reference video panel, stage and transport" -- src/routes/test/staff-grip/reference/ReferencePanel.svelte src/routes/test/staff-grip/reference/ReferenceStage.svelte src/routes/test/staff-grip/reference/ReferenceTransport.svelte
```

---

### Task 8: Wire the lab page

**Files:**

- Modify: `src/routes/test/staff-grip/+page.svelte`

- [ ] **Step 1: Imports and session** (after the existing `./lab-catalog` import block)

```ts
import { onDestroy } from "svelte";
import ReferencePanel from "./reference/ReferencePanel.svelte";
import ReferenceStage from "./reference/ReferenceStage.svelte";
import ReferenceTransport from "./reference/ReferenceTransport.svelte";
import { referencePreset } from "./reference/reference-cameras";
import {
  ReferenceSession,
  type ReferenceVideo,
} from "./reference/reference-session.svelte";
```

And after `sequence` is declared:

```ts
const reference = new ReferenceSession(() => sequence ?? null);
onDestroy(() => reference.dispose());

// Reference mode: the timed video says where the performer is.
$effect(() => {
  const phase = reference.labPhase;
  if (phase !== null) lab.setPhase(phase);
});
```

`onMount` is already imported from `svelte`; merge `onDestroy` into that import instead of adding a second line.

- [ ] **Step 2: Stop the synthetic clock in reference mode**

In the playback `$effect`, change `if (!lab.playing) return;` to:

```ts
if (!lab.playing || reference.active) return;
```

- [ ] **Step 3: Extract the pane into a snippet**

Move the `<Canvas>…</Canvas>` block from the `{#each activeViews …}` loop into a snippet declared in the markup above `<main>`, parameterised by camera shot, grid emphasis, index and an optional camera-end callback:

```svelte
{#snippet stagePane(
  shot: { position: [number, number, number]; target: [number, number, number] },
  grid: "reference" | "muted",
  index: number,
  onCameraEnd?: (position: [number, number, number], target: [number, number, number]) => void
)}
  <Canvas shadows rendererParameters={{ alpha: true }}>
    <T.PerspectiveCamera makeDefault position={shot.position} fov={INSPECTION_FOV_DEG}>
      <OrbitControls
        enableDamping
        enablePan={false}
        rightDragAction="rotate"
        target={shot.target}
        minDistance={0.3}
        maxDistance={12}
        maxPolarAngle={Math.PI}
        oncontrolend={onCameraEnd
          ? (controls) => {
              const position = controls.getPosition(new Vector3());
              const target = controls.getTarget(new Vector3());
              onCameraEnd([position.x, position.y, position.z], [target.x, target.y, target.z]);
            }
          : undefined}
      />
    </T.PerspectiveCamera>
    <!-- StaffGripStage exactly as before, with `id={`staff-grip-${index}`}`,
         `gridEmphasis={grid}`, and the three `index === 0` callbacks unchanged. -->
  </Canvas>
{/snippet}
```

Copy the existing `<StaffGripStage …/>` element into the snippet unchanged except `id` and `gridEmphasis`. Add `import { Vector3 } from "three";`. Check the `shots` element type in the page and match the snippet's `shot` type to it if it differs (for example `Vec3Tuple`).

The existing loop body becomes:

```svelte
{@render stagePane(shots[index], view.grid, index)}
```

- [ ] **Step 4: Reference layout**

Replace the `<div class="views" …>…</div>` plus `<LabTransport …/>` pair with:

```svelte
{#if reference.active && sequence}
  <ReferenceStage session={reference} pane={referencePane} />
  <ReferenceTransport session={reference} />
{:else}
  <!-- the existing views div and LabTransport, unchanged -->
{/if}
```

with this snippet next to `stagePane`:

```svelte
{#snippet referencePane(video: ReferenceVideo, index: number, aspect: number)}
  {@render stagePane(
    video.camera.shot ?? inspectionShotForView(referencePreset(video.camera.presetId), aspect),
    "reference",
    index,
    (position, target) =>
      reference.setCamera(video.key, { presetId: video.camera.presetId, shot: { position, target } })
  )}
{/snippet}
```

- [ ] **Step 5: Mount the card and expose state**

After `<LabControls … />` in the rail:

```svelte
<ReferencePanel session={reference} sequenceId={lab.sequenceId} />
```

On `<main>` add:

```svelte
  data-reference-videos={reference.videos.length}
  data-reference-status={reference.status}
  data-reference-seconds={reference.time.toFixed(3)}
```

- [ ] **Step 6: Narrow checks**

Run the three unit files:
`npx vitest run --config tests/config/vitest.config.ts tests/unit/staff-grip-reference tests/unit/3d-animation/staff-grip-url-contract.test.ts`
Expected: all pass.

Run svelte-check scoped to the lab (after the resource-budget gate in `.claude/rules/resource-budget.md`: one svelte-check machine-wide, at least 4096 MB free):
`npx svelte-check --workspace src/routes/test/staff-grip --threshold error`
Expected: 0 errors in `staff-grip/reference` and no new errors in `+page.svelte` compared with main.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(staff-grip): reference video mode in the staff grip lab" -- src/routes/test/staff-grip/+page.svelte
```

---

### Task 9: Browser verification

- [ ] **Step 1: Make three test videos with a shared clap** (scratchpad, never committed)

If `ffmpeg` is on PATH, render three 12-second clips of differently coloured frames whose audio is silence with a click at 1.0 s, 1.4 s and 0.7 s. Otherwise record three short clips with the agent browser's `MediaRecorder` from a canvas plus an `OscillatorNode` click.

- [ ] **Step 2: Seed a post and timing for the timed clip**

In the agent browser on a task-owned preview of this worktree (free non-5173 port, `.claude/rules/resource-budget.md`), open Post Studio for the lab's sequence, add the first clip, tap beat one and save. If driving Post Studio is impractical, write `PostProject` and `TakeTiming` JSON into localStorage through `evaluate_script` under the keys documented in `post-project-store.ts` and `take-timing-store.ts`.

- [ ] **Step 3: Check the lab**

Open `/test/staff-grip?seq=<that id>`, add all three clips. Confirm:

- `data-reference-status="ready"`, three videos, three 3D panes.
- Each follower card reads its clap time; follower `currentTime` minus clock `currentTime` equals the clap difference within 0.04 s while playing.
- Next landing moves `data-phase` to a whole number; frame step changes `data-reference-seconds` by 0.033.
- Dragging a 3D pane and reloading with the same files restores that angle.
- No console errors.

- [ ] **Step 4: Screenshot and deliver**

Screenshot at 1440 x 900 and at a 390 px phone width (the rail stacks there; the stage must not scroll sideways). Then `npm run wt:finish -- codex/reference-video-viewer --route /test/staff-grip` from `E:/tka-platform`, verify on :5173, and report.

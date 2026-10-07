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

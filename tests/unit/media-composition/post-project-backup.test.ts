import { describe, expect, it } from "vitest";
import {
  parsePostStudioBackup,
  projectDraftRecord,
  resolvePostStudioDraft,
  serializePostStudioBackup,
} from "#lib/shared/media-composition/services/post-project-backup.js";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { createTakeTiming } from "#lib/shared/media-composition/domain/take-timing.js";
import type { PostTake } from "#lib/shared/media-composition/domain/post-plan.js";

const SEQUENCE = "post-recovery";
const PREFIX = `tka:post-studio:take-timing:v1:${SEQUENCE}:`;

function makeTake(
  id: string,
  takeKey: string,
  url = "/prepared/cut.mp4",
  durationSeconds = 20
): PostTake {
  return {
    id,
    takeKey,
    label: "The same visible label",
    ref: { kind: "linked", url },
    durationSeconds,
  };
}

function timing(take: PostTake, updatedAt: number, taps: number[]) {
  const base = createTakeTiming({
    sequenceId: SEQUENCE,
    takeKey: take.takeKey,
    durationSeconds: take.durationSeconds,
    now: updatedAt,
  });
  return { ...base, sections: [{ ...base.sections[0]!, taps }] };
}

function draft(take: PostTake, updatedAt: number, taps: number[]) {
  return {
    ...createEmptyPostProject({ sequenceId: SEQUENCE, now: updatedAt }),
    takes: [take],
    timings: { [take.id]: timing(take, updatedAt, taps) },
  };
}

describe("Post Studio draft recovery", () => {
  it("takes a completed newer map over older project origin data", () => {
    const take = makeTake("cut", "stable-key");
    const old = draft(take, 100, [1]);
    const newestProject = draft(take, 300, [1]);
    const completed = timing(take, 400, [1, 2, 3]);
    const resolved = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(old),
      {
        key: `tka:post-studio:project:v2:previous:${SEQUENCE}`,
        value: JSON.stringify(newestProject),
      },
      { key: `${PREFIX}${take.takeKey}`, value: JSON.stringify(completed) },
    ]);
    expect(resolved?.updatedAt).toBe(300);
    expect(resolved?.timings?.[take.id]?.sections[0]?.taps).toEqual([1, 2, 3]);
  });

  it("rebinds a legacy reimport key only for the same prepared media", () => {
    const legacyTake = makeTake(
      "inshot-100-main-1",
      "inshot:inshot-100-main-1"
    );
    const currentTake = makeTake("inshot-500-main-1", "inshot:v2:hash:0:20");
    const old = draft(legacyTake, 100, [2, 4]);
    const current = draft(currentTake, 500, []);
    const resolved = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(current),
      { key: "old-project", value: JSON.stringify(old) },
    ]);
    expect(resolved?.timings?.[currentTake.id]?.takeKey).toBe(
      currentTake.takeKey
    );
    expect(resolved?.timings?.[currentTake.id]?.sections[0]?.taps).toEqual([
      2, 4,
    ]);
  });

  it("keeps each take's own map when two takes share one video", () => {
    const fast = makeTake("fast", "whole:fast", "/prepared/whole.mp4", 120);
    const slow = makeTake("slow", "whole:slow", "/prepared/whole.mp4", 120);
    const slowMap = timing(slow, 100, []);
    const post = {
      ...createEmptyPostProject({ sequenceId: SEQUENCE, now: 200 }),
      takes: [fast, slow],
      timings: {
        fast: timing(fast, 100, [10, 11, 12]),
        slow: {
          ...slowMap,
          sections: [{ ...slowMap.sections[0]!, beatOneSeconds: 80 }],
        },
      },
    };
    const resolved = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(post),
    ]);
    expect(resolved?.timings?.fast?.sections[0]?.taps).toEqual([10, 11, 12]);
    expect(resolved?.timings?.slow?.sections[0]).toMatchObject({
      taps: [],
      beatOneSeconds: 80,
    });
  });

  it("rejects maps for different media, clip duration, sequence, or key", () => {
    const oldTake = makeTake("old", "old-key");
    const selectedTake = makeTake("new", "new-key", "/prepared/other.mp4");
    const selected = draft(selectedTake, 500, []);
    const old = draft(oldTake, 100, [2]);
    const differentMedia = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(selected),
      { key: "old", value: JSON.stringify(old) },
    ]);
    expect(
      differentMedia?.timings?.[selectedTake.id]?.sections[0]?.taps
    ).toEqual([]);

    const sameUrlShorter = makeTake(
      "new",
      "new-key",
      oldTake.ref.kind === "linked" ? oldTake.ref.url : "",
      19
    );
    const duration = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(draft(sameUrlShorter, 500, [])),
      { key: "old", value: JSON.stringify(old) },
    ]);
    expect(duration?.timings?.[sameUrlShorter.id]?.sections[0]?.taps).toEqual(
      []
    );

    const wrongSequence = {
      ...timing(selectedTake, 600, [9]),
      sequenceId: "other",
    };
    const wrongKey = { ...timing(selectedTake, 600, [9]), takeKey: "wrong" };
    const invalid = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(selected),
      {
        key: `${PREFIX}${selectedTake.takeKey}`,
        value: JSON.stringify(wrongSequence),
      },
      {
        key: `${PREFIX}${selectedTake.takeKey}`,
        value: JSON.stringify(wrongKey),
      },
    ]);
    expect(invalid?.timings?.[selectedTake.id]?.sections[0]?.taps).toEqual([]);
  });

  it("round-trips a portable complete draft and rejects other sequences", () => {
    const take = makeTake("cut", "stable-key");
    const original = draft(take, 800, [2, 4]);
    const text = serializePostStudioBackup(original);
    expect(JSON.parse(text).format).toBe("post-studio-draft-v1");
    expect(parsePostStudioBackup(text, SEQUENCE)).toEqual(original);
    expect(parsePostStudioBackup(text, "another-sequence")).toBeNull();
    expect(parsePostStudioBackup("{", SEQUENCE)).toBeNull();
    expect(projectDraftRecord(original).key).toBe(
      `tka:post-studio:project:v2:${SEQUENCE}`
    );
  });

  it("keeps a deliberate clear on the same key, while an older different key cannot revive it", () => {
    const take = makeTake("cut", "stable-key");
    const mapped = draft(take, 100, [2, 4]);
    const cleared = draft(take, 300, []);
    const legacy = draft(makeTake("old-cut", "legacy-key"), 50, [2, 4]);
    const resolved = resolvePostStudioDraft(SEQUENCE, [
      projectDraftRecord(cleared),
      { key: "mapped", value: JSON.stringify(mapped) },
      { key: "legacy", value: JSON.stringify(legacy) },
    ]);
    expect(resolved?.timings?.[take.id]?.sections[0]?.taps).toEqual([]);
  });
});

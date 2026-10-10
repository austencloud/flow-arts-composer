import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClip, createProject, createTrack } from "$lib/shared/animation-engine/domain/timeline-types";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import { arrangementDurationSeconds } from "$lib/shared/media-composition/domain/post-arrangement-item";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";

const fake = vi.hoisted(() => ({
  uid: "account-a", hasDraft: false,
  saved: [] as { source: { id: string }; project: PostProject }[],
}));

vi.mock("$lib/features/post/services/studio-arrangement-projects", () => ({
  studioAccountId: () => fake.uid,
  assertStudioAccount: (uid: string) => { if (fake.uid !== uid) throw new Error("account changed"); },
  hasStudioDraft: async () => fake.hasDraft,
  persistStudioProject: async (source: { id: string }, project: PostProject) => {
    fake.saved.push({ source, project });
  },
}));

import {
  hasLegacyComposeTimeline, importLegacyComposeTimeline,
} from "$lib/features/post/services/legacy-compose-timeline-import";

const sequence = { id: "sequence-a", name: "Original", word: "a",
  steps: [{}, {}, {}, {}], thumbnails: [], isFavorite: false, isCircular: false,
  tags: [], metadata: {} } as never;

function setLegacy(): string {
  const project = createProject("Old timeline");
  project.id = "old-project";
  const front = createTrack("Front", 0, { solo: true });
  const back = createTrack("Back", 1, { muted: true });
  front.clips = [createClip(sequence, front.id, 3, {
    id: "clip-a", duration: 8, inPoint: 0.25, outPoint: 0.75,
    playbackRate: 2, loop: true, loopCount: 1, opacity: 0.4,
  })];
  back.clips = [createClip(sequence, back.id, 0, { id: "clip-b", duration: 4 })];
  project.tracks = [front, back];
  const raw = JSON.stringify(project);
  localStorage.setItem("timeline-current-project", raw);
  return raw;
}

beforeEach(() => {
  localStorage.clear(); fake.uid = "account-a"; fake.hasDraft = false; fake.saved = [];
});

describe("legacy Compose timeline import", () => {
  it("preserves separate clips, repeat timing, trim, speed and hidden tracks", async () => {
    const raw = setLegacy();
    expect(hasLegacyComposeTimeline()).toBe(true);
    const id = await importLegacyComposeTimeline();
    expect(id).toBe("studio-arrangement:legacy-compose-timeline:old-project");
    expect(localStorage.getItem("timeline-current-project")).toBe(raw);
    const imported = fake.saved[0]!;
    expect(imported.source.id).toBe(id);
    const back = imported.project.tracks[1]!;
    const front = imported.project.tracks[2]!;
    expect(back.hidden).toBe(true);
    expect(front.hidden).toBe(false);
    expect(front.items).toHaveLength(2);
    expect(front.items.map((item) => item.start)).toEqual([3, 7]);
    expect(front.items.map((item) => item.duration)).toEqual([4, 4]);
    expect(front.items[0]).toMatchObject({ kind: "arrangement", speed: 2, opacity: 0.4 });
    const first = front.items[0] as Extract<typeof front.items[number], { kind: "arrangement" }>;
    expect(first.sourceIn).toBeCloseTo(first.sourceOut / 3);
    expect(first.snapshot.cells[0]?.layers[0]?.sequence.id).toBe("sequence-a");
    expect(first.snapshot.skipStartPlacement).toBe(false);
    expect(arrangementDurationSeconds(first.snapshot)).toBeCloseTo(16);
    expect(first.sourceOut - first.sourceIn).toBeCloseTo(first.duration * first.speed);
    const normalized = normalizeProject(imported.project);
    const normalizedFirst = normalized.tracks[2]!.items[0]!;
    expect(normalizedFirst.duration).toBeCloseTo(4);
    expect(normalizedFirst.start).toBe(3);
  });

  it("reopens an existing Studio draft without importing again", async () => {
    setLegacy(); fake.hasDraft = true;
    expect(await importLegacyComposeTimeline()).toBe("studio-arrangement:legacy-compose-timeline:old-project");
    expect(fake.saved).toHaveLength(0);
  });

  it("rejects unsupported Stage tracks with the original untouched", async () => {
    const raw = setLegacy();
    const project = JSON.parse(raw);
    project.tracks[0].type = "camera";
    const edited = JSON.stringify(project);
    localStorage.setItem("timeline-current-project", edited);
    await expect(importLegacyComposeTimeline()).rejects.toThrow("Stage or camera");
    expect(localStorage.getItem("timeline-current-project")).toBe(edited);
    expect(fake.saved).toHaveLength(0);
  });

  it("does not offer an empty old timeline or drop unsupported trail settings", async () => {
    localStorage.setItem("timeline-current-project", JSON.stringify(createProject()));
    expect(hasLegacyComposeTimeline()).toBe(false);
    const raw = JSON.parse(setLegacy());
    raw.tracks[0].clips[0].trailSettings.mode = "comet";
    const edited = JSON.stringify(raw);
    localStorage.setItem("timeline-current-project", edited);
    await expect(importLegacyComposeTimeline()).rejects.toThrow("trail settings");
    expect(localStorage.getItem("timeline-current-project")).toBe(edited);
    expect(fake.saved).toHaveLength(0);
  });

  it("rejects repeats below Studio's minimum clip length instead of changing their timing", async () => {
    const project = JSON.parse(setLegacy());
    project.tracks[0].clips[0].duration = 0.1;
    localStorage.setItem("timeline-current-project", JSON.stringify(project));
    await expect(importLegacyComposeTimeline()).rejects.toThrow("repeats shorter");
    expect(fake.saved).toHaveLength(0);
  });
});

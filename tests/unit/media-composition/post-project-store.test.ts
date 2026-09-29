import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPostProject,
  openPostProject,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
import { savePostPlan } from "$lib/shared/media-composition/services/post-plan-store";
import { migratePostPlan } from "$lib/shared/media-composition/domain/post-project-migration";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { createDefaultPostPlan } from "$lib/shared/media-composition/domain/post-plan";
import { NOW, card, project, video } from "./post-project-fixtures";

const PREFIX = "tka:post-studio:project:v2:";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPostProject / savePostProject", () => {
  it("round-trips a saved project", () => {
    const saved = normalizeProject(
      project([video("v1", { sourceOut: 4 }), card("c1", 3)])
    );
    savePostProject(saved);
    expect(loadPostProject(saved.sequenceId)).toEqual(saved);
  });

  it("normalizes a project on load", () => {
    const raw = project([video("v1", { sourceOut: 4, start: 99 })]);
    savePostProject(raw); // not yet laid out end to end
    const loaded = loadPostProject(raw.sequenceId)!;
    expect(loaded.tracks[0]!.items[0]!.start).toBe(0);
  });

  it("returns null when nothing is saved for that sequence", () => {
    expect(loadPostProject("nothing-here")).toBeNull();
  });

  it("returns null for a corrupted entry", () => {
    localStorage.setItem(`${PREFIX}seq`, "{");
    expect(loadPostProject("seq")).toBeNull();
  });

  it("rejects a saved payload whose own sequenceId does not match the key", () => {
    const mismatched = createEmptyPostProject({
      sequenceId: "seq-a",
      now: NOW,
    });
    localStorage.setItem(`${PREFIX}seq-b`, JSON.stringify(mismatched));
    expect(loadPostProject("seq-b")).toBeNull();
  });

  it("reports a storage error without replacing the recoverable project", () => {
    const saved = createEmptyPostProject({ sequenceId: "seq", now: NOW });
    expect(savePostProject(saved)).toEqual({ ok: true });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
    expect(savePostProject({ ...saved, updatedAt: NOW + 1 })).toEqual({
      ok: false,
      error: "Quota exceeded",
    });
    setItem.mockRestore();
    expect(loadPostProject("seq")).toEqual(saved);
  });

  it("keeps the previous version and checks what storage actually returned", () => {
    const saved = createEmptyPostProject({ sequenceId: "seq", now: NOW });
    expect(savePostProject(saved).ok).toBe(true);
    expect(savePostProject({ ...saved, updatedAt: NOW + 1 }).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(`${PREFIX}previous:seq`)!)).toEqual(
      saved
    );
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => null);
    expect(savePostProject({ ...saved, updatedAt: NOW + 2 })).toMatchObject({
      ok: false,
    });
    getItem.mockRestore();
  });
});

describe("openPostProject", () => {
  it("returns the saved v2 project when one exists, ignoring the now given", () => {
    const saved = normalizeProject(project([card("c1", 5)]));
    savePostProject(saved);
    expect(openPostProject(saved.sequenceId, NOW + 1)).toEqual(saved);
  });

  it("migrates a saved v1 plan when no v2 project exists", () => {
    const plan = createDefaultPostPlan({ sequenceId: "seq-v1", now: NOW });
    savePostPlan(plan);
    const opened = openPostProject("seq-v1", NOW + 5);
    expect(opened).toEqual(migratePostPlan(plan, { now: NOW + 5 }));
  });

  it("creates an empty project when neither a v2 project nor a v1 plan exists", () => {
    const opened = openPostProject("fresh-seq", NOW);
    expect(opened).toEqual(
      createEmptyPostProject({ sequenceId: "fresh-seq", now: NOW })
    );
  });
});

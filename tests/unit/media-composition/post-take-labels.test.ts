import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  findItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import { takeDisplayLabel } from "$lib/shared/media-composition/domain/post-take-labels";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import {
  loadPostProject,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
import { project, take, video } from "./post-project-fixtures";

const sequence = {
  id: "seq",
  steps: [{ duration: 1 }],
} as unknown as SequenceData;

function savedMismatch(): PostProject {
  return project(
    [
      video("full", { label: "Full Speed" }),
      video("slow", { takeId: "b", label: "Half Speed" }),
    ],
    [],
    [
      { ...take("a"), label: "Full Speed" },
      { ...take("b", 48.557108), label: "camera-cut-2.mp4" },
      { ...take("unused", 24.8), label: "Half Speed" },
    ]
  );
}

function editor(initialProject?: PostProject) {
  let clock = 2_000;
  return createPostEditorState({
    getSequence: () => sequence,
    now: () => ++clock,
    initialProject,
  });
}

function clipLabel(current: PostProject, id: string): string | undefined {
  const item = findItem(current, id)?.item;
  return (
    item?.label ||
    (item?.kind === "video"
      ? current.takes.find((entry) => entry.id === item.takeId)?.label
      : undefined)
  );
}

beforeEach(() => localStorage.clear());

describe("video names from timeline clips", () => {
  it("opens an existing serialized mismatch by take ID without changing source identity or the unused take", () => {
    const legacy = JSON.parse(JSON.stringify(savedMismatch())) as PostProject;
    expect(savePostProject(legacy).ok).toBe(true);
    const state = editor();
    expect(state.takeDisplayLabel("a")).toBe("Full Speed");
    expect(state.takeDisplayLabel("b")).toBe("Half Speed");
    expect(state.takeDisplayLabel("unused")).toBe("Half Speed");
    expect(state.takes).toEqual(legacy.takes);
    expect(state.mediaUrl("b")).toBe("https://example.test/b.mp4");
    expect(loadPostProject(sequence.id)?.takes).toEqual(legacy.takes);
  });

  it("keeps sequential timeline and Videos renames consistent through undo, redo and reload", () => {
    const state = editor(savedMismatch());
    const sources = state.takes.map(
      ({ id, takeKey, ref, durationSeconds }) => ({
        id,
        takeKey,
        ref,
        durationSeconds,
      })
    );
    state.edit((current, ctx) =>
      updateItem(current, "slow", { label: "Slow Practice" }, ctx)
    );
    expect(state.takeDisplayLabel("b")).toBe("Slow Practice");
    state.renameTake("b", "Camera Two");
    expect(state.takeDisplayLabel("b")).toBe("Camera Two");
    expect(clipLabel(state.project, "slow")).toBe("Camera Two");
    expect(state.takes.find((entry) => entry.id === "b")?.label).toBe(
      "Camera Two"
    );
    state.undo();
    expect(state.takeDisplayLabel("b")).toBe("Slow Practice");
    expect(state.takes.find((entry) => entry.id === "b")?.label).toBe(
      "camera-cut-2.mp4"
    );
    state.undo();
    expect(state.takeDisplayLabel("b")).toBe("Half Speed");
    state.redo();
    state.redo();
    expect(editor().takeDisplayLabel("b")).toBe("Camera Two");

    state.edit((current, ctx) =>
      updateItem(current, "slow", { label: "Half Speed Again" }, ctx)
    );
    expect(editor().takeDisplayLabel("b")).toBe("Half Speed Again");
    state.renameTake("b", "camera-cut-2.mp4");
    expect(clipLabel(state.project, "slow")).toBe("camera-cut-2.mp4");
    expect(state.takeDisplayLabel("b")).toBe("camera-cut-2.mp4");
    expect(
      state.takes.map(({ id, takeKey, ref, durationSeconds }) => ({
        id,
        takeKey,
        ref,
        durationSeconds,
      }))
    ).toEqual(sources);
    expect(state.takeDisplayLabel("unused")).toBe("Half Speed");
  });

  it("allows a Videos rename back to the stored source name after a timeline rename", () => {
    const state = editor(savedMismatch());
    state.renameTake("b", "camera-cut-2.mp4");
    expect(state.takeDisplayLabel("b")).toBe("camera-cut-2.mp4");
    expect(clipLabel(state.project, "slow")).toBe("camera-cut-2.mp4");
    state.undo();
    expect(state.takeDisplayLabel("b")).toBe("Half Speed");
  });

  it("uses a shared name across tracks and renames matching clips in one undo step", () => {
    const initial = project(
      [video("first", { label: "Half Speed" })],
      [[video("second", { label: "Half Speed" })]],
      [take("a")]
    );
    const state = editor(initial);
    expect(state.takeDisplayLabel("a")).toBe("Half Speed");
    state.renameTake("a", "Shared Recording");
    expect(clipLabel(state.project, "first")).toBe("Shared Recording");
    expect(clipLabel(state.project, "second")).toBe("Shared Recording");
    state.undo();
    expect(state.takeDisplayLabel("a")).toBe("Half Speed");
    expect(clipLabel(state.project, "second")).toBe("Half Speed");
    state.redo();
    expect(editor().takeDisplayLabel("a")).toBe("Shared Recording");
  });

  it("preserves differently named cuts of the same recording and lets unnamed clips follow the source", () => {
    const state = editor(
      project(
        [
          video("full", { label: "Full Speed" }),
          video("slow", { label: "Half Speed" }),
          video("unnamed"),
        ],
        [],
        [take("a")]
      )
    );
    expect(state.takeDisplayLabel("a")).toBe("Take a");
    state.renameTake("a", "Recording");
    expect(state.takeDisplayLabel("a")).toBe("Recording");
    expect(clipLabel(state.project, "full")).toBe("Full Speed");
    expect(clipLabel(state.project, "slow")).toBe("Half Speed");
    expect(clipLabel(state.project, "unnamed")).toBe("Recording");
    expect(editor().takeDisplayLabel("a")).toBe("Recording");
  });

  it("falls back after a clip name is cleared and rejects empty or unknown take renames", () => {
    const state = editor(savedMismatch());
    state.edit((current, ctx) =>
      updateItem(current, "slow", { label: null }, ctx)
    );
    expect(state.takeDisplayLabel("b")).toBe("camera-cut-2.mp4");
    const before = state.project;
    state.renameTake("b", "  ");
    state.renameTake("missing", "Name");
    state.renameTake("b", "camera-cut-2.mp4");
    expect(state.project).toBe(before);
    expect(takeDisplayLabel(state.project, "missing")).toBe("");
    state.renameTake("unused", "  Unused take  ");
    expect(state.takeDisplayLabel("unused")).toBe("Unused take");
  });
});

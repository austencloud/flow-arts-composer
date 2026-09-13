import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function createState() {
  let state!: PanelCoordinationState;
  cleanup = effect_root(() => {
    state = createPanelCoordinationState();
  });
  return state;
}

function sequence(): SequenceData {
  return {
    id: "draft",
    name: "",
    word: "A",
    steps: [{ id: "one", stepNumber: 1 } as StepData],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  };
}

describe("workspace playback", () => {
  it("keeps Generate playback until its source tab or document changes", () => {
    const state = createState();
    state.startWorkspacePlayback(sequence(), 7, "generate");
    const session = state.workspacePlayback;
    state.syncWorkspacePlaybackSource("generate", 7);
    expect(state.workspacePlayback).toBe(session);

    // Matching revision numbers do not make two tabs the same document.
    state.syncWorkspacePlaybackSource("construct", 7);
    expect(state.workspacePlayback).toBeNull();

    state.startWorkspacePlayback(sequence(), 7, "generate");
    state.syncWorkspacePlaybackSource("generate", 8);
    expect(state.workspacePlayback).toBeNull();
  });

  it("holds a fixed document without mutating the draft", () => {
    const state = createState();
    const draft = sequence();
    state.startWorkspacePlayback(draft, 7);
    draft.steps.push({ id: "two", stepNumber: 2 } as StepData);
    expect(state.workspacePlayback?.sequence.steps).toHaveLength(1);
    expect(state.workspacePlaybackSourceRevision).toBe(7);
    state.stopWorkspacePlayback();
    expect(draft.steps).toHaveLength(2);
    expect(state.workspacePlayback).toBeNull();
  });

  it("restores an open step editor after Stop, and ignores repeated starts", () => {
    const state = createState();
    state.openStepEditorPanel();
    state.startWorkspacePlayback(sequence(), 1);
    const original = state.workspacePlayback;
    state.startWorkspacePlayback(sequence(), 2);
    expect(state.workspacePlayback).toBe(original);
    expect(state.isStepEditorPanelOpen).toBe(false);
    state.stopWorkspacePlayback();
    expect(state.isStepEditorPanelOpen).toBe(true);
  });

  it("hands off to another panel without restoring a competing editor", () => {
    const state = createState();
    state.openStepEditorPanel();
    state.startWorkspacePlayback(sequence(), 1);
    state.openSequenceViewer();
    state.stopWorkspacePlayback();
    expect(state.workspacePlayback).toBeNull();
    expect(state.isSequenceViewerOpen).toBe(true);
    expect(state.isStepEditorPanelOpen).toBe(false);
  });

  it("excludes held-option auditions and duration previews during playback", () => {
    const state = createState();
    state.enterDurationPreviewMode(sequence());
    state.startWorkspacePlayback(sequence(), 1);
    state.enterOptionAudition({
      sequence: sequence(),
      sourceSequenceRevision: 1,
      stepNumber: 1,
      activatedAt: 10,
    });
    expect(state.isDurationPreviewMode).toBe(false);
    expect(state.optionAudition).toBeNull();
    expect(state.workspacePlayback).not.toBeNull();
  });

  it("re-bases onto a revision the session did not cause, without replacing it", () => {
    const state = createState();
    state.startWorkspacePlayback(sequence(), 7, "construct");
    const session = state.workspacePlayback;

    state.rebaseWorkspacePlayback(7, 9);
    state.syncWorkspacePlaybackSource("construct", 9);

    expect(state.workspacePlayback).toBe(session);
    expect(state.workspacePlaybackSourceRevision).toBe(9);
  });

  it("ignores a re-base whose starting point is not the live baseline", () => {
    const state = createState();
    state.startWorkspacePlayback(sequence(), 7, "construct");

    state.rebaseWorkspacePlayback(6, 9);

    expect(state.workspacePlaybackSourceRevision).toBe(7);
    state.syncWorkspacePlaybackSource("construct", 9);
    expect(state.workspacePlayback).toBeNull();
    expect(state.workspacePlaybackSourceRevision).toBeNull();
  });

  it("ignores a re-base while nothing is playing", () => {
    const state = createState();
    state.rebaseWorkspacePlayback(1, 2);
    expect(state.workspacePlayback).toBeNull();
    expect(state.workspacePlaybackSourceRevision).toBeNull();
  });

  it("does not enter playback with only a starting position", () => {
    const state = createState();
    state.startWorkspacePlayback({ ...sequence(), steps: [] }, 0);
    expect(state.workspacePlayback).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createEmptyPostProject, type PostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
import { loadPostProject } from "#lib/shared/media-composition/services/post-project-store.js";

const { persistStudioProject, readProject } = vi.hoisted(() => ({
  persistStudioProject: vi.fn(),
  readProject: { current: null as PostProject | null },
}));
vi.mock("#lib/features/post/services/post-account-projects.js", () => ({
  currentPostAccount: async () => null,
  readAccountPostProjectPreview: vi.fn(),
}));
vi.mock("#lib/shared/media-composition/services/post-draft-storage.js", async (orig) => ({
  ...(await orig<object>()),
  loadPostDraft: async () => ({ project: readProject.current, error: null, diskAvailable: false }),
}));
vi.mock("#lib/features/post/services/studio-arrangement-projects.js", () => ({
  persistStudioProject,
  studioAccountId: () => null,
  assertStudioAccount: () => undefined,
}));

import { duplicateStudioProject } from "#lib/features/post/services/studio-project-library.js";
import { cachePostSequence } from "#lib/features/post/services/post-workspace-projects.js";

const sequence = {
  id: "source-1",
  name: "Original",
  displayName: "Original",
  steps: [{ letter: "A", duration: 1 }, { letter: "B", duration: 1 }],
} as unknown as SequenceData;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("copying a tutorial", () => {
  it("keeps the take's confirmed beat timing in the copy", async () => {
    const editor = createPostEditorState({
      getSequence: () => sequence,
      initialProject: createEmptyPostProject({ sequenceId: "source-1", now: Date.now() }),
    });
    const take = editor.addLocalVideo(new File(["v"], "take.mp4", { type: "video/mp4" }), 8);
    expect(take).toBeTruthy();
    const takeId = editor.project.takes[0]!.id;
    editor.editTiming(takeId, (timing) => ({
      ...timing,
      sections: timing.sections.map((section) => ({ ...section, beatOneSeconds: 1 })),
    }));
    editor.confirmTiming(takeId);
    expect(editor.timingStatus(takeId)).not.toBe("untapped");
    const saved = loadPostProject("source-1")!;
    expect(saved.timings?.[takeId]?.confirmedAt).toBeTruthy();
    editor.dispose();

    readProject.current = saved;
    cachePostSequence(sequence);
    persistStudioProject.mockClear();
    const copyId = await duplicateStudioProject("source-1", "Copy");
    const [source, copy] = persistStudioProject.mock.calls[0] as [SequenceData, PostProject];
    const reopened = createPostEditorState({ getSequence: () => source, initialProject: copy });
    expect(copy.sequenceId).toBe(copyId);
    expect(copy.timings?.[takeId]?.sequenceId).toBe(copyId);
    expect(saved.timings?.[takeId]?.sequenceId).toBe("source-1");
    expect(reopened.timingStatus(takeId)).not.toBe("untapped");
    expect(reopened.timingStatus(takeId)).toBe(
      createPostEditorState({ getSequence: () => sequence, initialProject: saved }).timingStatus(takeId)
    );
    reopened.dispose();
  });
});

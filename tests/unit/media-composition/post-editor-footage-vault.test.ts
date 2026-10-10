import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import type { PostTake } from "#lib/shared/media-composition/domain/post-plan.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
import { loadPostProject } from "#lib/shared/media-composition/services/post-project-store.js";
import type { PostFootageVault } from "#lib/shared/media-composition/services/local-footage-vault.js";

const identity = "studio-project:showcase:footage-vault-test";

function memoryVault() {
  const kept = new Map<string, File>();
  const vault: PostFootageVault = {
    keep: vi.fn(async (take: PostTake, file: File) => {
      kept.set(take.takeKey, file);
    }),
    open: vi.fn(async (take: PostTake) => kept.get(take.takeKey) ?? null),
  };
  return { vault, kept };
}

const open = (
  footage: PostFootageVault,
  initialProject?: ReturnType<typeof createEmptyPostProject>
) =>
  createPostEditorState({
    getSequence: () => null,
    initialProject:
      initialProject ??
      createEmptyPostProject({
        sequenceId: identity,
        sourceKind: "none",
        title: "Fire showcase",
        now: Date.now(),
      }),
    footage,
  });

let urls = 0;
beforeEach(() => {
  localStorage.clear();
  urls = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:footage-${++urls}`),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("device footage across a reload", () => {
  it("keeps a picked video and reopens the post with it attached", async () => {
    const { vault } = memoryVault();
    const editor = open(vault);
    const file = new File(["footage"], "fire.mp4", {
      type: "video/mp4",
      lastModified: 7,
    });
    editor.addLocalVideo(file, 8);
    const take = editor.project.takes[0]!;
    expect(vault.keep).toHaveBeenCalledWith(take, file);
    editor.dispose();

    const reopened = open(vault, loadPostProject(identity)!);
    expect(reopened.mediaUrl(take.id)).toBeNull();
    await vi.waitFor(() =>
      expect(reopened.mediaUrl(take.id)).toMatch(/^blob:/)
    );
    expect(vault.open).toHaveBeenCalledWith(take);
    reopened.dispose();
  });

  it("leaves the take waiting to be picked when this device kept no copy", async () => {
    const { vault, kept } = memoryVault();
    const editor = open(vault);
    editor.addLocalVideo(new File(["footage"], "fire.mp4"), 8);
    const take = editor.project.takes[0]!;
    editor.dispose();
    kept.clear();

    const reopened = open(vault, loadPostProject(identity)!);
    await vi.waitFor(() => expect(vault.open).toHaveBeenCalled());
    await Promise.resolve();
    expect(reopened.mediaUrl(take.id)).toBeNull();
    reopened.dispose();
  });

  it("keeps a re-picked video so the next reload needs no picking", () => {
    const { vault } = memoryVault();
    const editor = open(vault);
    const file = new File(["footage"], "fire.mp4", { lastModified: 7 });
    editor.addLocalVideo(file, 8);
    const take = editor.project.takes[0]!;
    vi.mocked(vault.keep).mockClear();

    expect(editor.relinkLocalTake(take.id, file)).toBe(true);
    expect(vault.keep).toHaveBeenCalledWith(take, file);
    editor.dispose();
  });
});

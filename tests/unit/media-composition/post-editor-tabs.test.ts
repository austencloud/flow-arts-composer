import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import {
  loadPostProject,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";

const PREFIX = "tka:post-studio:project:v2:";

function sequence(): SequenceData {
  return {
    id: "seq-tabs",
    displayName: "DCK",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

let clock = 1_000;
const createEditor = () =>
  createPostEditorState({ getSequence: sequence, now: () => (clock += 1) });

function chooseProp(
  editor: ReturnType<typeof createEditor>,
  propType: PropType
): void {
  editor.edit((project, context) => ({
    ...project,
    propType,
    updatedAt: context.now,
  }));
}

beforeEach(() => {
  localStorage.clear();
  clock = 1_000;
  vi.restoreAllMocks();
});

describe("two tabs on one post", () => {
  it("takes up the other tab's later save, and undo returns to its own copy", () => {
    const first = createEditor();
    const second = createEditor();
    chooseProp(first, PropType.STAFF);
    chooseProp(second, PropType.CLUB);
    chooseProp(first, PropType.BIGSTAFF);

    expect(second.adoptSaved(first.snapshot)).toBe(true);
    expect(second.project.propType).toBe(PropType.BIGSTAFF);
    second.undo();
    expect(second.project.propType).toBe(PropType.CLUB);
  });

  it("ignores its own save and anything older", () => {
    const first = createEditor();
    const second = createEditor();
    chooseProp(second, PropType.CLUB);
    const older = second.snapshot;
    chooseProp(first, PropType.STAFF);
    expect(first.adoptSaved(loadPostProject("seq-tabs")!)).toBe(false);
    expect(first.adoptSaved(older)).toBe(false);
    expect(first.project.propType).toBe(PropType.STAFF);
  });
});

describe("a full device storage", () => {
  it("still saves the post, letting older spare copies go", () => {
    const other = createEmptyPostProject({ sequenceId: "other", now: 1 });
    savePostProject(other);
    savePostProject({ ...other, updatedAt: 2 });
    expect(localStorage.getItem(`${PREFIX}previous:other`)).not.toBeNull();

    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      // Full until a spare copy makes room.
      if (key === `${PREFIX}post` && this.getItem(`${PREFIX}previous:other`))
        throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const post = createEmptyPostProject({ sequenceId: "post", now: 3 });
    expect(savePostProject(post)).toEqual({ ok: true });
    expect(loadPostProject("post")?.updatedAt).toBe(3);
    expect(loadPostProject("other")?.updatedAt).toBe(2);
    expect(localStorage.getItem(`${PREFIX}previous:other`)).toBeNull();
  });
});

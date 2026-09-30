import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createPostModuleState,
  type PostModuleServices,
} from "$lib/features/post/state/post-module-state.svelte";

afterEach(() => localStorage.clear());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const sequence = (id: string) =>
  ({ id, name: id, word: id, steps: [{}] }) as SequenceData;

describe("Post module state", () => {
  it("ignores an older project load after a newer selection", async () => {
    const first = deferred<SequenceData | null>();
    const second = deferred<SequenceData | null>();
    const loadDraft = vi.fn(async (id: string) => ({
      project: createEmptyPostProject({ sequenceId: id, now: 1 }),
      diskAvailable: true,
      error: null,
    }));
    const services: PostModuleServices = {
      list: vi.fn(async () => ({ projects: [], error: null })),
      resolve: vi.fn((id: string) =>
        id === "first" ? first.promise : second.promise
      ),
      loadDraft,
    };
    const state = createPostModuleState(services);
    const older = state.open("first");
    const newer = state.open("second");
    second.resolve(sequence("second"));
    await newer;
    first.resolve(sequence("first"));
    await older;
    expect(state.sequence?.id).toBe("second");
    expect(state.draft?.sequenceId).toBe("second");
    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("tka:post:selected:v1")).toBe("second");
  });

  it("keeps the loaded editor when returning to Projects and reopening it", async () => {
    const loaded = sequence("kept");
    const services: PostModuleServices = {
      list: vi.fn(async () => ({ projects: [], error: null })),
      resolve: vi.fn(async () => loaded),
      loadDraft: vi.fn(async () => ({
        project: null,
        diskAvailable: false,
        error: null,
      })),
    };
    const state = createPostModuleState(services);
    await state.open("kept");
    const before = state.sequence;
    state.showProjects();
    expect(state.sequence).toBe(before);
    await state.open("kept");
    expect(state.sequence).toBe(before);
    expect(services.loadDraft).toHaveBeenCalledTimes(1);
  });
});

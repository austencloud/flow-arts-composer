import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createFeatureVideoSync,
  type FeatureVideoSync,
} from "$lib/shared/media-composition/services/feature-video-client";
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
  it("discards the previous account's project list after an account switch", async () => {
    const previous = deferred<Awaited<ReturnType<PostModuleServices["list"]>>>();
    const next = deferred<Awaited<ReturnType<PostModuleServices["list"]>>>();
    const list = vi.fn()
      .mockImplementationOnce(() => previous.promise)
      .mockImplementationOnce(() => next.promise);
    const state = createPostModuleState({
      list,
      resolve: vi.fn(async () => null),
      loadDraft: vi.fn(async () => ({ project: null, diskAvailable: false, error: null })),
    });
    const pending = state.refreshProjects();
    state.resetForAccount();
    previous.resolve({
      projects: [{ sequenceId: "old", title: "Old", word: "OLD", updatedAt: 1, hasDraft: true }],
      error: "Previous account error",
    });
    await pending;
    expect(state.projects).toEqual([]);
    expect(state.catalogError).toBeNull();
    expect(state.loadingCatalog).toBe(true);
    next.resolve({
      projects: [{ sequenceId: "new", title: "New", word: "NEW", updatedAt: 2, hasDraft: true }],
      error: null,
    });
    await vi.waitFor(() => expect(state.loadingCatalog).toBe(false));
    expect(state.projects.map((project) => project.sequenceId)).toEqual(["new"]);
  });

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

const featureFile = (sequenceId = "seq"): FeatureVideoFile => ({
  format: FEATURE_VIDEO_FILE_FORMAT,
  slug: "promo",
  title: "Promo",
  revision: 1,
  savedAt: 1,
  project: createEmptyPostProject({ sequenceId, now: 1 }),
});

/** A dev server's services: no ordinary posts listed, one feature video. */
function devServices(
  overrides: Partial<PostModuleServices> = {}
): PostModuleServices {
  return {
    list: vi.fn(async () => ({ projects: [], error: null })),
    resolve: vi.fn(async (id: string) => sequence(id)),
    loadDraft: vi.fn(async (id: string) => ({
      project: createEmptyPostProject({ sequenceId: id, now: 1 }),
      diskAvailable: false,
      error: null,
    })),
    listFeatures: vi.fn(async () => ({ projects: [], unreadable: [] })),
    loadFeature: vi.fn(async () => createFeatureVideoSync(featureFile())),
    ...overrides,
  };
}

describe("Feature videos on the Post page", () => {
  it("lists feature videos on a dev server, and none without one", async () => {
    const summary = {
      slug: "promo",
      title: "Promo",
      revision: 3,
      savedAt: 5,
      sequenceId: "seq",
    };
    const state = createPostModuleState(
      devServices({
        listFeatures: vi.fn(async () => ({
          projects: [summary],
          unreadable: ["broken"],
        })),
      })
    );
    await state.refreshProjects();
    expect(state.features).toEqual([summary]);
    expect(state.unreadableFeatures).toEqual(["broken"]);
    expect(state.featureError).toBeNull();

    const failing = createPostModuleState(
      devServices({
        listFeatures: vi.fn(async () => {
          throw new Error("The dev server answered 500.");
        }),
      })
    );
    await failing.refreshProjects();
    expect(failing.features).toEqual([]);
    expect(failing.featureError).toBe("The dev server answered 500.");

    const production = createPostModuleState(
      devServices({ listFeatures: undefined, loadFeature: undefined })
    );
    await production.refreshProjects();
    expect(production.features).toEqual([]);
    expect(production.featureError).toBeNull();
    await production.openFeature("promo");
    expect(production.projectError).toBe(
      "Feature videos open only on a dev server."
    );
    expect(production.sequence).toBeNull();
  });

  it("opens a feature video without the ordinary post or the remembered post", async () => {
    localStorage.setItem("tka:post:selected:v1", "other");
    const sync = createFeatureVideoSync(featureFile());
    const services = devServices({ loadFeature: vi.fn(async () => sync) });
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    // The same object, not a deep proxy: the editor needs its getters live.
    expect(state.feature).toBe(sync);
    expect(state.sequence?.id).toBe("seq");
    expect(state.selectedId).toBe("feature:promo");
    expect(state.draft).toBeNull();
    expect(state.projectError).toBeNull();
    expect(services.loadFeature).toHaveBeenCalledWith("promo");
    expect(services.resolve).toHaveBeenCalledWith("seq");
    expect(services.loadDraft).not.toHaveBeenCalled();
    expect(localStorage.getItem("tka:post:selected:v1")).toBe("other");

    // The ordinary post for the same sequence opens apart from it.
    await state.open("seq");
    expect(state.feature).toBeNull();
    expect(state.draft?.sequenceId).toBe("seq");
    expect(localStorage.getItem("tka:post:selected:v1")).toBe("seq");
  });

  it("keeps an open feature video when returning to Projects, and drops it on an account switch", async () => {
    const services = devServices();
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    const before = state.feature;
    state.showProjects();
    expect(state.feature).toBe(before);
    await state.openFeature("promo");
    expect(state.feature).toBe(before);
    expect(state.showingProjects).toBe(false);
    expect(services.loadFeature).toHaveBeenCalledTimes(1);

    state.resetForAccount();
    expect(state.feature).toBeNull();
    expect(state.selectedId).toBeNull();
  });

  it("names a feature video's missing sequence, and Try again opens it", async () => {
    const services = devServices({
      resolve: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sequence("seq")),
    });
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    expect(state.projectError).toBe(
      "The sequence for this feature video (seq) could not be found."
    );
    expect(state.feature).toBeNull();
    expect(state.sequence).toBeNull();
    await state.retry();
    expect(state.projectError).toBeNull();
    expect(state.feature?.slug).toBe("promo");
    expect(services.loadFeature).toHaveBeenCalledTimes(2);
  });

  it("ignores a feature video that finishes loading after another choice", async () => {
    const pending = deferred<FeatureVideoSync>();
    const services = devServices({
      loadFeature: vi.fn(() => pending.promise),
    });
    const state = createPostModuleState(services);
    const older = state.openFeature("promo");
    await state.open("second");
    pending.resolve(createFeatureVideoSync(featureFile()));
    await older;
    expect(state.feature).toBeNull();
    expect(state.selectedId).toBe("second");
    expect(state.sequence?.id).toBe("second");
    expect(services.resolve).toHaveBeenCalledTimes(1);
  });
});

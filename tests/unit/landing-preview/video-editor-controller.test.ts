import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoCache } from "#lib/shared/video/services/video-cache.js";
import type { SequenceMatcher } from "#lib/features/landing-preview/services/sequence-matcher.js";
import type {
  VideoEditorController,
  VideoEditorControllerOptions,
} from "#lib/features/landing-preview/state/video-editor-controller.svelte.js";
import type {
  MatchedSequence,
  ShowcaseVideo,
  VideoCropData,
} from "#lib/features/landing-preview/types.js";
import VideoEditorControllerHarness from "./VideoEditorControllerHarness.svelte";

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn() },
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function makeVideo(
  shortcode: string,
  overrides: Partial<ShowcaseVideo> = {}
): ShowcaseVideo {
  return {
    shortcode,
    videoUrl: `https://video.test/${shortcode}.mp4`,
    instagramDate: null,
    fileSize: 1024,
    category: null,
    tags: [],
    featured: false,
    approved: false,
    linkedSequences: [],
    title: null,
    description: null,
    performers: [],
    excluded: false,
    ...overrides,
  };
}

function makeSequence(id: string, word: string): MatchedSequence {
  return {
    id,
    word,
    name: word,
    ownerId: "owner",
    ownerName: "Owner",
    thumbnail: null,
    isPublic: true,
  };
}

function createHarness(
  videos: ShowcaseVideo[],
  overrides: Partial<VideoEditorControllerOptions> = {}
) {
  let controller!: VideoEditorController;
  const updates: ShowcaseVideo[][] = [];
  const persister = {
    updateVideo: vi.fn(async () => undefined),
    saveCategories: vi.fn(async () => undefined),
    saveQuickPerformers: vi.fn(async () => undefined),
    toggleFeatured: vi.fn(async () => undefined),
  } as unknown as VideoEditorControllerOptions["persister"];
  const sequenceMatcher = {
    searchByWord: vi.fn(async () => []),
  } as unknown as SequenceMatcher;
  const videoCache = {
    getVideoUrl: vi.fn(async (url: string) => `cached:${url}`),
  } as unknown as VideoCache;
  const component = mount(VideoEditorControllerHarness, {
    target: document.body,
    props: {
      options: {
        videos,
        categories: [
          { id: "demonstration", label: "Demonstration", color: "#fff" },
          { id: "tutorial", label: "Tutorial", color: "#000" },
        ],
        quickPerformers: [{ id: "performer", displayName: "Performer" }],
        persister,
        sequenceMatcher,
        videoCache,
        onVideosUpdate: (nextVideos) => updates.push(nextVideos),
        ...overrides,
      },
      onReady: (value) => {
        controller = value;
      },
    },
  });
  cleanups.push(async () => {
    await unmount(component);
  });

  return { controller, persister, sequenceMatcher, videoCache, updates };
}

describe("video editor controller", () => {
  it("derives each work queue and opens the requested video mode", () => {
    const uncurated = makeVideo("uncurated", { title: "ALPHA" });
    const finished = makeVideo("finished", {
      title: "BRAVO",
      category: "tutorial",
      performers: [{ id: "performer", displayName: "Performer" }],
      linkedSequences: [
        { id: "seq", word: "B", ownerName: "Owner", thumbnail: null },
      ],
    });
    const unnamed = makeVideo("unnamed_code", {
      category: "tutorial",
      performers: [{ id: "performer", displayName: "Performer" }],
      title: "unnamed_code",
    });
    const { controller } = createHarness([uncurated, finished, unnamed]);

    expect(controller.uncuratedVideos.map((video) => video.shortcode)).toEqual([
      "uncurated",
    ]);
    expect(controller.unlinkableVideos.map((video) => video.shortcode)).toEqual(
      ["uncurated", "unnamed_code"]
    );
    expect(controller.unnamedVideos.map((video) => video.shortcode)).toEqual([
      "unnamed_code",
    ]);

    controller.openCurate();
    expect(controller.mode).toBe("curate");
    expect(controller.currentVideo?.shortcode).toBe("uncurated");
    controller.openBrowse(finished);
    expect(controller.currentVideo?.shortcode).toBe("finished");
    controller.close();
    expect(controller.currentVideo).toBeNull();
  });

  it("persists category and performer edits into the local video collection", async () => {
    const video = makeVideo("metadata", { title: "META" });
    const { controller, persister, updates } = createHarness([video]);
    controller.openBrowse(video);

    await controller.setCategory("tutorial");
    await controller.togglePerformer({
      id: "performer",
      displayName: "Performer",
    });

    expect(persister.updateVideo).toHaveBeenNthCalledWith(1, "metadata", {
      category: "tutorial",
    });
    expect(persister.updateVideo).toHaveBeenNthCalledWith(2, "metadata", {
      performers: [{ id: "performer", displayName: "Performer" }],
    });
    expect(controller.currentVideo?.category).toBe("tutorial");
    expect(controller.currentVideo?.performers).toHaveLength(1);
    expect(updates).toHaveLength(2);
  });

  it("replaces the existing link for a demonstration video", async () => {
    const video = makeVideo("demo", {
      title: "DEMO",
      category: "demonstration",
      linkedSequences: [
        { id: "old", word: "OLD", ownerName: "Owner", thumbnail: null },
      ],
    });
    const replacement = makeSequence("new", "NEW");
    const { controller, persister } = createHarness([video]);
    controller.openBrowse(video);

    await controller.linkSequence(replacement);

    expect(controller.maxLinks).toBe(1);
    expect(persister.updateVideo).toHaveBeenCalledWith("demo", {
      linkedSequences: [
        {
          id: "new",
          word: "NEW",
          thumbnail: null,
          ownerName: "Owner",
        },
      ],
    });
    expect(
      controller.currentVideo?.linkedSequences.map((link) => link.id)
    ).toEqual(["new"]);
  });

  it("persists crop edits and closes crop mode after a successful save", async () => {
    const video = makeVideo("crop");
    const crop: VideoCropData = {
      position: { x: 0.1, y: -0.2 },
      scale: 1.5,
      aspect: 1,
      aspectLabel: "1:1",
    };
    const { controller, persister } = createHarness([video]);
    controller.openBrowse(video);
    controller.openCropMode();

    await controller.applyCrop(crop);

    expect(persister.updateVideo).toHaveBeenCalledWith("crop", { crop });
    expect(controller.currentVideo?.crop).toEqual(crop);
    expect(controller.cropModeActive).toBe(false);
  });

  it("ignores a stale cache response after the selected video changes", async () => {
    let resolveFirst!: (url: string) => void;
    let resolveSecond!: (url: string) => void;
    const first = makeVideo("first");
    const second = makeVideo("second");
    const getVideoUrl = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveFirst = resolve))
      )
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveSecond = resolve))
      );
    const { controller } = createHarness([first, second], {
      videoCache: { getVideoUrl } as unknown as VideoCache,
    });

    controller.openBrowse(first);
    await vi.waitFor(() => expect(getVideoUrl).toHaveBeenCalledTimes(1));
    controller.openBrowse(second);
    await vi.waitFor(() => expect(getVideoUrl).toHaveBeenCalledTimes(2));
    resolveSecond("cached:second");
    await vi.waitFor(() => expect(controller.videoUrl).toBe("cached:second"));
    resolveFirst("cached:first");
    await Promise.resolve();

    expect(controller.videoUrl).toBe("cached:second");
  });

  it("searches the newly selected video while navigating link mode", async () => {
    const first = makeVideo("first-link", { title: "ALPHA" });
    const second = makeVideo("second-link", { title: "BRAVO" });
    const searchByWord = vi.fn(async (query: string) => [
      makeSequence(query.toLowerCase(), query),
    ]);
    const { controller } = createHarness([first, second], {
      sequenceMatcher: { searchByWord } as unknown as SequenceMatcher,
    });

    controller.openLink();
    await vi.waitFor(() => expect(searchByWord).toHaveBeenCalledWith("ALPHA"));
    await vi.waitFor(() =>
      expect(controller.selectedSequenceForLink?.word).toBe("ALPHA")
    );

    controller.goNext();
    await vi.waitFor(() => expect(searchByWord).toHaveBeenCalledWith("BRAVO"));
    expect(controller.currentVideo?.shortcode).toBe("second-link");
    await vi.waitFor(() =>
      expect(controller.selectedSequenceForLink?.word).toBe("BRAVO")
    );
  });

  it("routes category number shortcuts through the metadata owner", async () => {
    const video = makeVideo("keyboard", { title: "KEYS" });
    const { controller, persister } = createHarness([video]);
    controller.openBrowse(video);
    const event = new KeyboardEvent("keydown", {
      key: "2",
      cancelable: true,
    });

    controller.handleKeydown(event);

    await vi.waitFor(() =>
      expect(persister.updateVideo).toHaveBeenCalledWith("keyboard", {
        category: "tutorial",
      })
    );
    expect(event.defaultPrevented).toBe(true);
  });
});

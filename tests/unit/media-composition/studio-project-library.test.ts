import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createEmptyPostProject,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";

const {
  persistStudioProject,
  loadPostProject,
  resolvePostSequence,
  cachedPostSequence,
  loadFeatureVideo,
} = vi.hoisted(() => ({
  persistStudioProject: vi.fn(),
  loadPostProject: vi.fn(),
  resolvePostSequence: vi.fn(),
  cachedPostSequence: vi.fn(),
  loadFeatureVideo: vi.fn(),
}));
vi.mock("#lib/features/post/services/post-account-projects.js", () => ({
  currentPostAccount: async () => null,
  readAccountPostProjectPreview: vi.fn(),
}));
vi.mock("#lib/shared/media-composition/services/post-project-store.js", () => ({
  loadPostProject,
}));
vi.mock("#lib/shared/media-composition/services/post-draft-storage.js", () => ({
  loadPostDraft: async () => ({
    project: null,
    error: null,
    diskAvailable: false,
  }),
}));
vi.mock("#lib/features/post/services/post-workspace-projects.js", () => ({
  resolvePostSequence,
  cachedPostSequence,
}));
vi.mock(
  "#lib/shared/media-composition/services/feature-video-client.js",
  () => ({
    loadFeatureVideo,
  })
);
vi.mock("#lib/features/post/services/studio-arrangement-projects.js", () => ({
  persistStudioProject,
  studioAccountId: () => null,
  assertStudioAccount: () => undefined,
}));

import {
  createStudioTutorial,
  createSoftwareProject,
  describeStudioProject,
  duplicateStudioProject,
  loadStudioProjectPreview,
} from "#lib/features/post/services/studio-project-library.js";

const sequence = {
  id: "source-1",
  name: "Original",
  displayName: "Original",
  steps: [{ letter: "A" }],
} as unknown as SequenceData;

describe("Studio project library", () => {
  it("creates an independent tutorial with editable sequence animation", async () => {
    persistStudioProject.mockClear();
    const id = await createStudioTutorial(sequence, "Three poi basics");
    const [source, project] = persistStudioProject.mock.calls[0] as [
      SequenceData,
      PostProject,
    ];
    expect(id).toMatch(/^studio-project:tutorial:/);
    expect(source).toMatchObject({
      id,
      name: "Three poi basics",
      displayName: "Three poi basics",
    });
    expect(project.sequenceId).toBe(id);
    expect(project.tracks[0]?.items[0]).toMatchObject({
      kind: "card",
      duration: 6,
    });
    expect(project.tracks[1]?.items[0]).toMatchObject({
      kind: "animation",
      duration: 6,
    });
    expect(normalizeProject(project).tracks[0]?.items[0]?.kind).toBe("card");
    expect(normalizeProject(project).tracks[1]?.items[0]?.kind).toBe(
      "animation"
    );
    expect(sequence.id).toBe("source-1");
  });

  it("creates a tutorial from a picker's reactive sequence", async () => {
    persistStudioProject.mockClear();
    // Pickers hand over Svelte state proxies, which structuredClone rejects.
    const reactive = new Proxy(
      { ...sequence, steps: new Proxy([{ letter: "A" }], {}) },
      {}
    ) as SequenceData;
    const id = await createStudioTutorial(reactive);
    const [source] = persistStudioProject.mock.calls[0] as [SequenceData];
    expect(source).toMatchObject({ id, steps: [{ letter: "A" }] });
    expect(() => structuredClone(source)).not.toThrow();
  });

  it("creates a named source-free showcase without inventing a sequence", async () => {
    persistStudioProject.mockClear();
    const id = await createSoftwareProject("  Software tour  ");
    const [source, project] = persistStudioProject.mock.calls[0] as [
      SequenceData | null,
      PostProject,
    ];
    expect(id).toMatch(/^studio-project:showcase:/);
    expect(source).toBeNull();
    expect(project).toMatchObject({
      sequenceId: id,
      sourceKind: "none",
      title: "Software tour",
    });
    expect(project.tracks[0]?.items).toEqual([]);
  });

  it("requires real steps when a source is supplied for a software showcase", async () => {
    persistStudioProject.mockClear();
    await expect(
      createSoftwareProject("Showcase", { ...sequence, steps: [] })
    ).rejects.toThrow("sequence with steps");
    expect(persistStudioProject).not.toHaveBeenCalled();
    const id = await createSoftwareProject("Showcase", sequence);
    const [, project] = persistStudioProject.mock.calls[0] as [
      SequenceData,
      PostProject,
    ];
    expect(id).toMatch(/^studio-project:showcase:/);
    expect(project.tracks[0]?.items).toEqual([]);
  });

  it("duplicates a source-free showcase with its media and a separate identity", async () => {
    persistStudioProject.mockClear();
    resolvePostSequence.mockClear();
    const original = createEmptyPostProject({
      sequenceId: "studio-project:showcase:original",
      now: 1,
      sourceKind: "none",
      title: "Demo",
    });
    original.images = [
      {
        id: "hero",
        label: "Hero",
        ref: { kind: "linked", url: "https://example.test/hero.png" },
      },
    ];
    loadPostProject.mockReturnValue(original);
    const id = await duplicateStudioProject(original.sequenceId);
    const [source, duplicate] = persistStudioProject.mock.calls[0] as [
      SequenceData | null,
      PostProject,
    ];
    expect(source).toBeNull();
    expect(id).not.toBe(original.sequenceId);
    expect(duplicate).toMatchObject({
      sequenceId: id,
      sourceKind: "none",
      title: "Demo (copy)",
      images: original.images,
    });
    expect(duplicate.images).not.toBe(original.images);
    expect(resolvePostSequence).not.toHaveBeenCalled();
  });

  it("copies arrangements under a new arrangement identity without changing the original", async () => {
    persistStudioProject.mockClear();
    const original = createEmptyPostProject({
      sequenceId: "studio-arrangement:old",
      now: 1,
    });
    original.canvas = "1:1";
    original.takes = [
      {
        id: "take",
        label: "Device clip",
        takeKey: "take",
        durationSeconds: 3,
        ref: { kind: "local", name: "device.mp4", size: 400, lastModified: 10 },
      },
    ];
    loadPostProject.mockReturnValue(original);
    resolvePostSequence.mockResolvedValue({
      ...sequence,
      id: original.sequenceId,
    });
    const id = await duplicateStudioProject(
      original.sequenceId,
      "New arrangement"
    );
    const [source, project] = persistStudioProject.mock.calls[0] as [
      SequenceData,
      PostProject,
    ];
    expect(id).toMatch(/^studio-arrangement:/);
    expect(source.displayName).toBe("New arrangement");
    expect(project.sequenceId).toBe(id);
    expect(project.canvas).toBe("1:1");
    expect(project.takes).toEqual(original.takes);
    expect(project.takes).not.toBe(original.takes);
    expect(original.sequenceId).toBe("studio-arrangement:old");
  });

  it("reports visible content and only linked covers", () => {
    const project = createEmptyPostProject({
      sequenceId: "studio-project:tutorial:one",
      now: 1,
    });
    project.canvas = "16:9";
    project.takes = [
      {
        id: "take",
        label: "Camera",
        takeKey: "take",
        durationSeconds: 9,
        ref: { kind: "local", name: "clip.mp4", size: 12, lastModified: 1 },
      },
    ];
    project.images = [
      {
        id: "poster",
        label: "Cover",
        ref: { kind: "linked", url: "https://example.test/poster.webp" },
      },
    ];
    project.tracks[0]!.items = [
      {
        id: "video",
        kind: "video",
        start: 0,
        duration: 5,
        takeId: "take",
        sourceIn: 0,
        sourceOut: 5,
        speed: 1,
        fit: "cover",
        zoom: 1,
        panX: 0,
        panY: 0,
        rotation: 0,
        flip: false,
        volume: 1,
        box: { x: 0, y: 0, width: 1, height: 1 },
        opacity: 1,
        fadeIn: 0,
        fadeOut: 0,
        anchor: null,
        fill: false,
      },
      {
        id: "image",
        kind: "image",
        start: 5,
        duration: 3,
        imageId: "poster",
        box: { x: 0, y: 0, width: 1, height: 1 },
        opacity: 1,
        fadeIn: 0,
        fadeOut: 0,
        anchor: null,
        fill: false,
      },
    ];
    const preview = describeStudioProject(project, sequence);
    expect(preview).toMatchObject({
      width: 16,
      height: 9,
      duration: 8,
      itemCount: 2,
      kinds: ["video", "image"],
      kind: "tutorial",
      cover: { kind: "image", url: "https://example.test/poster.webp" },
    });
    expect(describeStudioProject(project, null).cover).toEqual({
      kind: "image",
      url: "https://example.test/poster.webp",
    });
  });

  it("loads a linked cover without waiting for its missing source", async () => {
    cachedPostSequence.mockReturnValue(null);
    const project = createEmptyPostProject({
      sequenceId: "studio-project:showcase:linked",
      now: 1,
    });
    project.images = [
      {
        id: "cover",
        label: "Cover",
        ref: { kind: "linked", url: "https://example.test/cover.webp" },
      },
    ];
    project.tracks[0]!.items = [
      {
        id: "poster",
        kind: "image",
        start: 0,
        duration: 3,
        imageId: "cover",
        box: { x: 0, y: 0, width: 1, height: 1 },
        opacity: 1,
        fadeIn: 0,
        fadeOut: 0,
        anchor: null,
        fill: false,
      },
    ];
    loadPostProject.mockReturnValue(project);
    resolvePostSequence.mockClear();
    resolvePostSequence.mockImplementation(() => new Promise(() => {}));
    const preview = await loadStudioProjectPreview({
      sequenceId: project.sequenceId,
    });
    expect(preview?.cover).toEqual({
      kind: "image",
      url: "https://example.test/cover.webp",
    });
    expect(preview?.sequence).toBeNull();
    expect(resolvePostSequence).not.toHaveBeenCalled();
  });

  it("keeps an ordinary preview local when no source snapshot is saved", async () => {
    const project = createEmptyPostProject({
      sequenceId: "ordinary-id",
      now: 1,
    });
    loadPostProject.mockReturnValue(project);
    cachedPostSequence.mockReturnValue(null);
    resolvePostSequence.mockClear();
    const preview = await loadStudioProjectPreview({
      sequenceId: project.sequenceId,
    });
    expect(preview?.sequence).toBeNull();
    expect(preview?.cover).toBeNull();
    expect(resolvePostSequence).not.toHaveBeenCalled();
  });

  it("keeps a feature preview local when no source snapshot is saved", async () => {
    const project = createEmptyPostProject({
      sequenceId: "feature-source",
      now: 1,
    });
    loadFeatureVideo.mockResolvedValue({ project, title: "Software tour" });
    cachedPostSequence.mockReturnValue(null);
    resolvePostSequence.mockClear();
    const preview = await loadStudioProjectPreview({
      featureSlug: "software-tour",
    });
    expect(preview).toMatchObject({ title: "Software tour", sequence: null });
    expect(resolvePostSequence).not.toHaveBeenCalled();
  });
});

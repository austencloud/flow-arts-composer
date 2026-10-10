import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { createDefaultPostPlan } from "#lib/shared/media-composition/domain/post-plan.js";
import {
  lastSelectedPostSequenceId,
  listPostProjects,
  rememberPostSequence,
  resolvePostSequence,
} from "#lib/features/post/services/post-workspace-projects.js";
import { studioLibraryEntries } from "#lib/features/post/components/studio-library-entry.js";

const { loadByIdentifier } = vi.hoisted(() => ({ loadByIdentifier: vi.fn() }));
vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-data-provider.js",
  () => ({
    loadByIdentifier,
  })
);

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  loadByIdentifier.mockReset();
  vi.unstubAllGlobals();
});

const sequence = (id: string, word: string) => ({
  id,
  name: `Name ${id}`,
  word,
  steps: [{ letter: "A" }],
  thumbnails: [],
});

describe("Post project selection", () => {
  it("lists a source-free project by its saved title without a recent sequence", async () => {
    const id = "studio-project:showcase:blank";
    const project = createEmptyPostProject({
      sequenceId: id,
      now: 100,
      sourceKind: "none",
      title: "Software tour",
    });
    localStorage.setItem(
      `tka:post-studio:project:v2:${id}`,
      JSON.stringify(project)
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ records: [] }) })
    );
    const result = await listPostProjects();
    expect(result.projects).toEqual([
      expect.objectContaining({
        sequenceId: id,
        title: "Software tour",
        hasDraft: true,
      }),
    ]);
  });
  it("simplifies displayed words without changing saved sequence or project data", async () => {
    const id = "Δ-ΛRZ";
    const word = id.repeat(4);
    const original = { ...sequence(id, word), name: word, displayName: word };
    const project = createEmptyPostProject({ sequenceId: id, now: 100 });
    const projectKey = `tka:post-studio:project:v2:${id}`;
    localStorage.setItem(projectKey, JSON.stringify(project));
    rememberPostSequence(original as never);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: [] }),
      })
    );

    const { projects } = await listPostProjects();
    expect(projects).toEqual([
      expect.objectContaining({
        sequenceId: id,
        title: id,
        word: id,
        hasDraft: true,
      }),
    ]);
    expect(await resolvePostSequence(id)).toEqual(original);
    expect(localStorage.getItem(projectKey)).toBe(JSON.stringify(project));
    expect(
      JSON.parse(localStorage.getItem(`tka:post:sequence:v1:${id}`)!).word
    ).toBe(word);
  });

  it("uses the exact sequence ID and preserves the existing draft", async () => {
    const project = createEmptyPostProject({ sequenceId: "Δ-ΛRZ", now: 100 });
    const key = "tka:post-studio:project:v2:Δ-ΛRZ";
    localStorage.setItem(key, JSON.stringify(project));
    rememberPostSequence(sequence("Δ-ΛRZ", "SAME") as never);
    expect(lastSelectedPostSequenceId()).toBe("Δ-ΛRZ");
    expect((await resolvePostSequence("Δ-ΛRZ"))?.id).toBe("Δ-ΛRZ");
    expect(localStorage.getItem(key)).toBe(JSON.stringify(project));
    loadByIdentifier.mockResolvedValue(sequence("other-id", "SAME"));
    expect(await resolvePostSequence("missing-id")).toBeNull();
    expect(loadByIdentifier).toHaveBeenCalledWith("missing-id", {
      wordFallback: false,
    });
  });

  it("keeps missing independent Studio sources out of the public gallery", async () => {
    const id = "studio-project:tutorial:archived";
    expect(await resolvePostSequence(id)).toBeNull();
    expect(loadByIdentifier).not.toHaveBeenCalled();

    rememberPostSequence(sequence(id, "A") as never);
    expect((await resolvePostSequence(id))?.id).toBe(id);
    expect(loadByIdentifier).not.toHaveBeenCalled();
  });

  it("labels archived Studio drafts when only their machine ID remains", () => {
    const id = "studio-project:tutorial:archived";
    const choice = {
      sequenceId: id,
      title: id,
      word: "",
      updatedAt: 1,
      hasDraft: true,
    };
    expect(studioLibraryEntries([choice], [])[0]?.title).toBe("Saved tutorial");
    expect(
      studioLibraryEntries([{ ...choice, title: "My tutorial" }], [])[0]?.title
    ).toBe("My tutorial");
  });

  it("discovers browser, disk, and legacy plans without making copies", async () => {
    const browser = createEmptyPostProject({ sequenceId: "Δ-ΛRZ", now: 100 });
    const disk = createEmptyPostProject({ sequenceId: "ΩΛ-XJ", now: 200 });
    const legacy = createDefaultPostPlan({ sequenceId: "legacy-id", now: 75 });
    localStorage.setItem(
      "tka:post-studio:project:v2:Δ-ΛRZ",
      JSON.stringify(browser)
    );
    localStorage.setItem(
      "tka:post-studio:plan:v1:legacy-id",
      JSON.stringify(legacy)
    );
    localStorage.setItem(
      "tka:post-studio:project:v2:previous:ΩΛ-XJ",
      JSON.stringify(disk)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              key: "tka:post-studio:project:v2:ΩΛ-XJ",
              value: JSON.stringify(disk),
            },
          ],
        }),
      })
    );
    loadByIdentifier.mockResolvedValue(null);
    const result = await listPostProjects();
    expect(result.projects.map((project) => project.sequenceId).sort()).toEqual(
      ["legacy-id", "Δ-ΛRZ", "ΩΛ-XJ"].sort()
    );
    expect(
      result.projects.find((project) => project.sequenceId === "ΩΛ-XJ")
        ?.updatedAt
    ).toBe(200);
    expect(localStorage.getItem("tka:post-studio:project:v2:Δ-ΛRZ")).toBe(
      JSON.stringify(browser)
    );
  });

  it("shows browser projects when the disk archive fails", async () => {
    const project = createEmptyPostProject({ sequenceId: "local-id", now: 99 });
    localStorage.setItem(
      "tka:post-studio:project:v2:local-id",
      JSON.stringify(project)
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    loadByIdentifier.mockResolvedValue(null);
    const result = await listPostProjects();
    expect(result.projects).toHaveLength(1);
    expect(result.error).toContain("Computer backups could not be read");
  });

  it("finishes catalog loading when the archive response body hangs", async () => {
    vi.useFakeTimers();
    const project = createEmptyPostProject({ sequenceId: "local-id", now: 99 });
    localStorage.setItem(
      "tka:post-studio:project:v2:local-id",
      JSON.stringify(project)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => new Promise(() => undefined),
      })
    );
    const listing = listPostProjects();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await listing;
    expect(result.projects.map((choice) => choice.sequenceId)).toEqual([
      "local-id",
    ]);
    expect(result.error).toContain("Computer backups could not be read");
  });
});

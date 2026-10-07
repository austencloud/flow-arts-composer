import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { featureVideos } from "$lib/server/feature-video-store";
import {
  activeFeatureVideoSession,
  heartbeatPostProject,
  listPostProjectSessions,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import { devicePostEditorStore } from "$lib/shared/media-composition/services/post-editor-store";
import { startPostProjectDevBridge } from "$lib/shared/media-composition/services/post-project-dev-client";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { POST as postProjectRoute } from "../../../src/routes/api/dev/post-project/+server";
import { routeEvent, tempFeatureRoot } from "./feature-video-test-helpers";
import { NOW, project, take } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const FEATURE_URL = featureVideoMediaUrl("promo", "footage/a.mp4");
const empty = () => project([], [], []);
const withFeatureTake = () =>
  applyPostProjectOps(
    empty(),
    [{ op: "add-take", url: FEATURE_URL, durationSeconds: 4, append: true }],
    ctx
  );

describe("the bridge guard", () => {
  it("lets the bridge add and remove a feature video's own takes", () => {
    const added = withFeatureTake();
    expect(bridgeLockedChange(empty(), added)).toBeNull();
    const removed = applyPostProjectOps(
      added,
      [{ op: "remove-take", take: "take-1" }],
      ctx
    );
    expect(bridgeLockedChange(added, removed)).toBeNull();
  });

  it("still locks every other take and the timings", () => {
    expect(
      bridgeLockedChange(empty(), { ...empty(), takes: [take("x")] })
    ).toBe("takes");
    const timed = {
      ...empty(),
      timings: {
        x: createTakeTiming({
          sequenceId: "seq",
          takeKey: "key-x",
          durationSeconds: 20,
          now: NOW,
        }),
      },
    };
    expect(bridgeLockedChange(empty(), timed)).toBe("timings");
  });
});

describe("feature video editor sessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("remember the project they hold", () => {
    const id = randomUUID();
    heartbeatPostProject({
      sessionId: id,
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-a",
    });
    expect(activeFeatureVideoSession("held-a")).toBe(id);
    expect(activeFeatureVideoSession("held-nowhere")).toBeNull();
    expect(
      listPostProjectSessions().find((session) => session.id === id)
        ?.featureSlug
    ).toBe("held-a");
    expect(readPostProjectSession(id)?.featureSlug).toBe("held-a");
  });

  it("cannot change project or name a bad one", () => {
    const id = randomUUID();
    heartbeatPostProject({
      sessionId: id,
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-b",
    });
    expect(() =>
      heartbeatPostProject({
        sessionId: id,
        revision: 1,
        featureSlug: "held-c",
      })
    ).toThrow("The editor session changed project.");
    expect(() => heartbeatPostProject({ sessionId: id, revision: 1 })).toThrow(
      "The editor session changed project."
    );
    expect(() =>
      heartbeatPostProject({
        sessionId: randomUUID(),
        revision: 0,
        snapshot: empty(),
        featureSlug: "Bad Name",
      })
    ).toThrow("Invalid editor session.");
  });

  it("let go of the project once the editor goes quiet", () => {
    heartbeatPostProject({
      sessionId: randomUUID(),
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-d",
    });
    const later = Date.now() + 11_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    expect(activeFeatureVideoSession("held-d")).toBeNull();
  });
});

describe("the editor heartbeat", () => {
  let root: string;
  let savedRoot: string | undefined;

  beforeEach(async () => {
    savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
    root = await tempFeatureRoot();
    process.env.TKA_FEATURE_VIDEO_ROOT = root;
  });

  afterEach(async () => {
    if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
    else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
    await fs.rm(root, { recursive: true, force: true });
  });

  const heartbeat = (body: Record<string, unknown>) =>
    postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId: randomUUID(),
          revision: 0,
          ...body,
        }),
      }) as never
    );

  it("answers a feature video editor with the revision on disk", async () => {
    const { file } = await featureVideos().create({
      slug: "beat",
      title: "Beat",
      sequenceId: "seq",
    });
    const response = await heartbeat({
      snapshot: file.project,
      featureSlug: "beat",
    });
    expect(await response.json()).toMatchObject({
      command: null,
      featureRevision: 1,
    });
  });

  it("answers an ordinary editor as before", async () => {
    const response = await heartbeat({ snapshot: empty() });
    expect(await response.json()).not.toHaveProperty("featureRevision");
  });
});

describe("the editor's bridge client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the feature video's name and reports its revision on disk", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({
          command: null,
          fingerprint: "f",
          featureRevision: 7,
        });
      })
    );
    const revisions: number[] = [];
    const stop = startPostProjectDevBridge(
      {
        snapshot: empty(),
        saveRevision: 0,
        replaceManifestFromDev: () => ({ ok: true }),
      },
      {
        featureSlug: "promo",
        onFeatureRevision: (revision) => revisions.push(revision),
      }
    );
    try {
      await vi.waitFor(() => expect(revisions.length).toBeGreaterThan(0));
      expect(revisions[0]).toBe(7);
      expect(bodies[0]).toMatchObject({
        kind: "heartbeat",
        featureSlug: "promo",
      });
    } finally {
      stop();
    }
  });
});

describe("a take the bridge adds or points at a new file", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** The editor, and every copy it handed its store to save. */
  function editorWith(initialProject?: PostProject) {
    const saved: PostProject[] = [];
    const editor = createPostEditorState({
      getSequence: () =>
        ({
          id: "seq",
          steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
        }) as unknown as SequenceData,
      now: () => NOW + 10,
      ...(initialProject ? { initialProject } : {}),
      store: {
        ...devicePostEditorStore,
        saveProject(project) {
          saved.push(project);
          return devicePostEditorStore.saveProject(project);
        },
      },
    });
    return { editor, saved };
  }

  it("plays at once, with its timing open and saved", () => {
    const { editor, saved } = editorWith();
    const base = editor.snapshot;
    const next = applyPostProjectOps(
      base,
      [{ op: "add-take", url: FEATURE_URL, durationSeconds: 4, append: true }],
      { now: NOW + 5 }
    );
    expect(editor.replaceManifestFromDev(next, base)).toEqual({ ok: true });
    const takeId = editor.takes[0]?.id ?? "";
    expect(editor.mediaUrl(takeId)).toBe(FEATURE_URL);
    expect(editor.timing(takeId)).not.toBeNull();
    // A feature video's disk save skips a copy older than the newest one
    // the editor kept, so the copy kept must be the whole post.
    expect(saved.at(-1)).toEqual(editor.snapshot);
    editor.dispose();
  });

  it("keeps the timing the relink cut back, and saves it", () => {
    const added = withFeatureTake();
    const first = added.takes[0]!;
    const timing = createTakeTiming({
      sequenceId: "seq",
      takeKey: first.takeKey,
      durationSeconds: 4,
      now: NOW,
    });
    const { editor, saved } = editorWith({
      ...added,
      timings: {
        [first.id]: {
          ...timing,
          sections: [{ ...timing.sections[0]!, taps: [1, 2, 3.5] }],
        },
      },
    });
    const base = editor.snapshot;
    const shorter = featureVideoMediaUrl("promo", "captures/a.2.mp4");
    const next = applyPostProjectOps(
      base,
      [
        {
          op: "relink-take",
          take: first.id,
          url: shorter,
          durationSeconds: 3,
        },
      ],
      { now: NOW + 20 }
    );
    expect(editor.replaceManifestFromDev(next, base)).toEqual({ ok: true });
    expect(editor.mediaUrl(first.id)).toBe(shorter);
    expect(editor.timing(first.id)).toMatchObject({
      takeKey: `linked:${shorter}`,
      confirmedAt: null,
      sections: [{ startSeconds: 0, endSeconds: 3, taps: [1, 2] }],
    });
    expect(saved.at(-1)).toEqual(editor.snapshot);
    editor.dispose();
  });
});

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  heartbeatPostProject,
  postProjectRenderStatus,
  queuePostProjectOps,
  queuePostProjectRender,
  readRenderReport,
  type PostProjectRenderReport,
} from "#lib/server/post-project-dev-bridge.js";
import { FEATURE_EXPORT_NAME_RULE } from "#lib/shared/media-composition/domain/feature-video-export.js";
import {
  GET as statusRoute,
  POST as postProjectRoute,
} from "../../../src/routes/api/dev/post-project/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";
import { project } from "./post-project-fixtures";

const SAVED = {
  file: "exports/check.mp4",
  path: "E:/videos/promo/exports/check.mp4",
  bytes: 2048,
};

/** An editor after its first heartbeat; promo's unless the test says none. */
function openEditor(featureSlug: string | null = "promo"): string {
  const sessionId = randomUUID();
  heartbeatPostProject({
    sessionId,
    revision: 0,
    snapshot: project([], [], []),
    ...(featureSlug ? { featureSlug } : {}),
  });
  return sessionId;
}

/** An edit that changes the empty post, which is 9:16. */
const toSquare = { op: "canvas" as const, canvas: "1:1" };

/** A folder for the edit backups the bridge writes, removed afterwards. */
async function inBackupFolder(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "render-bridge-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** A later heartbeat from a promo editor, with its render report if any. */
const beat = (sessionId: string, render?: PostProjectRenderReport) =>
  heartbeatPostProject({
    sessionId,
    revision: 0,
    featureSlug: "promo",
    ...(render ? { render } : {}),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a render job", () => {
  it("goes from the CLI to the editor and back", () => {
    const sessionId = openEditor();
    const queued = queuePostProjectRender({ sessionId, name: "check.mp4" });
    expect(queued).toEqual({ renderId: expect.any(String), state: "queued" });
    // Each heartbeat hands the job on until the editor says it started.
    expect(beat(sessionId).render).toEqual({
      id: queued.renderId,
      name: "check.mp4",
    });
    const started = beat(sessionId, {
      id: queued.renderId,
      state: "rendering",
      phase: "encoding",
      percent: 42,
    });
    expect(started).not.toHaveProperty("render");
    expect(postProjectRenderStatus(sessionId, queued.renderId)).toMatchObject({
      state: "rendering",
      phase: "encoding",
      percent: 42,
      message: "",
    });
    beat(sessionId, {
      id: queued.renderId,
      state: "completed",
      message: "Saved exports/check.mp4.",
      ...SAVED,
    });
    expect(postProjectRenderStatus(sessionId, queued.renderId)).toMatchObject({
      state: "completed",
      percent: 100,
      message: "Saved exports/check.mp4.",
      ...SAVED,
    });
  });

  it("takes reports only for its own job, and only until the job ends", () => {
    const sessionId = openEditor();
    const { renderId } = queuePostProjectRender({ sessionId });
    beat(sessionId, { id: "another", state: "failed", message: "Not this." });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "queued",
      message: "Waiting for the editor to start the render.",
    });
    beat(sessionId, { id: renderId, state: "failed" });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "failed",
      message: "The render failed.",
    });
    beat(sessionId, { id: renderId, state: "rendering", percent: 10 });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "failed",
    });
    expect(postProjectRenderStatus(sessionId, "missing")).toBeNull();
  });

  it("refuses what it cannot do, and says why", () => {
    expect(() => queuePostProjectRender({ sessionId: randomUUID() })).toThrow(
      "Editor session is not active."
    );
    expect(() =>
      queuePostProjectRender({ sessionId: openEditor(null) })
    ).toThrow("Only a feature video's editor renders to its folder.");
    const sessionId = openEditor();
    expect(() =>
      queuePostProjectRender({ sessionId, name: "../check.mp4" })
    ).toThrow(FEATURE_EXPORT_NAME_RULE);
    queuePostProjectRender({ sessionId });
    expect(() => queuePostProjectRender({ sessionId })).toThrow(
      "A render is already running in this editor."
    );
  });

  it("holds edits while the editor renders", () =>
    inBackupFolder(async (directory) => {
      const sessionId = openEditor();
      queuePostProjectRender({ sessionId });
      await expect(
        queuePostProjectOps({ sessionId, ops: [toSquare] }, directory)
      ).rejects.toThrow("The editor is rendering. Try again when it finishes.");
    }));

  it("waits for a pending edit before it renders", () =>
    inBackupFolder(async (directory) => {
      const sessionId = openEditor();
      await queuePostProjectOps({ sessionId, ops: [toSquare] }, directory);
      expect(() => queuePostProjectRender({ sessionId })).toThrow(
        "An edit is pending. Try again when it finishes."
      );
    }));

  it("fails a job the editor never starts, or drops partway", () => {
    const idle = openEditor();
    const first = queuePostProjectRender({ sessionId: idle });
    const dropped = openEditor();
    const second = queuePostProjectRender({ sessionId: dropped });
    beat(dropped, { id: second.renderId, state: "rendering", percent: 5 });

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    expect(postProjectRenderStatus(idle, first.renderId)).toMatchObject({
      state: "failed",
      message:
        "The editor did not start the render. Reload its tab and try again.",
    });
    // Its editor was heard from within the last minute.
    expect(postProjectRenderStatus(dropped, second.renderId)).toMatchObject({
      state: "rendering",
    });
    clock.mockReturnValue(now + 61_000);
    expect(postProjectRenderStatus(dropped, second.renderId)).toMatchObject({
      state: "failed",
      message: "The editor closed before the render finished.",
    });
  });

  it("keeps its jobs when the dev server runs the bridge's module again", async () => {
    const sessionId = openEditor();
    const { renderId } = queuePostProjectRender({ sessionId });
    // As Vite does when a change under a running dev server reaches the bridge.
    vi.resetModules();
    const reloaded = await import("#lib/server/post-project-dev-bridge.js");
    expect(reloaded.postProjectRenderStatus(sessionId, renderId)).toMatchObject(
      {
        id: renderId,
        state: "queued",
      }
    );
  });
});

describe("readRenderReport", () => {
  it("keeps a good report and trims what is too long", () => {
    expect(
      readRenderReport({
        id: "r",
        state: "rendering",
        phase: "x".repeat(60),
        percent: 140,
        message: "m".repeat(400),
        extra: true,
      })
    ).toEqual({
      id: "r",
      state: "rendering",
      phase: "x".repeat(40),
      percent: 100,
      message: "m".repeat(300),
    });
    expect(readRenderReport({ id: "r", state: "completed", ...SAVED })).toEqual(
      { id: "r", state: "completed", ...SAVED }
    );
  });

  it.each([
    undefined,
    null,
    "rendering",
    { state: "rendering" },
    { id: "r", state: "paused" },
    { id: "r", state: "completed" },
    { id: "r", state: "completed", ...SAVED, file: "elsewhere.mp4" },
  ])("drops %j", (value) => {
    expect(readRenderReport(value)).toBeUndefined();
  });
});

describe("the post-project route", () => {
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

  const post = (body: Record<string, unknown>) =>
    postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify(body),
      }) as never
    );
  const get = (query: string) =>
    statusRoute(routeEvent(`/api/dev/post-project${query}`) as never);

  it("queues a render, takes the editor's report and answers its status", async () => {
    const sessionId = openEditor();
    const queued = await (
      await post({ kind: "render", sessionId, name: "check.mp4" })
    ).json();
    expect(queued).toEqual({ renderId: expect.any(String), state: "queued" });
    const answer = await (
      await post({
        kind: "heartbeat",
        sessionId,
        revision: 0,
        featureSlug: "promo",
        render: { id: queued.renderId, state: "rendering", percent: 30 },
      })
    ).json();
    expect(answer).not.toHaveProperty("render");
    const status = await (
      await get(`?sessionId=${sessionId}&renderId=${queued.renderId}`)
    ).json();
    expect(status).toMatchObject({ state: "rendering", percent: 30 });
  });

  it("refuses a broken render request and an unknown render", async () => {
    expect(
      await thrownStatus(() => post({ kind: "render", sessionId: 7 }))
    ).toBe(400);
    expect(
      await thrownStatus(() =>
        post({ kind: "render", sessionId: randomUUID() })
      )
    ).toBe(409);
    expect(
      await thrownStatus(() => get(`?sessionId=${randomUUID()}&renderId=r`))
    ).toBe(404);
  });
});

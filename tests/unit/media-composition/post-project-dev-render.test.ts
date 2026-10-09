import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startPostProjectDevBridge,
  type PostProjectDevRender,
} from "$lib/shared/media-composition/services/post-project-dev-client";
import { project } from "./post-project-fixtures";

const SAVED = {
  file: "exports/check.mp4",
  path: "E:/videos/promo/exports/check.mp4",
  bytes: 2048,
};
/** Heartbeats come a second apart, so each wait allows a few. */
const WAIT = { timeout: 4000 };

/** A dev server stand-in: answers heartbeats in turn, then with no work. */
function fakeBridge(answers: Record<string, unknown>[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json({ command: null, ...answers.shift() });
    })
  );
  return bodies;
}

const editor = () => ({
  snapshot: project([], [], []),
  saveRevision: 0,
  replaceManifestFromDev: () => ({ ok: true }),
});

/** A render hook whose render the test ends by hand. */
function heldRender() {
  let finish: (saved: typeof SAVED) => void = () => {};
  let fail: (cause: Error) => void = () => {};
  // The executor runs at once, so finish and fail are set before the return.
  const done = new Promise<typeof SAVED>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const run = vi.fn((_name?: string) => done);
  const hook: PostProjectDevRender = {
    run,
    progress: () => ({ phase: "encoding", percent: 40 }),
  };
  return { hook, run, finish, fail };
}

const reports = (bodies: Record<string, unknown>[]) =>
  bodies.map((body) => body.render ?? null);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the bridge client's renders", () => {
  it("starts a handed-out render once and reports it to the end", async () => {
    // The server hands a job out again until it hears that the job started.
    const handOff = { render: { id: "r1", name: "check.mp4" } };
    const bodies = fakeBridge([{}, handOff, handOff]);
    const held = heldRender();
    const stop = startPostProjectDevBridge(editor(), {
      featureSlug: "promo",
      render: held.hook,
    });
    try {
      await vi.waitFor(
        () => expect(held.run).toHaveBeenCalledWith("check.mp4"),
        WAIT
      );
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r1",
            state: "rendering",
            phase: "encoding",
            percent: 40,
          }),
        WAIT
      );
      held.finish(SAVED);
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r1",
            state: "completed",
            message: "Saved exports/check.mp4.",
            ...SAVED,
          }),
        WAIT
      );
      const sent = bodies.length;
      await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(sent), WAIT);
      expect(bodies.at(-1)).not.toHaveProperty("render");
      expect(held.run).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  }, 15_000);

  it("reports why a render failed", async () => {
    const bodies = fakeBridge([{ render: { id: "r2" } }]);
    const held = heldRender();
    const stop = startPostProjectDevBridge(editor(), {
      featureSlug: "promo",
      render: held.hook,
    });
    try {
      await vi.waitFor(
        () => expect(held.run).toHaveBeenCalledWith(undefined),
        WAIT
      );
      held.fail(new Error("The animation is still being prepared."));
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r2",
            state: "failed",
            message: "The animation is still being prepared.",
          }),
        WAIT
      );
    } finally {
      stop();
    }
  }, 15_000);

  it("answers a job it cannot run", async () => {
    const bodies = fakeBridge([{ render: { id: "r3" } }]);
    const stop = startPostProjectDevBridge(editor(), { featureSlug: "promo" });
    try {
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r3",
            state: "failed",
            message: "This editor cannot render.",
          }),
        WAIT
      );
    } finally {
      stop();
    }
  }, 15_000);
});

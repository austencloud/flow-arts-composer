import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  heartbeatPostProject,
  postProjectEditStatus,
  queuePostProjectOps,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";
import {
  POST_BOX,
  type PostAnimationItem,
} from "$lib/shared/media-composition/domain/post-project";
import { findTunnelHook } from "$lib/shared/media-composition/domain/post-project-edits";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, overlay, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };

function post() {
  return project(
    [video("v1", { start: 0, duration: 10, pinnedStart: true })],
    [
      [
        overlay("anim", "animation", {
          start: 0,
          duration: 10,
          box: { ...POST_BOX.bottom },
          anchor: { itemId: "v1", offset: 0 },
          fill: true,
          animationAppearance: { tkaGlyph: true, stepNumbers: true },
        } as Partial<PostAnimationItem>),
      ],
    ]
  );
}

describe("scripted post edits", () => {
  it("adds a hook that starts on Ease out and changes its speed by name or curve", () => {
    const withHook = applyPostProjectOps(post(), [{ op: "add-hook" }], ctx);
    expect(findTunnelHook(withHook)?.tunnelHook?.speed).toEqual([
      0, 0, 0.58, 1,
    ]);
    const linear = applyPostProjectOps(
      withHook,
      [{ op: "hook-speed", speed: "linear" }],
      ctx
    );
    expect(findTunnelHook(linear)?.tunnelHook?.speed).toEqual([0, 0, 1, 1]);
    const custom = applyPostProjectOps(
      withHook,
      [{ op: "hook-speed", speed: "0.2,0,0.4,1" }],
      ctx
    );
    expect(findTunnelHook(custom)?.tunnelHook?.speed).toEqual([0.2, 0, 0.4, 1]);
    const original = applyPostProjectOps(
      withHook,
      [{ op: "hook-speed", speed: "default" }],
      ctx
    );
    expect(findTunnelHook(original)?.tunnelHook?.speed).toBeUndefined();
  });

  it("rejects a bad curve and names which edit failed", () => {
    expect(() =>
      applyPostProjectOps(
        post(),
        [{ op: "add-hook" }, { op: "hook-speed", speed: "1,2,3" }],
        ctx
      )
    ).toThrow(/Edit 2 \(hook-speed\)/);
    expect(() =>
      applyPostProjectOps(post(), [{ op: "hook-speed", speed: "linear" }], ctx)
    ).toThrow(/no opening tunnel/);
  });

  it("will not add a second hook", () => {
    const withHook = applyPostProjectOps(post(), [{ op: "add-hook" }], ctx);
    expect(() =>
      applyPostProjectOps(withHook, [{ op: "add-hook" }], ctx)
    ).toThrow(/already has/);
  });

  it("sets and clears appearance flags on every animation", () => {
    const withHook = applyPostProjectOps(post(), [{ op: "add-hook" }], ctx);
    const next = applyPostProjectOps(
      withHook,
      [
        {
          op: "appearance",
          item: "animations",
          set: { stepNumbers: false, tkaGlyph: null },
        },
      ],
      ctx
    );
    const animations = next.tracks
      .flatMap((track) => track.items)
      .filter((item) => item.kind === "animation") as PostAnimationItem[];
    expect(animations).toHaveLength(1);
    for (const item of animations) {
      expect(item.animationAppearance?.stepNumbers).toBe(false);
      expect(item.animationAppearance).not.toHaveProperty("tkaGlyph");
    }
  });

  it("removes the hook and puts the post back where it was", () => {
    const before = post();
    const after = applyPostProjectOps(
      applyPostProjectOps(before, [{ op: "add-hook" }], ctx),
      [{ op: "remove-hook" }],
      ctx
    );
    expect(findTunnelHook(after)).toBeNull();
    expect(after.tracks.flatMap((t) => t.items.map((i) => i.start))).toEqual(
      before.tracks.flatMap((t) => t.items.map((i) => i.start))
    );
  });

  it("refuses an unknown item and an empty batch", () => {
    expect(() =>
      applyPostProjectOps(post(), [{ op: "delete", item: "nope" }], ctx)
    ).toThrow(/No item "nope"/);
    expect(() => applyPostProjectOps(post(), [], ctx)).toThrow(/at least one/);
  });
});

describe("scripted edits through the editor bridge", () => {
  it("applies named edits to the editor's own copy and queues one command", async () => {
    const sessionId = randomUUID();
    heartbeatPostProject({ sessionId, revision: 1, snapshot: post() });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "post-ops-"));
    const queued = await queuePostProjectOps(
      { sessionId, ops: [{ op: "add-hook", speed: "ease-out" }] },
      directory
    );
    expect(queued.status).toBe("pending");
    const { command } = heartbeatPostProject({ sessionId, revision: 1 });
    expect(findTunnelHook(command!.project)?.tunnelHook?.speed).toEqual([
      0, 0, 0.58, 1,
    ]);
    expect(readPostProjectSession(sessionId)?.pendingCommandId).toBe(
      command!.id
    );
    expect(postProjectEditStatus(sessionId, command!.id)).toEqual({
      status: "pending",
    });
    await fs.rm(directory, { recursive: true });
  });

  it("reports a no-op without queuing anything", async () => {
    const sessionId = randomUUID();
    heartbeatPostProject({ sessionId, revision: 1, snapshot: post() });
    const result = await queuePostProjectOps({
      sessionId,
      ops: [{ op: "remove-hook" }],
    });
    expect(result.status).toBe("unchanged");
    expect(readPostProjectSession(sessionId)?.pendingCommandId).toBeNull();
  });
});

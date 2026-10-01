import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { loadPostProject } from "$lib/shared/media-composition/services/post-project-store";
import { startPostProjectDevBridge } from "$lib/shared/media-composition/services/post-project-dev-client";
import {
  fingerprint,
  heartbeatPostProject,
  postProjectEditStatus,
  queuePostProjectEdit,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";

const sequence = {
  id: "bridge-sequence",
  steps: [{ duration: 1 }],
} as unknown as SequenceData;
const makeEditor = () =>
  createPostEditorState({ getSequence: () => sequence, now: () => Date.now() });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Post Studio manifest bridge", () => {
  it("applies one saved undo step and preserves the open editor's map and playhead", () => {
    const editor = makeEditor();
    editor.addCatalogVideo({
      videoId: "clip",
      label: "Clip",
      url: "https://example.test/clip.mp4",
      durationSeconds: 10,
    });
    const takeId = editor.takes[0]!.id;
    editor.editTiming(takeId, (timing) => ({
      ...timing,
      sections: [{ ...timing.sections[0]!, taps: [2, 4] }],
    }));
    editor.seek(3);
    editor.selectedItemId = editor.project.tracks[0]!.items[0]!.id;
    const original = editor.snapshot;
    const selected = editor.selectedItemId;
    const mediaUrl = editor.mediaUrl(takeId);
    const next = {
      ...original,
      background: "blur" as const,
      updatedAt: original.updatedAt + 1,
    };
    const result = editor.replaceManifestFromDev(next, original);
    expect(result).toEqual({ ok: true });
    expect(editor.project.background).toBe("blur");
    expect(editor.snapshot.timings).toEqual(original.timings);
    expect(editor.timing(takeId)?.sections[0]?.taps).toEqual([2, 4]);
    expect(editor.mediaUrl(takeId)).toBe(mediaUrl);
    expect(editor.previewSeconds).toBe(3);
    expect(editor.selectedItemId).toBe(selected);
    expect(editor.project.updatedAt).toBeGreaterThan(original.updatedAt);
    expect(loadPostProject(sequence.id)?.background).toBe("blur");
    editor.undo();
    expect(editor.project.background).toBe(original.background);
    expect(editor.mediaUrl(takeId)).toBe(mediaUrl);
    expect(editor.snapshot.timings).toEqual(original.timings);
    expect(editor.previewSeconds).toBe(3);
  });

  it("rejects changed editor state, another sequence and invalid schema", () => {
    const editor = makeEditor();
    const base = editor.snapshot;
    expect(
      editor.replaceManifestFromDev({ ...base, sequenceId: "other" }, base).ok
    ).toBe(false);
    expect(
      editor.replaceManifestFromDev({ ...base, tracks: [] }, base).ok
    ).toBe(false);
    const changed = { ...base, background: "blur" as const };
    expect(
      editor.replaceManifestFromDev(changed, {
        ...base,
        updatedAt: base.updatedAt + 9,
      }).ok
    ).toBe(false);
  });

  it("rejects stale queue bases and never redelivers an acknowledged command", async () => {
    const editor = makeEditor();
    const sessionId = randomUUID();
    const base = editor.snapshot;
    heartbeatPostProject({ sessionId, revision: 0, snapshot: base });
    const next = {
      ...base,
      background: "blur" as const,
      updatedAt: base.updatedAt + 1,
    };
    const backupDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "post-bridge-test-")
    );
    const queued = await queuePostProjectEdit(
      {
        sessionId,
        baseRevision: 0,
        baseFingerprint: readPostProjectSession(sessionId)!.fingerprint,
        project: next,
      },
      backupDirectory
    );
    const backupFiles = await fs.readdir(backupDirectory);
    expect(backupFiles).toHaveLength(1);
    const backup = JSON.parse(
      await fs.readFile(path.join(backupDirectory, backupFiles[0]!), "utf8")
    );
    expect(backup.snapshot).toEqual(
      readPostProjectSession(sessionId)!.snapshot
    );
    const delivered = heartbeatPostProject({ sessionId, revision: 0 });
    expect(delivered.command?.id).toBe(queued.commandId);
    expect(
      editor.replaceManifestFromDev(
        delivered.command!.project,
        delivered.command!.baseSnapshot
      ).ok
    ).toBe(true);
    const acknowledged = heartbeatPostProject({
      sessionId,
      revision: editor.saveRevision,
      snapshot: editor.snapshot,
      result: {
        commandId: queued.commandId,
        status: "completed",
        message: "Applied",
      },
    });
    expect(acknowledged.command).toBeNull();
    expect(postProjectEditStatus(sessionId, queued.commandId)?.status).toBe(
      "completed"
    );
    await expect(
      queuePostProjectEdit({
        sessionId,
        baseRevision: 0,
        baseFingerprint: fingerprint(base),
        project: next,
      })
    ).rejects.toThrow("changed");
    if (
      !path
        .resolve(backupDirectory)
        .startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
      throw new Error("Unsafe test backup path");
    await fs.rm(backupDirectory, { recursive: true });
  });

  it("resends the snapshot and acknowledgment after a broken heartbeat response", async () => {
    vi.useFakeTimers();
    const snapshot = makeEditor().snapshot;
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options: RequestInit) => {
        calls.push(JSON.parse(options.body as string));
        if (calls.length === 1)
          return {
            ok: true,
            json: async () => ({
              command: {
                id: "command-1",
                baseSnapshot: snapshot,
                project: snapshot,
              },
            }),
          };
        if (calls.length === 2)
          return {
            ok: true,
            json: async () => {
              throw new Error("broken response");
            },
          };
        return { ok: true, json: async () => ({ command: null }) };
      })
    );
    const stop = startPostProjectDevBridge({
      snapshot,
      saveRevision: 0,
      replaceManifestFromDev: () => {
        throw new Error("Rejected by editor");
      },
    });
    await vi.advanceTimersByTimeAsync(2100);
    stop();
    expect(calls[1]?.result).toMatchObject({
      commandId: "command-1",
      status: "failed",
    });
    expect(calls[2]?.result).toMatchObject({
      commandId: "command-1",
      status: "failed",
    });
    expect(calls[2]?.snapshot).toEqual(snapshot);
  });

  it("does not deliver a command until the previous manifest is backed up", async () => {
    const editor = makeEditor();
    const sessionId = randomUUID();
    const base = editor.snapshot;
    heartbeatPostProject({ sessionId, revision: 0, snapshot: base });
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "post-bridge-ready-test-")
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementationOnce(async (...args) => {
      await gate;
      return mkdir(...args);
    });
    const pending = queuePostProjectEdit(
      {
        sessionId,
        baseRevision: 0,
        baseFingerprint: readPostProjectSession(sessionId)!.fingerprint,
        project: { ...base, background: "blur", updatedAt: base.updatedAt + 1 },
      },
      directory
    );
    expect(heartbeatPostProject({ sessionId, revision: 0 }).command).toBeNull();
    release();
    const queued = await pending;
    expect(heartbeatPostProject({ sessionId, revision: 0 }).command?.id).toBe(
      queued.commandId
    );
    if (
      !path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
      throw new Error("Unsafe test backup path");
    await fs.rm(directory, { recursive: true });
  });

  it("rejects wrong-sequence, invalid, and asset-changing manifests before backup", async () => {
    const editor = makeEditor();
    editor.addCatalogVideo({
      videoId: "clip",
      label: "Clip",
      url: "https://example.test/clip.mp4",
      durationSeconds: 10,
    });
    const sessionId = randomUUID();
    const base = editor.snapshot;
    heartbeatPostProject({
      sessionId,
      revision: editor.saveRevision,
      snapshot: base,
    });
    const read = readPostProjectSession(sessionId)!;
    const input = {
      sessionId,
      baseRevision: read.revision,
      baseFingerprint: read.fingerprint,
    };
    await expect(
      queuePostProjectEdit({
        ...input,
        project: { ...base, sequenceId: "other" },
      })
    ).rejects.toThrow("Wrong sequence");
    await expect(
      queuePostProjectEdit({ ...input, project: { ...base, tracks: [] } })
    ).rejects.toThrow("Invalid Post Studio manifest");
    await expect(
      queuePostProjectEdit({ ...input, project: { ...base, takes: [] } })
    ).rejects.toThrow("takes cannot be changed");
  });

  it("keeps a failed result when the editor changes during the backup write", async () => {
    const editor = makeEditor();
    const sessionId = randomUUID();
    const base = editor.snapshot;
    heartbeatPostProject({ sessionId, revision: 0, snapshot: base });
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "post-bridge-stale-test-")
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementationOnce(async (...args) => {
      await gate;
      return mkdir(...args);
    });
    const pending = queuePostProjectEdit(
      {
        sessionId,
        baseRevision: 0,
        baseFingerprint: readPostProjectSession(sessionId)!.fingerprint,
        project: { ...base, background: "blur", updatedAt: base.updatedAt + 1 },
      },
      directory
    );
    const commandId = readPostProjectSession(sessionId)!.pendingCommandId!;
    heartbeatPostProject({
      sessionId,
      revision: 1,
      snapshot: { ...base, audio: "silent", updatedAt: base.updatedAt + 2 },
    });
    release();
    await expect(pending).rejects.toThrow("changed while the backup");
    expect(postProjectEditStatus(sessionId, commandId)?.status).toBe("failed");
    expect(heartbeatPostProject({ sessionId, revision: 1 }).command).toBeNull();
    if (
      !path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
      throw new Error("Unsafe test backup path");
    await fs.rm(directory, { recursive: true });
  });
});

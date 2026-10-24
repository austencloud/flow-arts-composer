import { describe, expect, it, vi } from "vitest";
import type { NativeViewerState } from "../../../src/lib/shared/3d/unreal/domain/bridge-protocol";
import {
  MotionTransferQueue,
  scoreStepToSeconds,
  transferNativeMotion,
} from "../../../src/lib/shared/3d/unreal/domain/motion-transfer";

describe("Composer motion playback time", () => {
  const steps = [{ duration: 0.5 }, { duration: 2 }, { duration: 1.5 }];

  it("maps fractional steps through authored durations and the static start pose", () => {
    expect(scoreStepToSeconds(steps, 1, 1)).toBe(0);
    expect(scoreStepToSeconds(steps, 1.5, 1)).toBe(0.25);
    expect(scoreStepToSeconds(steps, 2.5, 1)).toBe(1.5);
    expect(scoreStepToSeconds(steps, 3.5, 1)).toBe(3.25);
    expect(scoreStepToSeconds(steps, 0.5, 1)).toBe(0);
    expect(scoreStepToSeconds(steps, 4, 1)).toBe(0);
  });
});

describe("Composer motion transfer", () => {
  const response = {} as NativeViewerState;

  it("finishes an already begun transfer after its capture becomes stale", async () => {
    let current = true;
    const commands: { type: string; payload: Record<string, unknown> }[] = [];
    const command = vi.fn(async (type: string, payload: object) => {
      commands.push({ type, payload: payload as Record<string, unknown> });
      if (type === "motionChunk") current = false;
      return response;
    });
    const result = await transferNativeMotion(
      command,
      "performer-1",
      { frames: "x".repeat(50_000) },
      () => current
    );
    expect(result).toBe(false);
    expect(commands.map((entry) => entry.type)).toEqual([
      "beginMotion",
      "motionChunk",
      "motionChunk",
      "motionChunk",
      "commitMotion",
    ]);
    const data = commands
      .filter((entry) => entry.type === "motionChunk")
      .map((entry) => entry.payload.data)
      .join("");
    expect(JSON.parse(data)).toEqual({ frames: "x".repeat(50_000) });
  });

  it("never starts a stale transfer", async () => {
    const command = vi.fn(async () => response);
    expect(
      await transferNativeMotion(command, "performer-1", {}, () => false)
    ).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });

  it("keeps a surrogate pair together at a chunk boundary", async () => {
    const commands: { type: string; payload: Record<string, unknown> }[] = [];
    const command = vi.fn(async (type: string, payload: object) => {
      commands.push({ type, payload: payload as Record<string, unknown> });
      return response;
    });
    const bundle = { text: `${"a".repeat(23_990)}😀` };
    expect(
      await transferNativeMotion(command, "performer-1", bundle, () => true)
    ).toBe(true);
    const chunks = commands
      .filter((entry) => entry.type === "motionChunk")
      .map((entry) => entry.payload.data as string);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(23_999);
    expect(chunks.join("")).toBe(JSON.stringify(bundle));
    expect(commands[0]?.payload.totalBytes).toBe(
      new TextEncoder().encode(JSON.stringify(bundle)).byteLength
    );
  });
});

describe("Composer motion transfer queue", () => {
  it("skips a canceled queued upload and retries its cached bundle in the next cast generation", async () => {
    const queue = new MotionTransferQueue();
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.enqueue("first-cast", () => true, () => blocker);
    const send = vi.fn(async () => {});
    let oldCastCurrent = true;
    const canceled = queue.enqueue("old:performer:signature", () => oldCastCurrent, send);
    oldCastCurrent = false;
    queue.resetClaims();
    const retry = queue.enqueue("new:performer:signature", () => true, send);
    queue.enqueue("new:performer:signature", () => true, send);
    release();
    await Promise.all([first, canceled, retry]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

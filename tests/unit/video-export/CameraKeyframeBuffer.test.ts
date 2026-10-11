import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CameraKeyframeBuffer } from "#lib/shared/video-export/domain/camera-keyframe.js";

describe("CameraKeyframeBuffer", () => {
  let buffer: CameraKeyframeBuffer;

  beforeEach(() => {
    buffer = new CameraKeyframeBuffer();
  });

  afterEach(() => {
    buffer.stopRecording();
    vi.useRealTimers();
  });

  it("starts empty with zero keyframes", () => {
    expect(buffer.keyframes).toHaveLength(0);
    expect(buffer.duration).toBe(0);
  });

  it("records keyframes from a mock camera at 60Hz", () => {
    const mockCamera = {
      position: { x: 1, y: 2, z: 3 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      fov: 50,
    };

    vi.useFakeTimers();
    buffer.startRecording(mockCamera as any);

    // Advance 100ms — should trigger ~6 interval callbacks
    vi.advanceTimersByTime(100);

    buffer.stopRecording();

    expect(buffer.keyframes.length).toBeGreaterThanOrEqual(5);
    expect(buffer.keyframes.length).toBeLessThanOrEqual(7);

    const first = buffer.keyframes[0]!;
    expect(first.position).toEqual([1, 2, 3]);
    expect(first.quaternion).toEqual([0, 0, 0, 1]);
    expect(first.fov).toBe(50);
  });

  it("tracks duration from first to last keyframe", () => {
    const mockCamera = {
      position: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      fov: 50,
    };

    vi.useFakeTimers();
    buffer.startRecording(mockCamera as any);
    vi.advanceTimersByTime(500);
    buffer.stopRecording();

    // Duration should be ~500ms = ~0.5s
    expect(buffer.duration).toBeGreaterThan(0.4);
    expect(buffer.duration).toBeLessThan(0.6);
  });

  it("creates a single-keyframe buffer from static camera", () => {
    const mockCamera = {
      position: { x: 5, y: 3, z: -2 },
      quaternion: { x: 0, y: 0.707, z: 0, w: 0.707 },
      fov: 45,
    };

    buffer.captureStatic(mockCamera as any);

    expect(buffer.keyframes).toHaveLength(1);
    expect(buffer.keyframes[0]!.position).toEqual([5, 3, -2]);
    expect(buffer.duration).toBe(0);
  });
});

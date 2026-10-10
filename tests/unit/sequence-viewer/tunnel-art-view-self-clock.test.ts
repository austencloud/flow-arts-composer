/**
 * TunnelArtView's self-clock advances the playhead only while the tunnel
 * plays, and keeps no frame loop while paused. A paused tunnel (a gallery
 * preview, or a Create method preview between turns) then costs no frames.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTunnelClock } from "./tunnel-art-view-clock-harness.svelte";

// The error controller keeps the canvas from mounting, so its heavy import
// graph has no use here.
vi.mock(
  "#lib/shared/animation-engine/components/AnimatorCanvas.svelte",
  async () => ({
    default: (await import("../create/PassthroughStub.svelte")).default,
  })
);

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let clock: ReturnType<typeof mountTunnelClock> | null = null;
/** The frame callbacks the tunnel asked for, by id. */
let frames: Map<number, FrameRequestCallback>;
let requestFrame: ReturnType<typeof vi.fn>;
let cancelFrame: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);

  frames = new Map();
  let nextId = 1;
  requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  cancelFrame = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  vi.spyOn(performance, "now").mockReturnValue(1000);
});

afterEach(() => {
  clock?.destroy();
  clock = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TunnelArtView self-clock", () => {
  it("keeps no frame loop while paused", () => {
    clock = mountTunnelClock(host, false);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("starts a frame loop when it plays, and advances the playhead by tempo", () => {
    clock = mountTunnelClock(host, false);
    clock.setPlaying(true);
    expect(requestFrame).toHaveBeenCalledOnce();

    // One second later at 60 BPM (one beat per second): one step on.
    const [id, tick] = [...frames.entries()][0]!;
    frames.delete(id);
    tick(2000);
    expect(clock.step).toBeCloseTo(2, 5);
    // The tick asks for the next frame, so the loop keeps running.
    expect(frames.size).toBe(1);
  });

  it("stops the loop at once when it pauses", () => {
    clock = mountTunnelClock(host, true);
    expect(frames.size).toBe(1);
    clock.setPlaying(false);
    expect(frames.size).toBe(0);
    expect(cancelFrame).toHaveBeenCalled();
  });
});

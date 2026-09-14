import { describe, expect, it } from "vitest";
import type { Snippet } from "svelte";
import type { UnifiedPlaybackContext } from "$lib/shared/timeline/unified-playback-context";
import {
  createViewerStudioSurfaces,
  type StudioAnimationFrame,
} from "$lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte";

describe("shared Studio surfaces", () => {
  it("remembers the selected settings across Card round trips without sharing viewer state", () => {
    const viewer = createViewerStudioSurfaces();
    const other = createViewerStudioSurfaces();
    for (const content of ["card", "animation", "studio"] as const) {
      viewer.enter(0, false, 60);
      viewer.setInspectorContent(content);
      viewer.leave();
      viewer.enter(2, true, 80);
      expect(viewer.inspectorContent).toBe(content);
    }
    expect(other.inspectorContent).toBe("animation");
  });
  const frame = (position: number): StudioAnimationFrame => ({
    sequence: {
      id: "test",
      steps: [],
    } as unknown as StudioAnimationFrame["sequence"],
    position,
    playing: true,
    left: null,
    right: null,
    step: null,
  });

  it("loans one renderer to one slot, then gives it back without losing its registration", () => {
    const state = createViewerStudioSurfaces();
    const html = () =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      ) as HTMLElement;
    const canvas = html();
    const home = html();
    home.append(canvas);
    const unregister = state.registerCanvas(canvas);
    const first = {},
      second = {};
    const a = html(),
      b = html();
    let position = 2.5;
    const release = state.requestCanvas(first, a, () => frame(position));
    state.requestCanvas(second, b, () => frame(7));
    state.enter(2.5, true, 84);
    a.append(canvas);
    expect(state.canvasHome).toBe(home);
    expect(state.canvasTarget).toBe(a);
    expect(state.ownsCanvas(first)).toBe(true);
    expect(state.ownsCanvas(second)).toBe(false);
    position = 4.25;
    expect(state.frame?.position).toBe(4.25);
    release();
    expect(state.canvasTarget).toBe(b);
    expect(state.frame?.position).toBe(7);
    state.leave();
    expect(state.canvasTarget).toBeNull();
    expect(state.frame).toBeNull();
    expect(state.canvasAvailable).toBe(true);
    unregister();
    expect(state.canvasAvailable).toBe(false);
    expect(state.canvasHome).toBeNull();
  });

  it("isolates viewers and ignores stale cleanup from an outgoing owner", () => {
    const state = createViewerStudioSurfaces(),
      other = createViewerStudioSurfaces();
    const old = document.createElement("div"),
      current = document.createElement("div");
    const cleanup = state.registerCanvas(old);
    state.registerCanvas(current);
    cleanup();
    expect(state.canvasAvailable).toBe(true);
    expect(other.canvasAvailable).toBe(false);
    const release = state.requestInspector(old);
    state.requestInspector(current);
    release();
    state.enter(3, false, 100);
    expect(state.inspectorTarget).toBe(current);
    expect(state.entry).toMatchObject({
      position: 3,
      playing: false,
      bpm: 100,
      revision: 1,
    });
    state.leave();
    state.enter(5, true, 120);
    expect(state.entry.revision).toBe(2);
    expect(other.entry.revision).toBe(0);
  });

  it("loans the existing Card and transport and waits for every moving surface", () => {
    const state = createViewerStudioSurfaces();
    const node = document.createElement("div"),
      target = document.createElement("div");
    const owner = {},
      extra = {};
    state.registerCard(node);
    state.registerTransport(node);
    let step = 1;
    const releaseCard = state.requestCard(owner, target, () => ({
      sequence: frame(0).sequence,
      highlightedStepIndex: step,
      options: null,
      automatic: true,
    }));
    state.requestCard(extra, node, () => ({
      sequence: frame(0).sequence,
      highlightedStepIndex: 7,
      options: null,
      automatic: true,
    }));
    const playback = {} as UnifiedPlaybackContext;
    const trailing = (() => {}) as unknown as Snippet;
    const releaseTransport = state.requestTransport(node, playback, trailing);
    state.requestTransport(target, playback, trailing);
    releaseTransport();
    state.enter(0, true, 60);
    expect(state.transportTarget).toBe(target);
    expect(state.transportPlayback).toBe(playback);
    expect(state.ownsCard(owner)).toBe(true);
    expect(state.ownsCard(extra)).toBe(false);
    step = 4;
    expect(state.cardFrame?.highlightedStepIndex).toBe(4);
    state.setMoving(true);
    expect(state.canvasMoving).toBe(true);
    state.setSurfaceMoving("transport", true);
    state.setSurfaceMoving("card", true);
    state.setMoving(false);
    expect(state.canvasMoving).toBe(false);
    expect(state.moving).toBe(true);
    state.setSurfaceMoving("card", false);
    expect(state.moving).toBe(true);
    state.setSurfaceMoving("transport", false);
    expect(state.moving).toBe(false);
    releaseCard();
    expect(state.ownsCard(extra)).toBe(true);
    state.leave();
    expect(state.cardTarget).toBeNull();
    expect(state.transportTarget).toBeNull();
    expect(state.transportAvailable).toBe(true);
  });
});

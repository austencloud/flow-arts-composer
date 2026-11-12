import { createEmptyPostProject } from "#lib/shared/post-studio-plugin/index.js";
import type { PostProject, PostVideoItem } from "@austencloud/video-editor/core";

export interface AutoFrameFixtureClip {
  /** The take's file, served by the dev server. */
  url: string;
  /** The take's length in seconds. */
  durationSeconds: number;
  /** Where the clip starts in the take, and how long it runs. */
  from: number;
  length: number;
  /** Show the footage mirrored. */
  flip: boolean;
}

/** Reads a query of `video`, `from`, `length` and `flip` for the Auto frame fixture. */
export function autoFrameFixtureQuery(params: URLSearchParams, fallbackUrl: string) {
  const number = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && params.has(key) ? value : fallback;
  };
  return {
    url: params.get("video") ?? fallbackUrl,
    from: Math.max(0, number("from", 0)),
    length: Math.max(1, number("length", 20)),
    flip: params.get("flip") === "1",
  };
}

/** A take's length from its file's metadata. */
export function probeVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error(`Could not read ${url}.`));
    video.src = url;
  });
}

/**
 * Disposable browser fixture for Auto frame: one take, one full-frame clip
 * of it, no framing keys. Never reads or writes a creator's saved draft.
 */
export function autoFrameFixture(sequenceId: string, clip: AutoFrameFixtureClip): PostProject {
  const sourceIn = Math.min(clip.from, Math.max(0, clip.durationSeconds - 1));
  const sourceOut = Math.min(clip.durationSeconds, sourceIn + clip.length);
  const video: PostVideoItem = {
    kind: "video",
    id: "auto-frame-clip",
    label: "Clip",
    takeId: "auto-frame-take",
    sourceIn,
    sourceOut,
    speed: 1,
    fit: "contain",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    flip: clip.flip,
    volume: 1,
    start: 0,
    duration: sourceOut - sourceIn,
    box: { x: 0, y: 0, width: 1, height: 1 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: true,
  };
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now(), sourceKind: "none" }),
    takes: [
      {
        id: "auto-frame-take",
        label: "Take",
        ref: { kind: "linked", url: clip.url },
        takeKey: `auto-frame-fixture:${clip.url}`,
        durationSeconds: clip.durationSeconds,
      },
    ],
    tracks: [{ id: "main", hidden: false, locked: false, items: [video] }],
  };
}

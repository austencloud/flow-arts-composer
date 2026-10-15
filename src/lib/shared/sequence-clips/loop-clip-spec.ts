/**
 * Loop clips: a sequence's animation rendered ONCE, by the same export
 * engine that makes a shared video, and played back as a looping MP4
 * wherever a surface would otherwise mount a live engine per tile.
 *
 * Fourteen live tiles on the Creators wall pinned a 4K machine at 1 fps
 * (2026-10-14); a looping clip costs one hardware decoder and nothing on the
 * main thread, so a wall of them can all move at once.
 *
 * This module is the pure contract: where a clip lives, what it is called,
 * and how a playback time maps back onto the sequence's steps. Rendering
 * lives in render-loop-clip.ts, discovery in loop-clip-index.ts.
 */

import { R2_CDN } from "#lib/shared/3d/constants/r2-origin.js";

/**
 * Bump whenever the baked output changes (renderer, look, size, fps). The
 * version is part of every key, so an old clip can never be served for a
 * newer look; stale objects just stop being referenced.
 */
export const LOOP_CLIP_RENDERER_VERSION = 1;

/** Square clips: the animation canvas alone, no header or progress bar. */
export const LOOP_CLIP_RESOLUTION = 720 as const;
export const LOOP_CLIP_FPS = 30;

/** Object key prefix inside the public assets bucket. */
export const LOOP_CLIP_PREFIX = `clips/r${LOOP_CLIP_RENDERER_VERSION}`;

const SEQUENCE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

export function isLoopClipSequenceId(sequenceId: string): boolean {
  return SEQUENCE_ID_RE.test(sequenceId);
}

/** `clips/r1/<sequenceId>.mp4`; throws on an id that could escape the prefix. */
export function loopClipKey(sequenceId: string): string {
  if (!isLoopClipSequenceId(sequenceId)) {
    throw new Error(`Not a loop-clip sequence id: ${sequenceId}`);
  }
  return `${LOOP_CLIP_PREFIX}/${sequenceId}.mp4`;
}

/** One JSON document listing every clip of this renderer version. */
export function loopClipIndexKey(): string {
  return `${LOOP_CLIP_PREFIX}/index.json`;
}

export function loopClipUrl(key: string): string {
  return `${R2_CDN}/${key}`;
}

export interface LoopClipEntry {
  /** Object key inside the assets bucket. */
  key: string;
  bytes: number;
  /** One pass through the sequence at 60 BPM. */
  seconds: number;
  fps: number;
  /** Square edge in pixels. */
  size: number;
  leftPropType: string;
  rightPropType: string;
  /** ISO timestamp of the render. */
  renderedAt: string;
}

export interface LoopClipIndex {
  rendererVersion: number;
  clips: Record<string, LoopClipEntry>;
}

export function emptyLoopClipIndex(): LoopClipIndex {
  return { rendererVersion: LOOP_CLIP_RENDERER_VERSION, clips: {} };
}

/**
 * The fractional beat a clip is showing at `timeSeconds`. A clip holds one
 * pass of the motion with no start-placement beat, so time zero is the start
 * of step 1; steps longer than a beat take proportionally longer. The result
 * wraps, because the clip loops.
 */
export function clipBeatAt(
  stepDurations: readonly number[],
  timeSeconds: number,
  secondsPerBeat = 1
): number {
  const durations = stepDurations.map((d) =>
    Number.isFinite(d) && d > 0 ? d : 1
  );
  const total = durations.reduce((sum, d) => sum + d, 0);
  if (total <= 0 || !Number.isFinite(timeSeconds) || secondsPerBeat <= 0) {
    return 0;
  }
  const beats = timeSeconds / secondsPerBeat;
  const wrapped = ((beats % total) + total) % total;
  let cumulative = 0;
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i]!;
    if (wrapped < cumulative + d) {
      return i + (wrapped - cumulative) / d;
    }
    cumulative += d;
  }
  return durations.length - 1;
}

/**
 * The step-strip position for a clip time, on the strip's own scale where
 * cell 0 is the start placement and cell n is step n.
 */
export function clipStripStep(
  stepDurations: readonly number[],
  timeSeconds: number,
  secondsPerBeat = 1
): number {
  return 1 + clipBeatAt(stepDurations, timeSeconds, secondsPerBeat);
}

/**
 * local-performance-step-maps.ts
 *
 * A local video never reaches Firestore, so its tapped timing has nowhere to
 * be saved except this device. One entry per (sequence, file) key, written
 * whenever a local file's beats are tapped and read back the moment the same
 * file is chosen again - by name, size and last-modified time, since a File
 * picked from disk carries no stable id across page loads.
 *
 * The stored shape is the legacy StepMap `StepMapEditor` already speaks, not
 * the newer SequenceTimeMap: this module hands its caller something to feed
 * straight back into `initialStepMap`, and lets `migrateLegacyStepMap` do the
 * one conversion that actually matters, same as a saved catalog video.
 */

import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";

const PREFIX = "tka:post-studio-local-step-map:";

/** The parts of a File that identify it without holding the File itself. */
export interface LocalPerformanceFileIdentity {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

export function localStepMapKey(
  sequenceId: string,
  file: LocalPerformanceFileIdentity
): string {
  return `${sequenceId}:${file.name}:${file.size}:${file.lastModified}`;
}

function storageKey(key: string): string {
  return PREFIX + key;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSource(value: unknown): value is StepMap["source"] {
  return value === "manual" || value === "auto-detected" || value === "hybrid";
}

interface StoredLocalStepMap {
  beatTimestamps: number[];
  endTimestamp?: number;
  stepCount: number;
  source: StepMap["source"];
  updatedAt: number;
}

function isStoredShape(value: unknown): value is StoredLocalStepMap {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (!Array.isArray(d.beatTimestamps) || d.beatTimestamps.length === 0) {
    return false;
  }
  if (!d.beatTimestamps.every(isFiniteNumber)) return false;
  if (!isFiniteNumber(d.stepCount) || d.stepCount <= 0) return false;
  if (!isValidSource(d.source)) return false;
  if (!isFiniteNumber(d.updatedAt)) return false;
  if (d.endTimestamp !== undefined && !isFiniteNumber(d.endTimestamp)) {
    return false;
  }
  return true;
}

/**
 * Every arrival has to land strictly after the one before it - beatTimestamps
 * first, then the end mark after the last of them - or nothing downstream
 * (migrateLegacyStepMap, the timeline) can trust the order a tap produced.
 */
function hasIncreasingTimestamps(data: StoredLocalStepMap): boolean {
  for (let index = 1; index < data.beatTimestamps.length; index += 1) {
    if (data.beatTimestamps[index]! <= data.beatTimestamps[index - 1]!) {
      return false;
    }
  }
  if (data.endTimestamp !== undefined) {
    const last = data.beatTimestamps[data.beatTimestamps.length - 1]!;
    if (data.endTimestamp <= last) return false;
  }
  return true;
}

/**
 * Null covers every way a stored map can fail to apply: nothing saved yet,
 * corrupted JSON, a shape from some other schema, or a map tapped against a
 * sequence that has since gained or lost steps. The caller falls back to an
 * unmapped selection exactly as it would for a first-time file.
 */
export function loadLocalStepMap(
  key: string,
  stepCount: number
): StepMap | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredShape(parsed)) return null;
    if (parsed.stepCount !== stepCount) return null;
    if (!hasIncreasingTimestamps(parsed)) return null;
    return {
      beatTimestamps: parsed.beatTimestamps,
      ...(parsed.endTimestamp !== undefined
        ? { endTimestamp: parsed.endTimestamp }
        : {}),
      stepCount: parsed.stepCount,
      source: parsed.source,
      updatedAt: new Date(parsed.updatedAt),
    };
  } catch {
    return null;
  }
}

export function saveLocalStepMap(key: string, stepMap: StepMap): void {
  const store = storage();
  if (!store) return;
  try {
    const payload: StoredLocalStepMap = {
      beatTimestamps: stepMap.beatTimestamps,
      ...(stepMap.endTimestamp !== undefined
        ? { endTimestamp: stepMap.endTimestamp }
        : {}),
      stepCount: stepMap.stepCount,
      source: stepMap.source,
      updatedAt: stepMap.updatedAt.getTime(),
    };
    store.setItem(storageKey(key), JSON.stringify(payload));
  } catch {
    // Quota or privacy mode: the map still drives this session, it just
    // won't be there to restore after a reload.
  }
}

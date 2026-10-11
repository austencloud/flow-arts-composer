import {
  PLAYBACK_BASELINE_BPM,
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "#lib/shared/animation-engine/domain/constants/timing.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hashString } from "#lib/shared/foundation/services/content-hasher.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

export const SCAN_PLAYBACK_MIN_BPM = 20;
export const SCAN_PLAYBACK_MAX_BPM = PLAYBACK_BASELINE_BPM;

const SCAN_PLAYBACK_BPM_STEP = 5;
const STORAGE_PREFIX = "tka-scan-playback-bpm-v1:";

export interface ScanPlaybackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type SequenceWithSteps = Pick<SequenceData, "steps">;

function availableStorage(
  storage?: ScanPlaybackStorage
): ScanPlaybackStorage | null {
  if (storage) return storage;
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function preferenceKey(scanCode: string): string {
  return `${STORAGE_PREFIX}${hashString(scanCode)}`;
}

function playableBpm(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= PLAYBACK_MIN_BPM &&
    value <= PLAYBACK_MAX_BPM
  );
}

/** Highest additional half-turn count performed by either prop in one beat. */
export function maxAdditionalTurns(sequence: SequenceWithSteps): number {
  let maxTurns = 0;

  for (const step of sequence.steps) {
    for (const motion of [step.motions?.left, step.motions?.right]) {
      if (!isVisibleMotion(motion)) continue;
      const turns = motion?.turns;
      if (typeof turns === "number" && Number.isFinite(turns)) {
        maxTurns = Math.max(maxTurns, Math.abs(turns));
      }
    }
  }

  return maxTurns;
}

/**
 * Keep additional prop rotation near the one-turn-at-60-BPM baseline.
 * The five-BPM rounding matches the viewer's primary tempo controls.
 */
export function recommendedScanPlaybackBpm(
  sequence: SequenceWithSteps
): number {
  const turnRatio = Math.max(1, maxAdditionalTurns(sequence));
  const rawBpm = PLAYBACK_BASELINE_BPM / turnRatio;
  const steppedBpm =
    Math.round(rawBpm / SCAN_PLAYBACK_BPM_STEP) * SCAN_PLAYBACK_BPM_STEP;

  return Math.min(
    SCAN_PLAYBACK_MAX_BPM,
    Math.max(SCAN_PLAYBACK_MIN_BPM, steppedBpm)
  );
}

export function loadSavedScanPlaybackBpm(
  scanCode: string,
  storage?: ScanPlaybackStorage
): number | null {
  const target = availableStorage(storage);
  if (!target || !scanCode) return null;

  try {
    const raw = target.getItem(preferenceKey(scanCode));
    if (raw === null) return null;

    const bpm = Number(raw);
    return playableBpm(bpm) ? bpm : null;
  } catch {
    return null;
  }
}

export function saveScanPlaybackBpm(
  scanCode: string,
  bpm: number,
  storage?: ScanPlaybackStorage
): void {
  const target = availableStorage(storage);
  if (!target || !scanCode || !playableBpm(bpm)) return;

  try {
    target.setItem(preferenceKey(scanCode), String(Math.round(bpm)));
  } catch {
    // Playback remains usable when storage is unavailable or full.
  }
}

export function initialScanPlaybackBpm(
  scanCode: string,
  sequence: SequenceWithSteps,
  storage?: ScanPlaybackStorage
): number {
  return (
    loadSavedScanPlaybackBpm(scanCode, storage) ??
    recommendedScanPlaybackBpm(sequence)
  );
}

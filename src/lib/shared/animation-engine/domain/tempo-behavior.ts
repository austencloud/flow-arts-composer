import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "#lib/shared/animation-engine/domain/constants/timing.js";

export const NUMERIC_TEMPO_PRESETS: readonly number[] = [
  15, 30, 60, 90, 120, 150,
];

export const SEMANTIC_TEMPO_PRESETS: ReadonlyArray<{
  label: "Slow" | "Med" | "Fast";
  bpm: number;
}> = [
  { label: "Slow", bpm: 15 },
  { label: "Med", bpm: 60 },
  { label: "Fast", bpm: 120 },
];

export const TEMPO_TAP_TIMEOUT_MS = 2_000;
export const MAX_TEMPO_TAP_HISTORY = 8;

function assertTempoBounds(minBpm: number, maxBpm: number): void {
  if (
    !Number.isFinite(minBpm) ||
    !Number.isFinite(maxBpm) ||
    minBpm <= 0 ||
    maxBpm < minBpm
  ) {
    throw new RangeError("Tempo bounds must be finite, positive, and ordered");
  }
}

export function clampTempoBpm(
  bpm: number,
  minBpm = PLAYBACK_MIN_BPM,
  maxBpm = PLAYBACK_MAX_BPM
): number {
  assertTempoBounds(minBpm, maxBpm);
  if (!Number.isFinite(bpm)) {
    throw new RangeError("Tempo must be finite");
  }
  return Math.max(minBpm, Math.min(maxBpm, bpm));
}

export function recordTempoTap(
  tapTimes: readonly number[],
  timestamp: number,
  timeoutMs = TEMPO_TAP_TIMEOUT_MS,
  maxHistory = MAX_TEMPO_TAP_HISTORY
): number[] {
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Tap timestamp must be finite");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Tap timeout must be positive and finite");
  }
  if (!Number.isInteger(maxHistory) || maxHistory < 2) {
    throw new RangeError("Tap history must keep at least two entries");
  }

  const lastTimestamp = tapTimes[tapTimes.length - 1];
  if (lastTimestamp === timestamp) return [...tapTimes];
  if (
    lastTimestamp === undefined ||
    timestamp < lastTimestamp ||
    timestamp - lastTimestamp > timeoutMs
  ) {
    return [timestamp];
  }

  return [...tapTimes, timestamp].slice(-maxHistory);
}

export function calculateTapTempo(
  tapTimes: readonly number[],
  minBpm = PLAYBACK_MIN_BPM,
  maxBpm = PLAYBACK_MAX_BPM
): number | null {
  assertTempoBounds(minBpm, maxBpm);
  if (tapTimes.length < 2) return null;

  const recentTapTimes = tapTimes.slice(-MAX_TEMPO_TAP_HISTORY);
  let intervalTotal = 0;

  for (let index = 1; index < recentTapTimes.length; index += 1) {
    const previous = recentTapTimes[index - 1]!;
    const current = recentTapTimes[index]!;
    const interval = current - previous;

    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current) ||
      interval <= 0 ||
      interval > TEMPO_TAP_TIMEOUT_MS
    ) {
      return null;
    }

    intervalTotal += interval;
  }

  const averageInterval = intervalTotal / (recentTapTimes.length - 1);
  return clampTempoBpm(Math.round(60_000 / averageInterval), minBpm, maxBpm);
}

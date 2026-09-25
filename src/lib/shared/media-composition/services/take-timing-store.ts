import {
  TakeTimingSchema,
  createTakeTiming,
  takeTimingFromLegacyMarks,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * Saves each take's timing on this device, keyed by sequence and take.
 *
 * A local file carries no stable id across page loads, so its key is its
 * name, size and modified time; a catalog video uses its id. Nothing here
 * writes to Firestore - syncing timing across devices is a later step.
 *
 * The two older stores (tapped step maps and BPM + beat 1) are read once when
 * a take has no timing yet, converted, and saved here, so a take Austen mapped
 * before still opens mapped.
 */

const PREFIX = "tka:post-studio:take-timing:v1:";
const LEGACY_STEP_MAP_PREFIX = "tka:post-studio-local-step-map:";
const LEGACY_BPM_PREFIX = "tka:post-studio-bpm-alignment:";

export interface LocalTakeIdentity {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

export function localTakeKey(file: LocalTakeIdentity): string {
  return `local:${file.name}:${file.size}:${file.lastModified}`;
}

export function catalogTakeKey(videoId: string): string {
  return `catalog:${videoId}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function storageKey(sequenceId: string, takeKey: string): string {
  return `${PREFIX}${sequenceId}:${takeKey}`;
}

function readJson(store: Storage, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function loadTakeTiming(
  sequenceId: string,
  takeKey: string
): TakeTiming | null {
  const store = storage();
  if (!store) return null;
  const parsed = TakeTimingSchema.safeParse(
    readJson(store, storageKey(sequenceId, takeKey))
  );
  if (!parsed.success) return null;
  if (
    parsed.data.sequenceId !== sequenceId ||
    parsed.data.takeKey !== takeKey
  ) {
    return null;
  }
  return parsed.data;
}

export function saveTakeTiming(timing: TakeTiming): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      storageKey(timing.sequenceId, timing.takeKey),
      JSON.stringify(timing)
    );
  } catch {
    // Quota or private browsing: the timing still drives this session.
  }
}

function legacyKeys(sequenceId: string, takeKey: string): string[] {
  if (takeKey.startsWith("local:")) {
    return [`${sequenceId}:${takeKey.slice("local:".length)}`];
  }
  if (takeKey.startsWith("catalog:")) {
    return [`${sequenceId}:${takeKey}`];
  }
  return [];
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Converts whatever an older Post Studio saved for this take. A tapped step
 * map wins over a BPM + beat 1 alignment, as it did when both existed.
 */
export function migrateLegacyTakeTiming(input: {
  sequenceId: string;
  takeKey: string;
  durationSeconds: number;
  movesPerPass: number;
  now: number;
}): TakeTiming | null {
  const store = storage();
  if (!store) return null;
  for (const key of legacyKeys(input.sequenceId, input.takeKey)) {
    const stepMap = readJson(store, LEGACY_STEP_MAP_PREFIX + key) as Record<
      string,
      unknown
    > | null;
    if (
      stepMap &&
      isNumberArray(stepMap.beatTimestamps) &&
      stepMap.stepCount === input.movesPerPass
    ) {
      const timing = takeTimingFromLegacyMarks({
        sequenceId: input.sequenceId,
        takeKey: input.takeKey,
        durationSeconds: input.durationSeconds,
        marks: stepMap.beatTimestamps,
        ...(typeof stepMap.endTimestamp === "number"
          ? { endMark: stepMap.endTimestamp }
          : {}),
        now: input.now,
      });
      if (timing) return timing;
    }

    const alignment = readJson(store, LEGACY_BPM_PREFIX + key) as Record<
      string,
      unknown
    > | null;
    if (
      alignment &&
      alignment.key === key &&
      typeof alignment.bpm === "number" &&
      typeof alignment.firstBeatSeconds === "number" &&
      Number.isFinite(alignment.firstBeatSeconds) &&
      alignment.firstBeatSeconds >= 0
    ) {
      const base = createTakeTiming({
        sequenceId: input.sequenceId,
        takeKey: input.takeKey,
        durationSeconds: input.durationSeconds,
        bpm: alignment.bpm,
        now: input.now,
      });
      // A typed tempo and a marked beat 1 are exactly a beat-1 mark with no
      // taps: the grid runs at that tempo to the end of the take.
      const migrated: TakeTiming = {
        ...base,
        sections: [
          {
            ...base.sections[0]!,
            tempo: "locked",
            beatOneSeconds: alignment.firstBeatSeconds,
          },
        ],
      };
      if (TakeTimingSchema.safeParse(migrated).success) return migrated;
    }
  }
  return null;
}

/**
 * The timing to open a take with: what was saved, else a migrated older map,
 * else a fresh unmapped one. The BPM is per take - a slow take is performed
 * at its own tempo - so a fresh one starts at the default and the Timing
 * step offers the tempo its taps suggest.
 */
export function openTakeTiming(input: {
  sequenceId: string;
  takeKey: string;
  durationSeconds: number;
  movesPerPass: number;
  defaultBpm?: number;
  now: number;
}): TakeTiming {
  const saved = loadTakeTiming(input.sequenceId, input.takeKey);
  if (saved) return saved;
  const migrated = migrateLegacyTakeTiming(input);
  if (migrated) {
    saveTakeTiming(migrated);
    return migrated;
  }
  return createTakeTiming({
    sequenceId: input.sequenceId,
    takeKey: input.takeKey,
    durationSeconds: input.durationSeconds,
    bpm: input.defaultBpm,
    now: input.now,
  });
}

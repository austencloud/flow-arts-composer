import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import {
  TakeTimingSchema,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

const PROJECT_PREFIX = "tka:post-studio:project:v2:";
const TIMING_PREFIX = "tka:post-studio:take-timing:v1:";
const BACKUP_FORMAT = "post-studio-draft-v1";

export interface PostStudioStorageRecord {
  key: string;
  value: string;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function projectFrom(value: unknown, sequenceId: string): PostProject | null {
  const wrapped =
    value &&
    typeof value === "object" &&
    "format" in value &&
    value.format === BACKUP_FORMAT &&
    "project" in value
      ? value.project
      : value;
  const parsed = PostProjectSchema.safeParse(wrapped);
  return parsed.success && parsed.data.sequenceId === sequenceId
    ? parsed.data
    : null;
}

function sameMedia(a: PostTake, b: PostTake): boolean {
  return (
    a.durationSeconds === b.durationSeconds &&
    JSON.stringify(a.ref) === JSON.stringify(b.ref)
  );
}

function validTiming(
  value: unknown,
  sequenceId: string,
  take: PostTake
): TakeTiming | null {
  const parsed = TakeTimingSchema.safeParse(value);
  if (!parsed.success) return null;
  const timing = parsed.data;
  const last = timing.sections.at(-1);
  return timing.sequenceId === sequenceId &&
    timing.takeKey === take.takeKey &&
    timing.sections[0]?.startSeconds === 0 &&
    last &&
    Math.abs(last.endSeconds - take.durationSeconds) < 0.001
    ? timing
    : null;
}

function embeddedCandidates(
  project: PostProject,
  sequenceId: string
): Array<{ take: PostTake; timing: TakeTiming }> {
  return project.takes.flatMap((take) => {
    const timing = validTiming(project.timings?.[take.id], sequenceId, take);
    return timing ? [{ take, timing }] : [];
  });
}

function hasMapping(timing: TakeTiming): boolean {
  return (
    Boolean(timing.confirmedAt) ||
    timing.sections.some(
      (section) =>
        section.taps.length > 0 ||
        section.overrides.length > 0 ||
        section.beatOneSeconds !== undefined ||
        section.lastPosition !== undefined ||
        section.tempo === "locked" ||
        section.offsetSeconds !== 0
    )
  );
}

/** Rebuild one post from browser records, using each take's newest valid map. */
export function resolvePostStudioDraft(
  sequenceId: string,
  records: readonly PostStudioStorageRecord[]
): PostProject | null {
  const projects = records.flatMap((record) => {
    const project = projectFrom(parsedJson(record.value), sequenceId);
    return project ? [project] : [];
  });
  const selected = projects.reduce<PostProject | null>(
    (newest, candidate) =>
      !newest || candidate.updatedAt > newest.updatedAt ? candidate : newest,
    null
  );
  if (!selected) return null;

  const embedded = projects.flatMap((project) =>
    embeddedCandidates(project, sequenceId)
  );
  const standalone = records.flatMap((record) => {
    if (!record.key.startsWith(`${TIMING_PREFIX}${sequenceId}:`)) return [];
    const parsed = TakeTimingSchema.safeParse(parsedJson(record.value));
    if (!parsed.success || parsed.data.sequenceId !== sequenceId) return [];
    const key = `${TIMING_PREFIX}${sequenceId}:${parsed.data.takeKey}`;
    if (record.key !== key && record.key !== `${key}:previous`) return [];
    return projects.flatMap((project) =>
      project.takes.flatMap((take) => {
        const timing = validTiming(parsed.data, sequenceId, take);
        return timing ? [{ take, timing }] : [];
      })
    );
  });

  const timings: NonNullable<PostProject["timings"]> = {};
  for (const take of selected.takes) {
    const byKey = new Map<
      string,
      { latest: TakeTiming; hadMapping: boolean }
    >();
    for (const candidate of [...embedded, ...standalone]) {
      if (!sameMedia(take, candidate.take)) continue;
      const rebound = { ...candidate.timing, takeKey: take.takeKey };
      const timing = validTiming(rebound, sequenceId, take);
      if (!timing) continue;
      const sourceKey = candidate.timing.takeKey;
      const group = byKey.get(sourceKey);
      byKey.set(sourceKey, {
        latest:
          !group || timing.updatedAt > group.latest.updatedAt
            ? timing
            : group.latest,
        hadMapping: Boolean(group?.hadMapping) || hasMapping(timing),
      });
    }
    const ownKey = byKey.get(take.takeKey);
    if (ownKey?.hadMapping && !hasMapping(ownKey.latest)) {
      timings[take.id] = ownKey.latest;
      continue;
    }
    for (const group of byKey.values()) {
      const candidate = group.latest;
      const current = timings[take.id];
      if (
        !current ||
        (hasMapping(candidate) && !hasMapping(current)) ||
        (hasMapping(candidate) === hasMapping(current) &&
          candidate.updatedAt > current.updatedAt)
      ) {
        timings[take.id] = candidate;
      }
    }
  }
  return { ...selected, timings };
}

/** A full project value under the same key the browser editor already uses. */
export function projectDraftRecord(
  project: PostProject
): PostStudioStorageRecord {
  return {
    key: `${PROJECT_PREFIX}${project.sequenceId}`,
    value: JSON.stringify(project),
  };
}

export function serializePostStudioBackup(project: PostProject): string {
  return JSON.stringify({ format: BACKUP_FORMAT, project });
}

export function parsePostStudioBackup(
  text: string,
  sequenceId: string
): PostProject | null {
  const value = parsedJson(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    value.format !== BACKUP_FORMAT
  )
    return null;
  return resolvePostStudioDraft(sequenceId, [{ key: "backup", value: text }]);
}

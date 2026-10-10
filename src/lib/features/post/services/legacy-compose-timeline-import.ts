import type {
  TimelineClip,
  TimelineProject,
  TimelineTrack,
} from "#lib/shared/animation-engine/domain/timeline-types.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { getTunnelLayerColors } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementItem } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import {
  createEmptyPostProject,
  PostProjectSchema,
  POST_MIN_ITEM_SECONDS,
  wrapDegrees,
  type PostArrangementItem,
  type PostTrack,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  assertStudioAccount,
  hasStudioDraft,
  persistStudioProject,
  studioAccountId,
} from "./studio-arrangement-projects";

const LEGACY_KEY = "timeline-current-project";
const SOURCE_PREFIX = "studio-arrangement:legacy-compose-timeline:";
const MAX_REPEATS = 500;

function legacyText(): string | null {
  try {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

/** Only detects the old draft. Import remains an explicit, separate action. */
export function hasLegacyComposeTimeline(): boolean {
  const raw = legacyText();
  if (!raw) return false;
  try {
    const project: unknown = JSON.parse(raw);
    return (
      !!project &&
      typeof project === "object" &&
      "tracks" in project &&
      Array.isArray(project.tracks) &&
      project.tracks.some(
        (track: unknown) =>
          !!track &&
          typeof track === "object" &&
          "clips" in track &&
          Array.isArray(track.clips) &&
          track.clips.length > 0
      )
    );
  } catch {
    // Keep a damaged nonempty draft visible so the explicit import can explain why it fails.
    return true;
  }
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(
      `Legacy timeline has an invalid ${label}. Original was kept.`
    );
  return value;
}

function validClip(clip: TimelineClip, track: TimelineTrack): void {
  if (
    !clip ||
    typeof clip !== "object" ||
    typeof clip.id !== "string" ||
    !clip.id
  )
    throw new Error(
      `Legacy track ${track.name} has an invalid clip. Original was kept.`
    );
  if (clip.trackId !== track.id)
    throw new Error(
      `Legacy clip ${clip.id} refers to another track. Original was kept.`
    );
  if (
    !clip.sequence ||
    !Array.isArray(clip.sequence.steps) ||
    clip.sequence.steps.length === 0
  )
    throw new Error(
      `Legacy clip ${clip.id} has no saved sequence. Original was kept.`
    );
  if (
    finite(clip.startTime, `${clip.id} start`) < 0 ||
    finite(clip.duration, `${clip.id} duration`) <= 0
  )
    throw new Error(
      `Legacy clip ${clip.id} has invalid timing. Original was kept.`
    );
  const start = finite(clip.inPoint, `${clip.id} in-point`);
  const end = finite(clip.outPoint, `${clip.id} out-point`);
  if (start < 0 || end > 1 || start >= end)
    throw new Error(
      `Legacy clip ${clip.id} has invalid trim points. Original was kept.`
    );
  if (
    finite(clip.playbackRate, `${clip.id} speed`) < 0.25 ||
    clip.playbackRate > 4
  )
    throw new Error(
      `Legacy clip ${clip.id} has a speed Studio cannot play. Original was kept.`
    );
  if (finite(clip.opacity, `${clip.id} opacity`) < 0 || clip.opacity > 1)
    throw new Error(
      `Legacy clip ${clip.id} has invalid opacity. Original was kept.`
    );
  if (
    clip.trailSettings &&
    JSON.stringify(clip.trailSettings) !==
      JSON.stringify(DEFAULT_TRAIL_SETTINGS)
  )
    throw new Error(
      `Legacy clip ${clip.id} uses trail settings Studio cannot import. Original was kept.`
    );
  if (clip.loop && (!Number.isInteger(clip.loopCount) || clip.loopCount < 0))
    throw new Error(
      `Legacy clip ${clip.id} has invalid repeats. Original was kept.`
    );
  if (!clip.loop && clip.loopCount > 0)
    throw new Error(
      `Legacy clip ${clip.id} has repeats without looping. Original was kept.`
    );
}

function repeats(clip: TimelineClip, bpm: number): number {
  if (!clip.loop) return 1;
  if (clip.loopCount > 0) return clip.loopCount + 1;
  const naturalSeconds =
    ((((clip.sequence.steps.length + 1) * 60) / bpm) *
      (clip.outPoint - clip.inPoint)) /
    clip.playbackRate;
  return Math.max(1, Math.ceil(clip.duration / naturalSeconds));
}

function snapshotForClip(
  clip: TimelineClip,
  repeatCount: number
): ArrangementSnapshot {
  // The old TimelinePreview includes one beat for the start placement.
  const beats = clip.sequence.steps.length + 1;
  const segmentSeconds = clip.duration / repeatCount;
  const bpm =
    (beats * 60 * (clip.outPoint - clip.inPoint)) /
    (segmentSeconds * clip.playbackRate);
  return validateArrangementSnapshot({
    schemaVersion: 1,
    cells: [
      {
        id: "cell-0-0",
        row: 0,
        col: 0,
        beatOffset: 0,
        colSpan: 1,
        rowSpan: 1,
        mediaType: "animation",
        layers: [
          {
            sequence: structuredClone(clip.sequence),
            beatOffset: 0,
            propColors: getTunnelLayerColors(0),
            transformStack: [],
          },
        ],
      },
    ],
    gridRows: 1,
    gridCols: 1,
    bpm,
    skipStartPlacement: false,
  });
}

function itemsForClip(
  clip: TimelineClip,
  track: TimelineTrack,
  bpm: number
): PostArrangementItem[] {
  validClip(clip, track);
  const count = repeats(clip, bpm);
  if (count > MAX_REPEATS)
    throw new Error(
      `Legacy clip ${clip.id} has too many repeats for Studio. Original was kept.`
    );
  if (clip.duration / count < POST_MIN_ITEM_SECONDS)
    throw new Error(
      `Legacy clip ${clip.id} has repeats shorter than Studio can play. Original was kept.`
    );
  const snapshot = snapshotForClip(clip, count);
  const sourceDuration =
    (clip.duration * clip.playbackRate) /
    count /
    (clip.outPoint - clip.inPoint);
  const duration = clip.duration / count;
  return Array.from({ length: count }, (_, index) => ({
    ...createArrangementItem(
      snapshot,
      `${clip.id}-repeat-${index + 1}`,
      clip.startTime + index * duration,
      false
    ),
    label: (clip.label || track.name || "Animation").slice(0, 60),
    pinnedStart: true,
    duration,
    sourceIn: clip.inPoint * sourceDuration,
    sourceOut: clip.outPoint * sourceDuration,
    speed: clip.playbackRate,
    opacity: clip.opacity,
    box: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      turn: wrapDegrees(finite(clip.rotation, `${clip.id} rotation`)),
    },
  }));
}

function parseLegacyTimeline(raw: string): TimelineProject {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Legacy Compose timeline is malformed. Original was kept.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !("tracks" in value) ||
    !Array.isArray(value.tracks)
  )
    throw new Error(
      "Legacy Compose timeline is incomplete. Original was kept."
    );
  const project = value as TimelineProject;
  if (project.audio?.hasAudio)
    throw new Error(
      "Legacy timeline audio cannot be imported into Studio. Original was kept."
    );
  if (finite(project.defaultBpm, "BPM") <= 0)
    throw new Error("Legacy timeline has invalid BPM. Original was kept.");
  if (
    project.tracks.some(
      (track) =>
        !track ||
        typeof track !== "object" ||
        !["animation", "overlay", "background"].includes(track.type)
    )
  )
    throw new Error(
      "Legacy timeline has Stage or camera tracks Studio cannot import. Original was kept."
    );
  if (project.tracks.some((track) => !Array.isArray(track.clips)))
    throw new Error("Legacy timeline has an invalid track. Original was kept.");
  return project;
}

/** Imports a separate local Studio copy, retaining the old timeline unchanged. */
export async function importLegacyComposeTimeline(): Promise<string> {
  const uid = studioAccountId();
  const raw = legacyText();
  if (!raw)
    throw new Error("No legacy Compose timeline was found on this device.");
  const legacy = parseLegacyTimeline(raw);
  const sourceId = `${SOURCE_PREFIX}${legacy.id}`;
  if (await hasStudioDraft(sourceId, uid)) return sourceId;
  assertStudioAccount(uid);
  const tracks = [...legacy.tracks].sort((a, b) => b.order - a.order);
  const solo = tracks.some((track) => track.solo);
  const seen = new Set<string>();
  const postTracks: PostTrack[] = [];
  let firstSequence: SequenceData | null = null;
  for (const track of tracks) {
    for (const clip of track.clips) {
      validClip(clip, track);
      if (seen.has(clip.id))
        throw new Error(
          `Legacy timeline repeats clip ID ${clip.id}. Original was kept.`
        );
      seen.add(clip.id);
      const items = itemsForClip(clip, track, legacy.defaultBpm);
      firstSequence ??= clip.sequence;
      postTracks.push({
        id: `legacy-track-${track.id}-${clip.id}`,
        hidden:
          !!track.muted ||
          track.visible === false ||
          !!clip.muted ||
          (solo && !track.solo),
        locked: !!track.locked || !!clip.locked,
        items,
      });
    }
  }
  if (!firstSequence)
    throw new Error(
      "Legacy Compose timeline has no animation clips to import."
    );
  const name = legacy.name || "Legacy Compose timeline";
  const source = structuredClone({
    ...firstSequence,
    id: sourceId,
    name,
    displayName: name,
  }) as SequenceData;
  const project = PostProjectSchema.parse({
    ...createEmptyPostProject({ sequenceId: sourceId, now: Date.now() }),
    tracks: [
      { id: "main", hidden: false, locked: false, items: [] },
      ...postTracks,
    ],
  });
  assertStudioAccount(uid);
  await persistStudioProject(source, project, uid);
  return sourceId;
}

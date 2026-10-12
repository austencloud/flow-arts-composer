import {
  POST_BOX,
  type PostCanvasRatio,
  type PostProject,
} from "@austencloud/video-editor/core";
import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { arrangementDurationSeconds } from "#lib/shared/media-composition/domain/arrangement-timing.js";
import {
  createEmptyPostProject,
  type PostArrangementItem,
} from "#lib/shared/post-studio-plugin/index.js";

export {
  arrangementBeatAt,
  arrangementDurationSeconds,
} from "#lib/shared/media-composition/domain/arrangement-timing.js";

export function arrangementCanvasRatio(
  snapshot: ArrangementSnapshot
): PostCanvasRatio {
  const ratio = snapshot.gridCols / snapshot.gridRows;
  const options: { name: PostCanvasRatio; ratio: number }[] = [
    { name: "9:16", ratio: 9 / 16 },
    { name: "3:4", ratio: 3 / 4 },
    { name: "4:5", ratio: 4 / 5 },
    { name: "1:1", ratio: 1 },
    { name: "4:3", ratio: 4 / 3 },
    { name: "16:9", ratio: 16 / 9 },
  ];
  return options.reduce((best, next) =>
    Math.abs(next.ratio - ratio) < Math.abs(best.ratio - ratio) ? next : best
  ).name;
}

export function createArrangementItem(
  snapshot: ArrangementSnapshot,
  id: string,
  start = 0,
  main = true
): PostArrangementItem {
  const valid = validateArrangementSnapshot(snapshot);
  const duration = arrangementDurationSeconds(valid);
  return {
    id,
    kind: "arrangement",
    snapshot: valid,
    start,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    speed: 1,
    box: { ...POST_BOX.full },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    ...(main ? {} : { pinnedStart: true }),
  };
}

export function createArrangementProject(
  snapshot: ArrangementSnapshot,
  sequenceId: string,
  now = Date.now()
): PostProject {
  const project = createEmptyPostProject({ sequenceId, now });
  return {
    ...project,
    canvas: arrangementCanvasRatio(snapshot),
    tracks: [
      {
        ...project.tracks[0]!,
        items: [createArrangementItem(snapshot, "arrangement-1")],
      },
    ],
  };
}

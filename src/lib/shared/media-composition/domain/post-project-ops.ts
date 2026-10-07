import {
  POST_BACKGROUNDS,
  POST_CANVAS_RATIOS,
  findItem,
  type PostAnimationItem,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTake,
  addTitlesItem,
  addTunnelHook,
  appendVideoClip,
  deleteItem,
  findTunnelHook,
  lineUpTunnelHook,
  removeTake,
  removeTunnelHook,
  setProjectBackground,
  setProjectCanvas,
  setTunnelHookBackdropFrame,
  setTunnelHookSpeed,
  trimItem,
  updateItem,
  type EditContext,
  type PostItemPatch,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import {
  PostTakeSchema,
  takeFileKey,
} from "$lib/shared/media-composition/domain/post-plan";
import { EASING_PRESETS } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  TunnelHookSchema,
  type TunnelHook,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import {
  resolvePostTime,
  resolveTrackTime,
  type PostTimeRef,
} from "$lib/shared/media-composition/domain/music-grid";
import {
  removeMusic,
  setMusic,
  syncedSourceIn,
  updateMusic,
  type MusicPatch,
} from "$lib/shared/media-composition/domain/post-music-edits";

/**
 * Named edits for saved posts, in a form a command line can send. Each op is
 * one of the timeline's own pure edits, so a scripted change lays out and
 * validates exactly like the same change made by hand.
 *
 * An item is named by id, or by `hook` (the animation with the opening), `animations`
 * (every live animation) or `all`.
 */

type Speed = NonNullable<TunnelHook["speed"]>;

/** What every music edit says when the post has none. */
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";

/** The settings a `music` edit may change. */
const MUSIC_OP_KEYS = [
  "startSeconds",
  "sourceInSeconds",
  "sourceOutSeconds",
  "gain",
  "fadeInSeconds",
  "fadeOutSeconds",
  "label",
  "artist",
  "license",
  "bpm",
  "downbeatSeconds",
  "beatsPerBar",
] as const;

/**
 * A `music` edit: the music's own patch, except that its three times may also
 * name a bar. `startSeconds` is on the post's clock; `sourceInSeconds` and
 * `sourceOutSeconds` are in the music file's own seconds.
 */
export type MusicOpPatch = Omit<
  MusicPatch,
  "startSeconds" | "sourceInSeconds" | "sourceOutSeconds"
> & {
  startSeconds?: PostTimeRef;
  sourceInSeconds?: PostTimeRef;
  sourceOutSeconds?: PostTimeRef;
};

export type PostProjectOp =
  | {
      op: "add-hook";
      seconds?: number;
      fold?: number;
      mirror?: boolean;
      speed?: string | number[];
    }
  | { op: "remove-hook" }
  | { op: "line-up-hook" }
  | { op: "add-titles"; spoken?: string; at?: PostTimeRef }
  | { op: "hook-speed"; speed: string | number[] }
  | { op: "hook-frame"; zoom?: number; x?: number; y?: number; whole?: boolean }
  | { op: "appearance"; item?: string; set: Record<string, unknown> }
  | { op: "item"; item: string; patch: PostItemPatch }
  | { op: "trim"; item: string; edge: "start" | "end"; seconds: PostTimeRef }
  | { op: "delete"; item: string }
  | { op: "canvas"; canvas: string }
  | { op: "background"; background: string }
  | {
      op: "add-take";
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
      label?: string;
      /** Also put the whole take on the end of the main track. */
      append?: boolean;
    }
  | { op: "remove-take"; take: string }
  | {
      op: "add-music";
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
      label?: string;
      artist?: string;
      license?: string;
    }
  | ({ op: "music" } & MusicOpPatch)
  | { op: "remove-music" }
  | {
      op: "sync-to-music";
      item: string;
      /** The music's own time minus the take's own time at one moment, as align-take reports it. */
      offsetSeconds: number;
    };

/** The curve names the hook's speed panel offers, plus `default` for the original ease. */
export const POST_OP_SPEED_NAMES = [
  ...Object.keys(EASING_PRESETS).filter((id) => id !== "hold"),
  "default",
] as const;

function parseSpeed(value: string | number[]): Speed | null {
  if (Array.isArray(value)) return validSpeed(value);
  if (value === "default") return null;
  const preset = (EASING_PRESETS as Record<string, unknown>)[value];
  if (Array.isArray(preset)) return validSpeed(preset);
  if (/^[-\d.,\s]+$/.test(value)) return validSpeed(value.split(","));
  throw new Error(
    `Unknown speed "${value}". Use ${POST_OP_SPEED_NAMES.join(", ")} or x1,y1,x2,y2.`
  );
}

function validSpeed(raw: unknown[]): Speed {
  const numbers = raw.map(Number);
  const parsed = TunnelHookSchema.shape.speed.safeParse(numbers);
  if (!parsed.success || !parsed.data)
    throw new Error(
      "A speed curve is four numbers x1,y1,x2,y2 with x between 0 and 1 and y between -1 and 2."
    );
  return parsed.data;
}

function itemIds(project: PostProject, selector: string): string[] {
  const all: PostItem[] = project.tracks.flatMap((track) => track.items);
  if (selector === "all") return all.map((item) => item.id);
  if (selector === "animations")
    return all.filter((item) => item.kind === "animation").map((i) => i.id);
  if (selector === "hook") {
    const hook = findTunnelHook(project);
    if (!hook) throw new Error("This post has no opening tunnel.");
    return [hook.id];
  }
  if (!all.some((item) => item.id === selector))
    throw new Error(`No item "${selector}" in this post.`);
  return [selector];
}

/** A take's default name: its file name without the extension. */
function mediaLabel(url: string): string {
  const last = url.split("/").pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // A name that does not decode stays as written.
  }
  return name.replace(/\.[^.]+$/, "").slice(0, 120);
}

/** Slack for sums of seconds that should meet exactly. */
const SYNC_SLACK = 1e-6;

function secondsText(value: number): string {
  return `${Math.round(value * 1000) / 1000} s`;
}

/** Refuses a `music` edit's unknown settings and wrong kinds of value. */
function checkedMusicOp(op: { op: "music" } & MusicOpPatch): MusicOpPatch {
  const { op: _op, ...patch } = op;
  for (const [key, value] of Object.entries(patch)) {
    if (!(MUSIC_OP_KEYS as readonly string[]).includes(key))
      throw new Error(
        `Unknown music setting "${key}". Use ${MUSIC_OP_KEYS.join(", ")}.`
      );
    if (value === undefined) continue;
    switch (key) {
      case "startSeconds":
      case "sourceInSeconds":
      case "sourceOutSeconds":
        // These may name a bar; they are checked where they are read.
        break;
      case "label":
        if (typeof value !== "string") throw new Error("label must be text.");
        break;
      case "artist":
      case "license":
        if (value !== null && typeof value !== "string")
          throw new Error(`${key} must be text, or null to remove it.`);
        break;
      case "bpm":
        if (
          value !== null &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw new Error(
            "bpm must be a number, or null to remove the beat grid."
          );
        break;
      default:
        if (typeof value !== "number" || !Number.isFinite(value))
          throw new Error(`${key} must be a number.`);
    }
  }
  return patch;
}

function applyOp(
  project: PostProject,
  op: PostProjectOp,
  ctx: EditContext
): PostProject {
  switch (op.op) {
    case "add-hook": {
      const hook: TunnelHook = {
        fold: 8,
        mirror: false,
        speed: [0, 0, 0.58, 1],
      };
      if (op.fold !== undefined) {
        const parsed = TunnelHookSchema.shape.fold.safeParse(op.fold);
        if (!parsed.success) throw new Error("fold must be 2, 4 or 8.");
        hook.fold = parsed.data;
      }
      if (op.mirror !== undefined) hook.mirror = op.mirror;
      if (op.speed !== undefined) {
        const speed = parseSpeed(op.speed);
        if (speed) hook.speed = speed;
        else delete hook.speed;
      }
      const result = addTunnelHook(project, ctx, {
        ...(op.seconds !== undefined ? { seconds: op.seconds } : {}),
        hook,
      });
      if (!result)
        throw new Error(
          findTunnelHook(project)
            ? "This post already has an opening tunnel."
            : "The opening tunnel needs a live animation in the post to open."
        );
      return result.project;
    }
    case "remove-hook":
      return removeTunnelHook(project, ctx);
    case "line-up-hook": {
      if (!findTunnelHook(project))
        throw new Error("This post has no opening tunnel.");
      return lineUpTunnelHook(project, ctx);
    }
    case "add-titles": {
      const result = addTitlesItem(project, ctx, {
        ...(op.at !== undefined
          ? { at: resolvePostTime(op.at, project.music, "at") }
          : {}),
        ...(op.spoken !== undefined ? { spoken: op.spoken } : {}),
      });
      if (!result) throw new Error("The titles could not be placed.");
      return result.project;
    }
    case "hook-frame": {
      const hook = findTunnelHook(project);
      if (!hook?.tunnelHook?.backdrop)
        throw new Error("This post has no opening tunnel over its footage.");
      if (op.whole) return setTunnelHookBackdropFrame(project, null, ctx);
      const current = hook.tunnelHook.backdropFrame ?? {
        zoom: 1,
        x: 0.5,
        y: 0.5,
      };
      const parsed = TunnelHookSchema.shape.backdropFrame.safeParse({
        zoom: op.zoom ?? current.zoom,
        x: op.x ?? current.x,
        y: op.y ?? current.y,
      });
      if (!parsed.success || !parsed.data)
        throw new Error("zoom is 1 to 3; x and y are 0 to 1.");
      return setTunnelHookBackdropFrame(project, parsed.data, ctx);
    }
    case "hook-speed": {
      if (!findTunnelHook(project))
        throw new Error("This post has no opening tunnel.");
      return setTunnelHookSpeed(project, parseSpeed(op.speed), ctx);
    }
    case "appearance": {
      let next = project;
      for (const id of itemIds(project, op.item ?? "animations")) {
        const item = next.tracks
          .flatMap((track) => track.items)
          .find((candidate) => candidate.id === id);
        if (item?.kind !== "animation") continue;
        const merged: Record<string, unknown> = {
          ...(item.animationAppearance ?? {}),
        };
        for (const [key, value] of Object.entries(op.set)) {
          if (value === null) delete merged[key];
          else merged[key] = value;
        }
        next = updateItem(
          next,
          id,
          {
            animationAppearance:
              merged as PostAnimationItem["animationAppearance"],
          },
          ctx
        );
      }
      return next;
    }
    case "item": {
      let next = project;
      for (const id of itemIds(project, op.item))
        next = updateItem(next, id, op.patch, ctx);
      return next;
    }
    case "trim": {
      if (op.edge !== "start" && op.edge !== "end")
        throw new Error("edge must be start or end.");
      return trimItem(
        project,
        itemIds(project, op.item)[0]!,
        op.edge,
        resolvePostTime(op.seconds, project.music, "seconds"),
        ctx
      );
    }
    case "delete": {
      let next = project;
      for (const id of itemIds(project, op.item))
        next = deleteItem(next, id, ctx);
      return next;
    }
    case "canvas": {
      const canvas = POST_CANVAS_RATIOS.find((ratio) => ratio === op.canvas);
      if (!canvas)
        throw new Error(
          `canvas must be one of ${POST_CANVAS_RATIOS.join(", ")}.`
        );
      return setProjectCanvas(project, canvas, ctx);
    }
    case "background": {
      const background = POST_BACKGROUNDS.find(
        (value) => value === op.background
      );
      if (!background)
        throw new Error(
          `background must be one of ${POST_BACKGROUNDS.join(", ")}.`
        );
      return setProjectBackground(project, background, ctx);
    }
    case "add-take": {
      if (!isFeatureVideoMediaUrl(op.url))
        throw new Error(
          "A take's url must be a feature video media url (/api/dev/feature-videos/<slug>/media/...)."
        );
      if (
        typeof op.durationSeconds !== "number" ||
        !Number.isFinite(op.durationSeconds) ||
        op.durationSeconds <= 0
      )
        throw new Error("durationSeconds must be a positive number.");
      const ref = { kind: "linked" as const, url: op.url };
      const takeKey = takeFileKey(ref);
      const existing = project.takes.find((take) => take.takeKey === takeKey);
      const label = typeof op.label === "string" ? op.label.trim() : "";
      const parsed = PostTakeSchema.safeParse({
        id: existing?.id ?? `take-${project.takes.length + 1}`,
        label: label || existing?.label || mediaLabel(op.url),
        ref,
        takeKey,
        durationSeconds: op.durationSeconds,
      });
      if (!parsed.success)
        throw new Error("A take label is 1 to 120 characters.");
      const next = addTake(project, parsed.data, ctx);
      if (!op.append) return next;
      const added = next.takes.find((take) => take.takeKey === takeKey);
      const placed = added ? appendVideoClip(next, added.id, ctx) : null;
      if (!placed)
        throw new Error("The take could not be placed on the timeline.");
      return placed.project;
    }
    case "remove-take": {
      if (!project.takes.some((take) => take.id === op.take))
        throw new Error(`No take "${op.take}" in this post.`);
      return removeTake(project, op.take, ctx);
    }
    case "add-music": {
      if (!isFeatureVideoMediaUrl(op.url))
        throw new Error(
          "Music's url must be a feature video media url (/api/dev/feature-videos/<slug>/media/...)."
        );
      if (
        typeof op.durationSeconds !== "number" ||
        !Number.isFinite(op.durationSeconds) ||
        op.durationSeconds <= 0
      )
        throw new Error("durationSeconds must be a positive number.");
      const label = typeof op.label === "string" ? op.label.trim() : "";
      const same = project.music?.url === op.url ? project.music : undefined;
      return setMusic(
        project,
        {
          url: op.url,
          durationSeconds: op.durationSeconds,
          label: label || same?.label || mediaLabel(op.url),
          ...(op.artist !== undefined ? { artist: op.artist } : {}),
          ...(op.license !== undefined ? { license: op.license } : {}),
        },
        ctx
      );
    }
    case "music": {
      if (!project.music) throw new Error(NO_MUSIC);
      const {
        startSeconds,
        sourceInSeconds,
        sourceOutSeconds,
        bpm,
        downbeatSeconds,
        beatsPerBar,
        ...rest
      } = checkedMusicOp(op);
      if (
        (downbeatSeconds !== undefined || beatsPerBar !== undefined) &&
        !project.music.grid &&
        (bpm === undefined || bpm === null)
      )
        throw new Error(
          "A downbeat and beats per bar need a tempo. Add bpm to the same edit."
        );
      // The grid changes first, so a bar named in the same edit counts on it.
      const regridded = updateMusic(
        project,
        { bpm, downbeatSeconds, beatsPerBar },
        ctx
      );
      const music = regridded.music!;
      return updateMusic(
        regridded,
        {
          ...rest,
          ...(startSeconds !== undefined
            ? {
                startSeconds: resolvePostTime(
                  startSeconds,
                  music,
                  "startSeconds"
                ),
              }
            : {}),
          ...(sourceInSeconds !== undefined
            ? {
                sourceInSeconds: resolveTrackTime(
                  sourceInSeconds,
                  music.grid,
                  "sourceInSeconds"
                ),
              }
            : {}),
          ...(sourceOutSeconds !== undefined
            ? {
                sourceOutSeconds: resolveTrackTime(
                  sourceOutSeconds,
                  music.grid,
                  "sourceOutSeconds"
                ),
              }
            : {}),
        },
        ctx
      );
    }
    case "remove-music":
      if (!project.music) throw new Error(NO_MUSIC);
      return removeMusic(project, ctx);
    case "sync-to-music": {
      const music = project.music;
      if (!music) throw new Error(NO_MUSIC);
      if (
        typeof op.offsetSeconds !== "number" ||
        !Number.isFinite(op.offsetSeconds)
      )
        throw new Error("offsetSeconds must be a number.");
      const clip = findItem(project, op.item)?.item;
      if (!clip) throw new Error(`No item "${op.item}" in this post.`);
      if (clip.kind !== "video")
        throw new Error(`"${op.item}" is not a video clip.`);
      if (Math.abs(clip.speed - 1) > 1e-9)
        throw new Error(
          "Only a clip at normal speed can play in time with the music. Set its speed to 1 first."
        );
      const sourceIn = syncedSourceIn(music, clip, op.offsetSeconds);
      const sourceOut = sourceIn + (clip.sourceOut - clip.sourceIn);
      const takeSeconds =
        project.takes.find((take) => take.id === clip.takeId)
          ?.durationSeconds ?? Infinity;
      if (sourceIn < -SYNC_SLACK)
        throw new Error(
          `In time with the music, this clip would start ${secondsText(-sourceIn)} before its take does. Move the clip later, or trim its start.`
        );
      if (sourceOut > takeSeconds + SYNC_SLACK)
        throw new Error(
          `In time with the music, this clip would run ${secondsText(sourceOut - takeSeconds)} past the end of its take. Move the clip earlier, or trim its end.`
        );
      return updateItem(
        project,
        clip.id,
        {
          sourceIn: Math.max(0, sourceIn),
          sourceOut: Math.min(sourceOut, takeSeconds),
        },
        ctx
      );
    }
    default:
      throw new Error(`Unknown edit "${(op as { op?: unknown }).op}".`);
  }
}

/** Applies the ops in order. Throws, naming the failing op, before returning anything partial. */
export function applyPostProjectOps(
  project: PostProject,
  ops: PostProjectOp[],
  ctx: EditContext
): PostProject {
  if (!Array.isArray(ops) || ops.length === 0)
    throw new Error("Send at least one edit.");
  let next = project;
  ops.forEach((op, index) => {
    try {
      next = applyOp(next, op, ctx);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Edit ${index + 1} (${op?.op}): ${message}`);
    }
  });
  return next;
}

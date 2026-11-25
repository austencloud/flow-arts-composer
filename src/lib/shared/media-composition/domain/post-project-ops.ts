import {
  POST_BACKGROUNDS,
  POST_CANVAS_RATIOS,
  findItem,
  type PostItem,
  type PostProject,
  PostTakeSchema,
  takeFileKey,
  TunnelHookSchema,
  type TunnelHook,
  resolvePostTime,
  resolveTrackTime,
  type PostTimeRef,
  POST_MUSIC_LENGTH_SLACK,
  POST_MUSIC_MAX_BEATS_PER_BAR,
  POST_MUSIC_MAX_GAIN,
  POST_MUSIC_MAX_SECONDS,
  type PostMusic,
  EASING_PRESETS,
  addTake,
  appendCardClip,
  appendVideoClip,
  deleteItem,
  relinkTake,
  removeTake,
  setProjectAudio,
  setProjectBackground,
  setProjectCanvas,
  trimItem,
  updateItem,
  type EditContext,
  type PostItemPatch,
  POST_MAX_HOLD_SECONDS,
  POST_MUSIC_MIN_SECONDS,
  removeMusic,
  setMusic,
  syncedSourceIn,
  updateMusic,
  type MusicPatch,
  beatSeconds,
  addOverlayItem,
  POST_MAX_TEXT_LENGTH,
} from "@austencloud/video-editor/core";
import {
  POST_QR_URL_RULE,
  POST_TITLES_ENTERS,
  POST_TITLES_LEAVES,
  POST_TITLES_SPOKEN_SIZE_MAX,
  POST_TITLES_SPOKEN_SIZE_MIN,
  PostTitlesLitSchema,
  CARD_QR_MAX_CAPTION_LENGTH,
  POST_CARD_HEADER_TITLES,
  PostCardEnterSchema,
  PostCardQrExitSchema,
  PostCardRingSchema,
  isPostCardQrUrl,
  type PostAnimationItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  addTitlesItem,
  addTunnelHook,
  findTunnelHook,
  landTitlesOnCard,
  lineUpTunnelHook,
  removeTunnelHook,
  setTunnelHookBackdropFrame,
  setTunnelHookSpeed,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import {
  FLY_DEFAULT_SECONDS,
  addFlashItem,
  flyIntoNextEdit,
} from "#lib/shared/media-composition/domain/post-flash-join-edits.js";
import {
  FLASH_MAX_FADE_SECONDS,
  FLASH_MAX_STRENGTH,
  FLASH_MIN_FADE_SECONDS,
  FLASH_MIN_STRENGTH,
} from "#lib/shared/media-composition/domain/flash.js";
import {
  keyframeEdit,
  moveItemEdit,
  type KeyframeOp,
  type MoveOp,
} from "#lib/shared/media-composition/domain/post-keyframe-ops.js";
import {
  CREDIT_MAX_LEAD_LENGTH,
  addCreditItem,
} from "#lib/shared/media-composition/domain/credit.js";
import {
  addLoopRunItem,
  type LoopRunInit,
} from "#lib/shared/media-composition/domain/loop-run-item.js";
import { isFeatureVideoMediaUrl } from "#lib/shared/media-composition/domain/feature-video.js";
import {
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
} from "#lib/shared/media-composition/domain/take-timing.js";
import {
  WalkthroughCaptureSchema,
  WalkthroughScriptSchema,
  buildWalkthrough,
} from "#lib/shared/media-composition/domain/post-walkthrough.js";
import { PostAnimationSplitSchema } from "#lib/shared/media-composition/domain/post-animation-split.js";
import { PostCometTrailsSchema } from "./comet-trails";
import { PostPanelLiftSchema } from "#lib/shared/media-composition/domain/post-panel-lift.js";
import { PostBarFillSchema } from "#lib/shared/media-composition/domain/post-bar-fill.js";

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
      /** The animation that opens on the tunnel; the first in lane order if left out. */
      item?: string;
      seconds?: number;
      fold?: number;
      mirror?: boolean;
      speed?: string | number[];
    }
  | { op: "remove-hook" }
  | { op: "line-up-hook" }
  | { op: "add-titles"; spoken?: string; at?: PostTimeRef }
  | {
      op: "add-flash";
      /** The hit: where the flash starts. */
      at?: PostTimeRef;
      strength?: number;
      fade?: number;
      marks?: boolean;
    }
  | {
      op: "add-credit";
      at?: PostTimeRef;
      /** The small line over the wordmark; empty draws the wordmark alone. */
      lead?: string;
      duration?: number;
    }
  | {
      op: "add-text";
      /** One line of words, as the core text clip holds it. */
      text: string;
      at?: PostTimeRef;
      duration?: number;
      size?: "s" | "m" | "l";
      /** Where it sits, as shares of the frame; absent is the core's own overlay box. */
      box?: { x: number; y: number; width: number; height: number };
    }
  | ({
      op: "add-loop";
      at?: PostTimeRef;
    } & Omit<LoopRunInit, "at">)
  | {
      op: "fly-into-next";
      item: string;
      /** The flight and its cross-fade, in seconds. */
      seconds?: number;
    }
  | KeyframeOp
  | MoveOp
  | {
      op: "land-titles";
      /** The titles clip; defaults to the post's only one. */
      titles?: string;
      /** The card; defaults to the first card on screen at or after `at`. */
      card?: string;
      /** Post seconds the glide starts; defaults to the card's start. */
      at?: PostTimeRef;
      /** Where the card draws its header word, as shares of the card's own box. */
      word: { x: number; y: number; width: number; height: number };
    }
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
      op: "relink-take";
      take: string;
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
    }
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
      op: "add-card";
      label?: string;
      /** The link the card's QR shows; it also puts the QR in the card's info cell. */
      qrUrl?: string;
      fadeIn?: number;
    }
  | { op: "sound"; sound: PostProject["audio"] }
  | {
      op: "sync-to-music";
      item: string;
      /** The music's own time minus the take's own time at one moment, as align-take reports it. */
      offsetSeconds: number;
    }
  | {
      op: "build-walkthrough";
      /** The take the recording plays in. */
      take: string;
      /** The recording's capture.json: its clicks and page size. */
      capture: unknown;
      /** The lines file (see post-walkthrough.ts). */
      script: unknown;
      /** Build only this chapter. */
      chapter?: string;
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

/**
 * Refuses a `music` edit's numbers that the music cannot take. The panel
 * fits such a value into range as you drag; a command or an agent that sent
 * one made a mistake (bpm 1280 for 128), so it hears about it and nothing
 * changes.
 */
/**
 * A titles clip's `leave`, `enter` and `lit`, checked before the edit:
 * the edit itself passes over a value it cannot use, and a script should hear
 * why.
 */
function refuseTitlesValues(
  project: PostProject,
  ids: readonly string[],
  patch: PostItemPatch | undefined
): void {
  const { leave, lit, quiet, spokenSize, spokenSizeSmall } = (patch ??
    {}) as Record<string, unknown>;
  // An enter given as an object is a card's arrival; see refuseCardValues.
  const raw = (patch ?? {}) as Record<string, unknown>;
  const hasTitles = ids.some(
    (id) => findItem(project, id)?.item.kind === "titles"
  );
  // A null enter clears a card's arrival as well as a titles clip's.
  const enter =
    (raw.enter !== null && typeof raw.enter === "object") ||
    (raw.enter === null && !hasTitles)
      ? undefined
      : raw.enter;
  if (
    leave === undefined &&
    enter === undefined &&
    lit === undefined &&
    quiet === undefined &&
    spokenSize === undefined &&
    spokenSizeSmall === undefined
  )
    return;
  if (!hasTitles)
    throw new Error(
      "Only a titles clip takes leave, enter, lit, quiet, spokenSize or spokenSizeSmall."
    );
  for (const [key, value] of [
    ["spokenSize", spokenSize],
    ["spokenSizeSmall", spokenSizeSmall],
  ] as const) {
    if (value === undefined || value === null) continue;
    if (
      typeof value !== "number" ||
      !(
        value >= POST_TITLES_SPOKEN_SIZE_MIN &&
        value <= POST_TITLES_SPOKEN_SIZE_MAX
      )
    )
      throw new Error(
        `${key} must be a number from ${POST_TITLES_SPOKEN_SIZE_MIN} to ${POST_TITLES_SPOKEN_SIZE_MAX}, or null to remove it.`
      );
  }
  if (
    leave !== undefined &&
    !(POST_TITLES_LEAVES as readonly unknown[]).includes(leave)
  )
    throw new Error(`leave must be one of ${POST_TITLES_LEAVES.join(", ")}.`);
  if (
    enter !== undefined &&
    enter !== null &&
    !(POST_TITLES_ENTERS as readonly unknown[]).includes(enter)
  )
    throw new Error(`enter must be one of ${POST_TITLES_ENTERS.join(", ")}.`);
  if (lit !== undefined && lit !== null) {
    if (!PostTitlesLitSchema.safeParse(lit).success)
      throw new Error(
        "lit must be { from, to }: seconds from the clip's start, to after from."
      );
  }
  if (quiet !== undefined && quiet !== null) {
    if (!PostTitlesLitSchema.safeParse(quiet).success)
      throw new Error(
        "quiet must be { from, to }: seconds from the clip's start, to after from."
      );
  }
}

/**
 * A card's ending settings (`enter` as an object, `ring`, `qrExit`,
 * `headerTitle`), checked before the edit for the same reason.
 */
function refuseCardValues(
  project: PostProject,
  ids: readonly string[],
  patch: PostItemPatch | undefined
): void {
  const raw = (patch ?? {}) as Record<string, unknown>;
  const enter =
    raw.enter !== null && typeof raw.enter === "object" ? raw.enter : undefined;
  const { ring, qrExit, headerTitle } = raw;
  if (
    enter === undefined &&
    ring === undefined &&
    qrExit === undefined &&
    headerTitle === undefined
  )
    return;
  if (!ids.some((id) => findItem(project, id)?.item.kind === "card"))
    throw new Error(
      "Only a card takes enter { style }, ring, qrExit or headerTitle."
    );
  if (enter !== undefined && !PostCardEnterSchema.safeParse(enter).success)
    throw new Error(
      'enter must be { style: "cascade", step?, each? }: step 0 to 1 s, each 0.01 to 3 s.'
    );
  if (ring !== undefined && ring !== null) {
    const parsed = PostCardRingSchema.safeParse(ring);
    if (!parsed.success)
      throw new Error(
        "ring must be { at, every?, late? }: at in seconds from the clip's start (before 0 means already under way), every 0.1 to 30 s, late 0 to 1 s."
      );
    const r = parsed.data;
    if (r.every === undefined) {
      const grid = project.music?.grid;
      if (!grid || !(beatSeconds(grid) > 0))
        throw new Error(
          "ring needs every: this post's music has no beat grid to step on."
        );
    }
  }
  if (qrExit !== undefined && qrExit !== null) {
    if (!PostCardQrExitSchema.safeParse(qrExit).success)
      throw new Error(
        `qrExit must be { at, seconds?, to?, caption?, captionFace?, captionSize?, plate?, backdrop? }: at in seconds from the clip's start (before 0 means already under way), seconds 0.05 to 10, to { x, y, width, height } as shares of the frame, caption up to ${CARD_QR_MAX_CAPTION_LENGTH} letters, captionFace serif or sans, captionSize 0.03 to 0.3 of the QR's size, plate true or false, backdrop clear or black.`
      );
  }
  if (
    headerTitle !== undefined &&
    !(POST_CARD_HEADER_TITLES as readonly unknown[]).includes(headerTitle)
  )
    throw new Error(
      `headerTitle must be one of ${POST_CARD_HEADER_TITLES.join(", ")}.`
    );
}

function refuseMusicValues(music: PostMusic, patch: MusicOpPatch): void {
  const { bpm, beatsPerBar, gain, fadeInSeconds, fadeOutSeconds } = patch;
  const { downbeatSeconds } = patch;
  if (typeof bpm === "number" && (bpm < TAKE_MIN_BPM || bpm > TAKE_MAX_BPM))
    throw new Error(`bpm must be from ${TAKE_MIN_BPM} to ${TAKE_MAX_BPM}.`);
  if (
    beatsPerBar !== undefined &&
    (!Number.isInteger(beatsPerBar) ||
      beatsPerBar < 1 ||
      beatsPerBar > POST_MUSIC_MAX_BEATS_PER_BAR)
  )
    throw new Error(
      `beatsPerBar must be a whole number from 1 to ${POST_MUSIC_MAX_BEATS_PER_BAR}.`
    );
  if (gain !== undefined && (gain < 0 || gain > POST_MUSIC_MAX_GAIN))
    throw new Error(`gain must be from 0 to ${POST_MUSIC_MAX_GAIN}.`);
  if (fadeInSeconds !== undefined && fadeInSeconds < 0)
    throw new Error("fadeInSeconds must be 0 or more.");
  if (fadeOutSeconds !== undefined && fadeOutSeconds < 0)
    throw new Error("fadeOutSeconds must be 0 or more.");
  if (
    downbeatSeconds !== undefined &&
    Math.abs(downbeatSeconds) > music.durationSeconds
  )
    throw new Error(
      `downbeatSeconds must be from ${secondsText(-music.durationSeconds)} to ${secondsText(music.durationSeconds)} (the file is ${secondsText(music.durationSeconds)} long).`
    );
}

/**
 * Refuses times that, once a bar is turned into seconds, put the music off
 * the post's clock or ask the file for more than it holds. A start or an end
 * is checked against the other edge the music has now.
 */
function refuseMusicTimes(
  music: PostMusic,
  times: {
    startSeconds?: number;
    sourceInSeconds?: number;
    sourceOutSeconds?: number;
  }
): void {
  if (
    times.startSeconds !== undefined &&
    (times.startSeconds < 0 || times.startSeconds > POST_MUSIC_MAX_SECONDS)
  )
    throw new Error(
      `startSeconds must be from 0 s to ${POST_MUSIC_MAX_SECONDS} s, not ${secondsText(times.startSeconds)}.`
    );
  if (
    times.sourceInSeconds === undefined &&
    times.sourceOutSeconds === undefined
  )
    return;
  const from = times.sourceInSeconds ?? music.sourceInSeconds;
  const to = times.sourceOutSeconds ?? music.sourceOutSeconds;
  if (from < 0)
    throw new Error(
      `The music's start (${secondsText(from)}) must be 0 s or later.`
    );
  if (to > music.durationSeconds + POST_MUSIC_LENGTH_SLACK)
    throw new Error(
      `The music's end (${secondsText(to)}) cannot come after the end of its file (${secondsText(music.durationSeconds)}).`
    );
  if (to - from < POST_MUSIC_MIN_SECONDS - POST_MUSIC_LENGTH_SLACK)
    throw new Error(
      `The music's end (${secondsText(to)}) must come at least ${secondsText(POST_MUSIC_MIN_SECONDS)} after its start (${secondsText(from)}).`
    );
}

/**
 * A flash clip's strength, fade and marks, checked before the edit: the
 * edit keeps a value inside its range quietly, and a script should hear why.
 */
function refuseFlashValues(
  values: Record<string, unknown>,
  ids?: readonly string[],
  project?: PostProject
): void {
  const { strength, fade, marks } = values;
  if (strength === undefined && fade === undefined && marks === undefined)
    return;
  if (
    ids &&
    project &&
    !ids.some((id) => findItem(project, id)?.item.kind === "flash")
  )
    throw new Error("Only a flash clip takes strength, fade or marks.");
  if (
    strength !== undefined &&
    (typeof strength !== "number" ||
      !(strength >= FLASH_MIN_STRENGTH && strength <= FLASH_MAX_STRENGTH))
  )
    throw new Error(
      `strength must be a number from ${FLASH_MIN_STRENGTH} to ${FLASH_MAX_STRENGTH}.`
    );
  if (
    fade !== undefined &&
    (typeof fade !== "number" ||
      !(fade >= FLASH_MIN_FADE_SECONDS && fade <= FLASH_MAX_FADE_SECONDS))
  )
    throw new Error(
      `fade must be seconds from ${FLASH_MIN_FADE_SECONDS} to ${FLASH_MAX_FADE_SECONDS}.`
    );
  if (marks !== undefined && typeof marks !== "boolean")
    throw new Error("marks must be true or false.");
}

/**
 * A video clip's held last frame, checked before the edit: the edit keeps a
 * hold inside its range quietly, and a script should hear why. `null` or 0
 * clears it.
 */
function refuseHoldValue(
  project: PostProject,
  ids: readonly string[],
  patch: PostItemPatch | undefined
): void {
  const { holdOut } = (patch ?? {}) as Record<string, unknown>;
  if (holdOut === undefined) return;
  if (!ids.some((id) => findItem(project, id)?.item.kind === "video"))
    throw new Error("Only a video clip holds its last frame.");
  if (
    holdOut !== null &&
    (typeof holdOut !== "number" ||
      !(holdOut >= 0 && holdOut <= POST_MAX_HOLD_SECONDS))
  )
    throw new Error(
      `holdOut must be seconds from 0 to ${POST_MAX_HOLD_SECONDS}, or null to clear it.`
    );
}

function refuseCometValue(
  project: PostProject,
  ids: readonly string[],
  patch: PostItemPatch | undefined
): void {
  const { cometTrails } = (patch ?? {}) as Record<string, unknown>;
  if (cometTrails === undefined) return;
  if (!ids.some((id) => findItem(project, id)?.item.kind === "video"))
    throw new Error("Only a video clip draws comet trails.");
  if (cometTrails === null) return;
  // updateItem passes over a setting that breaks the schema; say why instead.
  const parsed = PostCometTrailsSchema.safeParse(cometTrails);
  if (!parsed.success)
    throw new Error(`cometTrails: ${firstIssue(parsed.error)}`);
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
      let itemId: string | undefined;
      if (op.item !== undefined) {
        const ids = itemIds(project, op.item);
        const named = project.tracks
          .flatMap((track) => track.items)
          .find((item) => item.id === ids[0]);
        if (ids.length !== 1 || named?.kind !== "animation")
          throw new Error(
            `"${op.item}" is not one animation; the opening tunnel opens on one.`
          );
        itemId = named.id;
      }
      const result = addTunnelHook(project, ctx, {
        ...(op.seconds !== undefined ? { seconds: op.seconds } : {}),
        ...(itemId !== undefined ? { itemId } : {}),
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
    case "add-flash": {
      refuseFlashValues(op);
      const result = addFlashItem(project, ctx, {
        ...(op.at !== undefined
          ? { at: resolvePostTime(op.at, project.music, "at") }
          : {}),
        ...(op.strength !== undefined ? { strength: op.strength } : {}),
        ...(op.fade !== undefined ? { fade: op.fade } : {}),
        ...(op.marks !== undefined ? { marks: op.marks } : {}),
      });
      if (!result) throw new Error("The flash could not be placed.");
      return result.project;
    }
    case "add-credit": {
      if (
        op.lead !== undefined &&
        (typeof op.lead !== "string" || op.lead.length > CREDIT_MAX_LEAD_LENGTH)
      )
        throw new Error(
          `lead must be text up to ${CREDIT_MAX_LEAD_LENGTH} letters.`
        );
      if (
        op.duration !== undefined &&
        (typeof op.duration !== "number" || !(op.duration > 0))
      )
        throw new Error("duration must be seconds above 0.");
      const result = addCreditItem(project, ctx, {
        ...(op.at !== undefined
          ? { at: resolvePostTime(op.at, project.music, "at") }
          : {}),
        ...(op.lead !== undefined ? { lead: op.lead } : {}),
        ...(op.duration !== undefined ? { duration: op.duration } : {}),
      });
      if (!result) throw new Error("The credit could not be placed.");
      return result.project;
    }
    case "add-text": {
      if (typeof op.text !== "string" || op.text.length > POST_MAX_TEXT_LENGTH)
        throw new Error(`text must be words up to ${POST_MAX_TEXT_LENGTH} letters.`);
      if (op.size !== undefined && !["s", "m", "l"].includes(op.size))
        throw new Error("size must be s, m or l.");
      if (
        op.duration !== undefined &&
        (typeof op.duration !== "number" || !(op.duration > 0))
      )
        throw new Error("duration must be seconds above 0.");
      if (
        op.box !== undefined &&
        ![op.box.x, op.box.y, op.box.width, op.box.height].every(
          (n) => typeof n === "number" && n >= 0 && n <= 1
        )
      )
        throw new Error("box must be x, y, width and height as shares of the frame.");
      const result = addOverlayItem(
        project,
        {
          kind: "text",
          text: op.text,
          size: op.size ?? "m",
          at: op.at !== undefined ? resolvePostTime(op.at, project.music, "at") : 0,
          ...(op.duration !== undefined ? { duration: op.duration } : {}),
          ...(op.box !== undefined ? { box: { ...op.box } } : {}),
          fill: false,
        },
        ctx
      );
      if (!result) throw new Error("The words could not be placed.");
      return result.project;
    }
    case "add-loop": {
      if (
        op.duration !== undefined &&
        (typeof op.duration !== "number" || !(op.duration > 0))
      )
        throw new Error("duration must be seconds above 0.");
      const { op: _op, at, ...init } = op;
      const result = addLoopRunItem(project, ctx, {
        ...init,
        ...(at !== undefined
          ? { at: resolvePostTime(at, project.music, "at") }
          : {}),
      });
      if (!result) throw new Error("The LOOP run could not be placed.");
      return result.project;
    }
    case "fly-into-next": {
      const id = itemIds(project, op.item)[0]!;
      if (
        op.seconds !== undefined &&
        (typeof op.seconds !== "number" ||
          !Number.isFinite(op.seconds) ||
          op.seconds <= 0)
      )
        throw new Error("seconds must be more than 0.");
      const flown = flyIntoNextEdit(
        project,
        id,
        op.seconds ?? FLY_DEFAULT_SECONDS,
        ctx
      );
      if (flown.outcome === "refused")
        throw new Error(
          "Only an animation, moves, mandala or card clip flies, into the animation, moves, mandala or card clip right after it on the same lane."
        );
      if (flown.outcome === "too-short")
        throw new Error(
          "The two clips are too short to overlap for a cross-fade."
        );
      // "unchanged" returns the same project, which the bridge reports as unchanged.
      return flown.project;
    }
    case "keyframe":
      return keyframeEdit(project, op, ctx);
    case "move":
      return moveItemEdit(project, op, ctx);
    case "land-titles": {
      const items = project.tracks.flatMap((track) => track.items);
      const titles = op.titles
        ? findItem(project, op.titles)?.item
        : items.find((item) => item.kind === "titles");
      if (titles?.kind !== "titles")
        throw new Error(
          op.titles
            ? `No titles clip "${op.titles}".`
            : "This post has no titles clip."
        );
      const at =
        op.at === undefined
          ? undefined
          : resolvePostTime(op.at, project.music, "at");
      const card = op.card
        ? findItem(project, op.card)?.item
        : items
            .filter(
              (item) =>
                item.kind === "card" &&
                (at === undefined || item.start + item.duration > at)
            )
            .sort((a, b) => a.start - b.start)[0];
      if (card?.kind !== "card")
        throw new Error(
          op.card ? `No card "${op.card}".` : "No card is on screen then."
        );
      const word = op.word;
      if (
        !word ||
        ![word.x, word.y, word.width, word.height].every(
          (value) => typeof value === "number" && Number.isFinite(value)
        ) ||
        word.width <= 0 ||
        word.height <= 0
      )
        throw new Error(
          "word must be { x, y, width, height }: where the card draws its header word, as shares of the card's box."
        );
      const next = landTitlesOnCard(
        project,
        titles.id,
        card.id,
        at ?? card.start,
        word,
        ctx
      );
      if (next === project)
        throw new Error(
          "The name cannot land there: both clips must still be on screen 0.6 s after it starts."
        );
      return next;
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
      const qrUrl = (op.patch as { qrUrl?: unknown } | undefined)?.qrUrl;
      const split = (op.patch as { split?: unknown } | undefined)?.split;
      // updateItem passes over a split that breaks the schema; say why instead.
      if (split !== undefined && split !== null) {
        const parsed = PostAnimationSplitSchema.safeParse(split);
        if (!parsed.success)
          throw new Error(`split: ${firstIssue(parsed.error)}`);
      }
      if (
        split !== undefined &&
        !itemIds(project, op.item).some(
          (id) => findItem(project, id)?.item.kind === "animation"
        )
      )
        throw new Error("Only an animation clip splits its hands.");
      const panelLift = (op.patch as { panelLift?: unknown } | undefined)
        ?.panelLift;
      // As with the split: say why a lift is refused instead of passing over it.
      if (panelLift !== undefined && panelLift !== null) {
        const parsed = PostPanelLiftSchema.safeParse(panelLift);
        if (!parsed.success)
          throw new Error(`panelLift: ${firstIssue(parsed.error)}`);
      }
      if (
        panelLift !== undefined &&
        !itemIds(project, op.item).some(
          (id) => findItem(project, id)?.item.kind === "animation"
        )
      )
        throw new Error("Only an animation clip lifts its panel.");
      const barFill = (op.patch as { barFill?: unknown } | undefined)?.barFill;
      // As with the split: say why a fill is refused instead of passing over it.
      if (barFill !== undefined && barFill !== null) {
        const parsed = PostBarFillSchema.safeParse(barFill);
        if (!parsed.success)
          throw new Error(`barFill: ${firstIssue(parsed.error)}`);
      }
      if (
        barFill !== undefined &&
        !itemIds(project, op.item).some(
          (id) => findItem(project, id)?.item.kind === "animation"
        )
      )
        throw new Error("Only an animation clip fills its bar once.");
      // updateItem passes over a link that breaks the rule; a script should hear why.
      if (qrUrl !== undefined && qrUrl !== null && !isPostCardQrUrl(qrUrl))
        throw new Error(POST_QR_URL_RULE);
      const ids = itemIds(project, op.item);
      if (
        qrUrl !== undefined &&
        !ids.some((id) => findItem(project, id)?.item.kind === "card")
      )
        throw new Error("Only a card keeps a scan link.");
      refuseTitlesValues(project, ids, op.patch);
      refuseCardValues(project, ids, op.patch);
      refuseHoldValue(project, ids, op.patch);
      refuseCometValue(project, ids, op.patch);
      refuseFlashValues(
        (op.patch ?? {}) as Record<string, unknown>,
        ids,
        project
      );
      let next = project;
      for (const id of ids) {
        const item = findItem(next, id)?.item;
        // As in the editor, a card given a link shows it in its QR cell.
        const patch =
          typeof qrUrl === "string" &&
          item?.kind === "card" &&
          op.patch.cardAppearance === undefined
            ? {
                ...op.patch,
                cardAppearance: {
                  ...item.cardAppearance,
                  infoCellChoice: "qr" as const,
                },
              }
            : op.patch;
        next = updateItem(next, id, patch, ctx);
      }
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
    case "relink-take": {
      if (!project.takes.some((take) => take.id === op.take))
        throw new Error(`No take "${op.take}" in this post.`);
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
      if (
        project.takes.some(
          (take) => take.id !== op.take && take.takeKey === takeKey
        )
      )
        throw new Error("Another take already plays that file.");
      return relinkTake(
        project,
        op.take,
        { ref, takeKey, durationSeconds: op.durationSeconds },
        ctx
      );
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
      refuseMusicValues(project.music, {
        ...rest,
        bpm,
        downbeatSeconds,
        beatsPerBar,
      });
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
      const times = {
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
      };
      refuseMusicTimes(music, times);
      return updateMusic(regridded, { ...rest, ...times }, ctx);
    }
    case "remove-music":
      if (!project.music) throw new Error(NO_MUSIC);
      return removeMusic(project, ctx);
    case "build-walkthrough": {
      if (typeof op.take !== "string" || op.take.length === 0)
        throw new Error("take must name a take.");
      if (op.chapter !== undefined && typeof op.chapter !== "string")
        throw new Error("chapter must be a chapter's name.");
      const capture = WalkthroughCaptureSchema.safeParse(op.capture);
      if (!capture.success)
        throw new Error(
          `The capture does not read: ${firstIssue(capture.error)}`
        );
      const script = WalkthroughScriptSchema.safeParse(op.script);
      if (!script.success)
        throw new Error(
          `The lines file does not read: ${firstIssue(script.error)}`
        );
      return buildWalkthrough(
        project,
        {
          takeId: op.take,
          capture: capture.data,
          script: script.data,
          ...(op.chapter !== undefined ? { chapter: op.chapter } : {}),
        },
        ctx
      ).project;
    }
    case "add-card": {
      if (op.qrUrl !== undefined && !isPostCardQrUrl(op.qrUrl))
        throw new Error(POST_QR_URL_RULE);
      if (
        op.fadeIn !== undefined &&
        (typeof op.fadeIn !== "number" ||
          !Number.isFinite(op.fadeIn) ||
          op.fadeIn < 0)
      )
        throw new Error("fadeIn must be 0 or more.");
      if (op.label !== undefined && typeof op.label !== "string")
        throw new Error("label must be text.");
      const added = appendCardClip(project, ctx, {
        ...(op.label !== undefined ? { label: op.label } : {}),
        ...(op.fadeIn !== undefined ? { fadeIn: op.fadeIn } : {}),
      });
      if (op.qrUrl === undefined) return added.project;
      // The link shows only in the QR cell, so a card given one shows that cell.
      return updateItem(
        added.project,
        added.itemId,
        { qrUrl: op.qrUrl, cardAppearance: { infoCellChoice: "qr" } },
        ctx
      );
    }
    case "sound":
      if (op.sound !== "takes" && op.sound !== "silent")
        throw new Error("sound must be takes or silent.");
      return setProjectAudio(project, op.sound, ctx);
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
/** A schema's first complaint, with where it is: `lines.3.after: ...`. */
function firstIssue(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  const issue = error.issues[0];
  if (!issue) return "it is not valid.";
  const where = issue.path.map(String).join(".");
  return where ? `${where}: ${issue.message}` : issue.message;
}

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

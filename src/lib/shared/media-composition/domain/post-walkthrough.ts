import { z } from "zod";
import {
  POST_BOX,
  POST_MAX_TEXT_LENGTH,
  POST_MAX_ZOOM,
  POST_MIN_BOX_SIZE,
  POST_MIN_ITEM_SECONDS,
  MAIN_TRACK_INDEX,
  createIdAllocator,
  type PostItem,
  type PostProject,
  type PostTextItem,
  type PostTrack,
  type PostVideoItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  finish,
  newVideoFields,
  type EditContext,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import {
  postCanvasOf,
  postOutputSize,
} from "#lib/shared/media-composition/domain/post-canvas.js";
import {
  ARRIVE_BEFORE_SECONDS,
  MOVE_SECONDS,
  cameraKeyframes,
  cameraSampler,
  needsFocus,
  planShots,
  rectToOutput,
  scheduleMoves,
  splitKeyframes,
  toOutput,
  unionRect,
  type CameraBeat,
  type ShareRect,
} from "#lib/shared/media-composition/domain/walkthrough-camera.js";
import {
  BUBBLE_MIN_READ_SECONDS,
  BUBBLE_MIN_SECONDS,
  bubbleId,
  bubbleSize,
  bubbleSpan,
  placeBubble,
} from "#lib/shared/media-composition/domain/walkthrough-callouts.js";

/**
 * Builds a walkthrough cut from a screen recording: the kept spans of the
 * take on the main track, a camera that moves in on every click, and a
 * speech bubble beside each click for each line of the lines file. The
 * director's `capture.json` gives the clicks; the lines file names the click
 * each line follows (see the walkthrough spec,
 * `docs/superpowers/specs/active/2026-10-11-walkthrough-zoom-bubbles-design.md`).
 */

export const WALKTHROUGH_TRACK_ID = "walkthrough";
/** A chapter build starts this long before its first click, while the camera is wide. */
const CHAPTER_LEAD_SECONDS = 2;
/** A YouTube chapter starts this long before its first bubble. */
export const CHAPTER_MARK_LEAD_SECONDS = 1.5;
/** A pull out after a `wideAfter` click starts this long after the press. */
const WIDE_AFTER_DELAY = 0.2;
/** A wide line's pull out lands this long before the line. */
const WIDE_LINE_LEAD_OUT = 0.1;
const BUBBLE_FADE_SECONDS = 0.2;
/** A click with no recorded box is framed as a box this big, in page pixels. */
const POINT_BOX = 48;
const ASPECT_TOLERANCE = 0.01;
const FALLBACK_VIEWPORT = { width: 1920, height: 1080 };

const PageRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export type WalkthroughRect = z.infer<typeof PageRectSchema>;

export const WalkthroughCaptureSchema = z.object({
  events: z.array(
    z.object({
      label: z.string(),
      action: z.string(),
      time: z.number().finite(),
      x: z.number().finite(),
      y: z.number().finite(),
      rect: PageRectSchema.optional(),
    })
  ),
  viewport: z
    .object({
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
      deviceScaleFactor: z.number().finite().positive().optional(),
    })
    .nullable()
    .optional(),
});

export type WalkthroughCapture = z.infer<typeof WalkthroughCaptureSchema>;
export type WalkthroughEvent = WalkthroughCapture["events"][number];

export const WalkthroughLineSchema = z
  .object({
    /** A piece of the clicked control's label; clicks are matched in order. */
    click: z.string(),
    /** Seconds after the click. */
    after: z.number().finite().min(0),
    /** Placeholder words; empty ends the previous bubble. */
    text: z.string().max(POST_MAX_TEXT_LENGTH),
    chapter: z.string().trim().min(1).optional(),
    shot: z.enum(["close", "wide"]).optional(),
    /** Follows the same click as the line before it. */
    sameClick: z.boolean().optional(),
    /** Page pixels of the area the line talks about, when not the clicked control. */
    include: PageRectSchema.optional(),
  })
  .strict();

export type WalkthroughLine = z.infer<typeof WalkthroughLineSchema>;

export const WalkthroughScriptSchema = z
  .object({
    /** Take seconds to keep; the rest is cut. */
    keep: z
      .array(z.tuple([z.number().finite(), z.number().finite()]))
      .optional(),
    /** Label pieces whose clicks are seen close, then pull out. */
    wideAfter: z.array(z.string().min(1)).optional(),
    maxZoom: z.number().finite().min(1).max(POST_MAX_ZOOM).optional(),
    lines: z.array(WalkthroughLineSchema).min(1),
  })
  .strict();

export type WalkthroughScript = z.infer<typeof WalkthroughScriptSchema>;

export interface WalkthroughInput {
  takeId: string;
  capture: WalkthroughCapture;
  script: WalkthroughScript;
  /** Build only this chapter. */
  chapter?: string;
}

export interface WalkthroughBuild {
  project: PostProject;
  /** Each chapter's start in post seconds, for YouTube. */
  chapters: { name: string; seconds: number }[];
  warnings: string[];
}

interface ResolvedLine {
  line: WalkthroughLine;
  event: WalkthroughEvent;
  /** Take seconds. */
  time: number;
  chapter: string | null;
  chapterStart: boolean;
}

interface Clip {
  a: number;
  b: number;
  id: string;
  /** Post seconds at `a`. */
  postStart: number;
}

const roundTime = (seconds: number) => seconds.toFixed(2);

export function buildWalkthrough(
  project: PostProject,
  input: WalkthroughInput,
  ctx: EditContext
): WalkthroughBuild {
  const { capture, script } = input;
  const take = project.takes.find((entry) => entry.id === input.takeId);
  if (!take) throw new Error(`This post has no take "${input.takeId}".`);
  const viewport = capture.viewport ?? FALLBACK_VIEWPORT;
  const frame = postOutputSize(postCanvasOf(project));
  const recorded = viewport.width / viewport.height;
  if (
    Math.abs(frame.width / frame.height - recorded) >
    ASPECT_TOLERANCE * recorded
  ) {
    throw new Error(
      `The post is ${postCanvasOf(project)}, but the recording is ${viewport.width}x${viewport.height}. Set the post to the recording's shape first.`
    );
  }
  const maxZoom =
    script.maxZoom ??
    (capture.viewport
      ? Math.min(2, Math.max(1.5, capture.viewport.deviceScaleFactor ?? 1))
      : 2);
  const share = (rect: WalkthroughRect): ShareRect => ({
    x: rect.x / viewport.width,
    y: rect.y / viewport.height,
    width: rect.width / viewport.width,
    height: rect.height / viewport.height,
  });
  const eventRegion = (event: WalkthroughEvent): ShareRect =>
    share(
      event.rect ?? {
        x: event.x - POINT_BOX / 2,
        y: event.y - POINT_BOX / 2,
        width: POINT_BOX,
        height: POINT_BOX,
      }
    );

  const lines = resolveLines(capture.events, script.lines);

  // The span to build: the whole take, or one chapter.
  const takeEnd = take.durationSeconds;
  const keep = (script.keep ?? [[0, takeEnd]])
    .map(([a, b]) => [Math.max(0, a), Math.min(takeEnd, b)] as const)
    .filter(([a, b]) => b - a >= POST_MIN_ITEM_SECONDS);
  if (keep.length === 0) throw new Error("Nothing of the take is kept.");
  let rangeStart = keep[0]![0];
  let rangeEnd = keep.at(-1)![1];
  let built = lines;
  if (input.chapter !== undefined) {
    const first = lines.findIndex(
      (entry) => entry.line.chapter === input.chapter
    );
    if (first < 0)
      throw new Error(`No line starts the chapter "${input.chapter}".`);
    const next = lines.findIndex(
      (entry, index) => index > first && entry.chapterStart
    );
    built = lines.slice(first, next < 0 ? undefined : next);
    rangeStart = Math.max(
      rangeStart,
      built[0]!.event.time - CHAPTER_LEAD_SECONDS
    );
    if (next >= 0) {
      rangeEnd = Math.min(
        rangeEnd,
        lines[next]!.event.time - ARRIVE_BEFORE_SECONDS - MOVE_SECONDS
      );
    }
  }

  // The kept spans inside it, laid end to end.
  const cleared = clearedProject(project);
  const nextId = createIdAllocator(cleared);
  const clips: Clip[] = [];
  let postCursor = 0;
  for (const [keepA, keepB] of keep) {
    const a = Math.max(keepA, rangeStart);
    const b = Math.min(keepB, rangeEnd);
    if (b - a < POST_MIN_ITEM_SECONDS) continue;
    clips.push({ a, b, id: nextId("video"), postStart: postCursor });
    postCursor += b - a;
  }
  const clipAt = (t: number) =>
    clips.find((clip) => t >= clip.a && t <= clip.b);
  const postOf = (t: number) => {
    const clip = clipAt(t);
    if (!clip) throw new Error(`${roundTime(t)} s of the take is cut.`);
    return clip.postStart + (t - clip.a);
  };
  for (const entry of built) {
    if (!clipAt(entry.event.time) || !clipAt(entry.time)) {
      throw new Error(`"${label(entry.line)}" falls inside a cut.`);
    }
  }

  // Every click in the span is a beat; lines can add their own. The camera
  // moves in only to pick out a small control a line talks about, or when
  // the line asks; any other click just has to be in view.
  const wideAfter = script.wideAfter ?? [];
  const inRange = capture.events.filter(
    (event) => event.time >= rangeStart && event.time <= rangeEnd
  );
  const beats: CameraBeat[] = [];
  for (const event of inRange) {
    const own = built.filter(
      (entry) =>
        entry.event === event && !entry.line.sameClick && entry.line.text
    );
    let region = eventRegion(event);
    for (const entry of own) {
      if (entry.line.include)
        region = unionRect(region, share(entry.line.include));
    }
    const newShot = own.some((entry) => entry.chapterStart);
    const pulls = wideAfter.some((piece) => event.label.includes(piece));
    const wideLine = own.some((entry) => entry.line.shot === "wide");
    if (wideLine && !pulls) {
      beats.push({ kind: "wide", time: event.time, startAt: event.time });
      continue;
    }
    const focus =
      own.some((entry) => entry.line.shot === "close") ||
      (own.length > 0 && needsFocus(region));
    beats.push(
      focus
        ? { kind: "close", time: event.time, region, newShot }
        : { kind: "see", time: event.time, region }
    );
    if (pulls) {
      beats.push({
        kind: "wide",
        time: event.time,
        startAt: event.time + WIDE_AFTER_DELAY,
      });
    }
  }
  for (const entry of built) {
    const { line } = entry;
    if (!line.sameClick || !line.text || (!line.shot && !line.include))
      continue;
    if (line.shot === "wide") {
      beats.push({
        kind: "wide",
        time: entry.time,
        startAt: entry.time - WIDE_LINE_LEAD_OUT - MOVE_SECONDS,
        due: entry.time - WIDE_LINE_LEAD_OUT,
      });
    } else {
      const region = unionRect(
        eventRegion(entry.event),
        line.include ? share(line.include) : eventRegion(entry.event)
      );
      const focus = line.shot === "close" || needsFocus(region);
      beats.push({ kind: focus ? "close" : "see", time: entry.time, region });
    }
  }

  const shots = planShots(beats, maxZoom);
  const { moves, warnings } = scheduleMoves(shots, rangeStart);
  const keys = cameraKeyframes(moves, rangeStart);
  const sample = cameraSampler(keys);

  const mainItems: PostVideoItem[] = clips.map((clip) => {
    const framing = splitKeyframes(keys, clip.a, clip.b, sample);
    const first = framing[0]!.value;
    return {
      ...newVideoFields(take, clip.a, clip.b),
      id: clip.id,
      start: clip.postStart,
      box: { ...POST_BOX.full },
      anchor: null,
      fill: false,
      zoom: first.zoom,
      panX: first.panX,
      panY: first.panY,
      keyframes: { framing },
    };
  });

  // A bubble beside each line's click, between camera moves.
  const bubbles: PostTextItem[] = [];
  const chapters: WalkthroughBuild["chapters"] = [];
  const labelled = new Set<string>();
  built.forEach((entry, index) => {
    const { line, event } = entry;
    if (!line.text) return;
    const clip = clipAt(entry.time)!;
    const nextTime = built[index + 1]?.time ?? Infinity;
    const span = bubbleSpan(
      entry.time,
      nextTime,
      moves,
      Math.min(clip.b, rangeEnd)
    );
    const seconds = span.end - span.start;
    if (seconds < BUBBLE_MIN_SECONDS) {
      warnings.push(
        `"${line.text}" has ${roundTime(Math.max(0, seconds))} s between camera moves and was left out.`
      );
      return;
    }
    if (seconds < BUBBLE_MIN_READ_SECONDS) {
      warnings.push(`"${line.text}" shows for only ${roundTime(seconds)} s.`);
    }
    const framing = sample(span.start);
    const clicked = rectToOutput(framing, eventRegion(event));
    const included = line.include
      ? rectToOutput(framing, share(line.include))
      : null;
    const aim = line.include
      ? {
          x: (line.include.x + line.include.width / 2) / viewport.width,
          y: (line.include.y + line.include.height / 2) / viewport.height,
        }
      : { x: event.x / viewport.width, y: event.y / viewport.height };
    const pointed = toOutput(framing, aim);
    const callout = {
      x: Math.min(1, Math.max(0, pointed.x)),
      y: Math.min(1, Math.max(0, pointed.y)),
    };
    const id = bubbleId(line.text);
    const existing = findText(project, id);
    const text = existing?.text ?? line.text;
    const size = existing?.size ?? "m";
    const placement = placeBubble(
      bubbleSize(text, size, frame),
      included ?? clicked,
      included ? [clicked, included] : [clicked],
      callout,
      frame
    );
    if (!placement.placed) {
      warnings.push(`"${line.text}" could not sit clear of its target.`);
    }
    const start = postOf(span.start);
    const chapterName =
      entry.chapter && !labelled.has(entry.chapter) ? entry.chapter : null;
    if (chapterName) {
      labelled.add(chapterName);
      chapters.push({
        name: chapterName,
        seconds: Math.max(0, start - CHAPTER_MARK_LEAD_SECONDS),
      });
    }
    bubbles.push({
      id,
      kind: "text",
      ...(chapterName ? { label: chapterName } : {}),
      text,
      size,
      callout,
      start,
      duration: seconds,
      box: fitBox(placement.box),
      opacity: 1,
      fadeIn: BUBBLE_FADE_SECONDS,
      fadeOut: BUBBLE_FADE_SECONDS,
      anchor: { itemId: clip.id, offset: start - clip.postStart },
      fill: false,
    });
  });

  const track: PostTrack = {
    id: WALKTHROUGH_TRACK_ID,
    hidden: false,
    locked: false,
    items: bubbles,
  };
  const tracks = cleared.tracks.map((entry, index) =>
    index === MAIN_TRACK_INDEX
      ? { ...entry, items: mainItems as PostItem[] }
      : entry.id === WALKTHROUGH_TRACK_ID
        ? track
        : entry
  );
  if (!tracks.some((entry) => entry.id === WALKTHROUGH_TRACK_ID))
    tracks.push(track);
  return {
    project: finish({ ...cleared, tracks }, ctx),
    chapters,
    warnings,
  };
}

/** Lines to the clicks they follow, matched in order, in time order. */
function resolveLines(
  events: readonly WalkthroughEvent[],
  lines: readonly WalkthroughLine[]
): ResolvedLine[] {
  const seen = new Set<string>();
  const resolved: ResolvedLine[] = [];
  let cursor = 0;
  let chapter: string | null = null;
  let previous: ResolvedLine | null = null;
  for (const line of lines) {
    const click = line.click.trim();
    if (!click) throw new Error(`"${label(line)}" needs a click to follow.`);
    if (line.text) {
      if (seen.has(line.text)) {
        throw new Error(
          `Two lines say "${line.text}". Give each its own words.`
        );
      }
      seen.add(line.text);
    }
    let event: WalkthroughEvent;
    if (line.sameClick) {
      if (!previous || !previous.event.label.includes(click)) {
        throw new Error(
          `"${label(line)}" follows the same click as the line before it, but that line does not follow "${click}".`
        );
      }
      event = previous.event;
    } else {
      const index = events.findIndex(
        (candidate, position) =>
          position >= cursor && candidate.label.includes(click)
      );
      if (index < 0) {
        throw new Error(`No click matching "${click}" for "${label(line)}".`);
      }
      event = events[index]!;
      cursor = index + 1;
    }
    if (line.chapter) chapter = line.chapter;
    previous = {
      line,
      event,
      time: event.time + line.after,
      chapter,
      chapterStart: Boolean(line.chapter),
    };
    resolved.push(previous);
  }
  return resolved
    .map((entry, order) => ({ entry, order }))
    .sort((x, y) => x.entry.time - y.entry.time || x.order - y.order)
    .map(({ entry }) => entry);
}

function label(line: WalkthroughLine): string {
  return line.text || `(${line.click})`;
}

/** The project with its main clips and walkthrough bubbles taken out. */
function clearedProject(project: PostProject): PostProject {
  return {
    ...project,
    tracks: project.tracks.map((track, index) =>
      index === MAIN_TRACK_INDEX || track.id === WALKTHROUGH_TRACK_ID
        ? { ...track, items: [] }
        : track
    ),
  };
}

function findText(project: PostProject, id: string): PostTextItem | null {
  for (const track of project.tracks) {
    const item = track.items.find((entry) => entry.id === id);
    if (item?.kind === "text") return item;
  }
  return null;
}

function fitBox(box: ShareRect): ShareRect {
  const width = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.width));
  const height = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.height));
  return {
    x: Math.min(1 - width, Math.max(0, box.x)),
    y: Math.min(1 - height, Math.max(0, box.y)),
    width,
    height,
  };
}

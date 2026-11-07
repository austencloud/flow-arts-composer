#!/usr/bin/env node
/**
 * The DJII tunnel 3D post's cut: the footage, the 3D stage and the 2D
 * animation trade places on the performers' landings instead of sitting in
 * a fixed top/bottom split.
 *
 *   Full      footage alone
 *   Split     footage top half, 3D bottom half
 *   Hero      3D full frame, footage inset top right
 *   Notation  footage top half, 2D animation (with its mandala) bottom half
 *
 * Every layout change is a 0.6 s box move ending on the landing it is named
 * for. The landings come from the footage's take (its tapped grid, speed and
 * in point), so a retap moves the cut with it.
 *
 * Tracks paint in order, the main track first, so a full-frame 3D clip would
 * hide the footage under it. During Hero a muted copy of the same footage
 * plays the inset from a track above everything else, following the same box
 * moves as the footage under it, so the two are one picture.
 *
 * Idempotent: it replaces the items it owns by id and leaves every other item
 * as it is. Like the dev server's save, it copies the file it replaces into
 * history/ first, bumps `revision`, and stamps `project.updatedAt`, which is
 * what makes the studio prefer this file over its local copy.
 *
 *   node scripts/post-3d-cut.mjs [path/to/project.json] [--dry-run]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FILE =
  "E:/tka-platform-media/feature-videos/djii-tunnel-3d/project.json";

/** Every layout move takes this long and ends on its landing. */
export const MOVE_SECONDS = 0.6;
/** The finale's own ease, so every move in the post feels the same. */
export const MOVE_EASE = [0.65, 0, 0.35, 1];
const FOOTAGE_FADE_OUT = 0.5;
/**
 * The 3D clip's opacity while the notation plays. The studio unmounts a
 * layer at opacity 0, and a remounted stage takes seconds to boot, so it
 * would miss its fade back in; at 1% under the notation it stays loaded and
 * cannot be seen.
 */
export const STAGE_RESTING_OPACITY = 0.01;
/** The notation's mandala line, thick enough to read on a phone. */
const MANDALA_THICKNESS = 5;

export const BOXES = {
  full: { x: 0, y: 0, width: 1, height: 1 },
  top: { x: 0, y: 0, width: 1, height: 0.5 },
  bottom: { x: 0, y: 0.5, width: 1, height: 0.5 },
  // The canvas's own 9:16 shape, so the footage's cover crop barely changes.
  inset: { x: 0.655, y: 0.03, width: 0.315, height: 0.315 },
};

/** Ids this script owns. Everything else in the post is left alone. */
const FOOTAGE_ID = "video-1";
const STAGE_ID = "animation-2";
const NOTATION_ID = "animation-1";
const INSET_TRACK_ID = "inset-track";
const INSET_IDS = ["video-inset-1", "video-inset-2"];

/**
 * The post-time landings of the footage's beat grid: landing 0 is the first
 * grid beat at or after the footage's in point, and each next landing is one
 * beat later. Grid beats sit at `beatOneSeconds + offsetSeconds + k·60/bpm`
 * in source seconds; the footage plays them at its speed from its start.
 */
export function landingClock(video, section) {
  const sourceBeat = 60 / section.bpm;
  const gridZero = section.beatOneSeconds + (section.offsetSeconds ?? 0);
  const firstIndex = Math.ceil((video.sourceIn - gridZero) / sourceBeat - 1e-9);
  return (n) =>
    video.start +
    (gridZero + (firstIndex + n) * sourceBeat - video.sourceIn) / video.speed;
}

/** An item's keyframe clock: source seconds for footage, item seconds else. */
export function keyframeTime(item, postSeconds) {
  return item.kind === "video"
    ? item.sourceIn + (postSeconds - item.start) * item.speed
    : postSeconds - item.start;
}

const round = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Keyframes for a channel from `[postSeconds, value]` stops: each stop eases
 * into the next with the move ease, and a stop that ends a move holds.
 * Stops come in pairs, start of a move then its end.
 */
export function moveKeyframes(item, moves) {
  return moves.flatMap(({ end, from, to }) => [
    { t: round(keyframeTime(item, end - MOVE_SECONDS)), value: from, easing: MOVE_EASE },
    { t: round(keyframeTime(item, end)), value: to, easing: "hold" },
  ]);
}

/** A copy of the footage over [start, end], on the same source clock. */
function footageSpan(footage, id, start, end) {
  const sourceIn = footage.sourceIn + (start - footage.start) * footage.speed;
  const sourceOut = footage.sourceIn + (end - footage.start) * footage.speed;
  return {
    ...footage,
    id,
    label: "Footage inset",
    start: round(start),
    duration: (sourceOut - sourceIn) / footage.speed,
    sourceIn: round(sourceIn),
    sourceOut: round(sourceOut),
    anchor: { itemId: footage.id, offset: round(start - footage.start) },
    pinnedStart: undefined,
    volume: 0,
    fadeIn: 0,
    fadeOut: 0,
    keyframes: undefined,
  };
}

function withoutUndefined(item) {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined)
  );
}

/** The whole cut, as items keyed by id plus the inset track's items. */
export function planCut(project) {
  const main = project.tracks[0];
  const footage = main.items.find((item) => item.id === FOOTAGE_ID);
  const card = main.items.find((item) => item.kind === "card");
  if (!footage || footage.kind !== "video") throw new Error("No video-1 footage.");
  if (!card) throw new Error("No card to end on.");
  const section = project.timings?.[footage.takeId]?.sections?.[0];
  if (!section?.bpm) throw new Error("The footage's take has no tapped grid.");
  const L = landingClock(footage, section);
  const footageEnd = footage.start + footage.duration;
  const cardIn = card.start + (card.fadeIn ?? 0);

  const all = project.tracks.flatMap((track) => track.items);
  const oldStage = all.find((item) => item.id === STAGE_ID);
  const oldNotation = all.find((item) => item.id === NOTATION_ID);
  if (!oldStage || oldStage.kind !== "animation") throw new Error("No 3D clip.");

  // The footage's box through the whole run. Notation keeps the top half, so
  // L(23) moves nothing on the footage.
  const footageMoves = [
    { end: L(2), from: BOXES.full, to: BOXES.top },
    { end: L(7), from: BOXES.top, to: BOXES.inset },
    { end: L(15), from: BOXES.inset, to: BOXES.top },
    { end: L(31), from: BOXES.top, to: BOXES.inset },
  ];
  const nextFootage = withoutUndefined({
    ...footage,
    fadeOut: FOOTAGE_FADE_OUT,
    keyframes: {
      ...(footage.keyframes ?? {}),
      box: moveKeyframes(footage, footageMoves),
    },
  });

  // The inset copies: on top of the 3D only while it fills the frame.
  const insetOne = footageSpan(nextFootage, INSET_IDS[0], L(7) - MOVE_SECONDS, L(15));
  insetOne.keyframes = { box: moveKeyframes(insetOne, footageMoves.slice(1, 3)) };
  const insetTwo = footageSpan(nextFootage, INSET_IDS[1], L(31) - MOVE_SECONDS, footageEnd);
  insetTwo.keyframes = { box: moveKeyframes(insetTwo, footageMoves.slice(3)) };
  insetTwo.fadeOut = FOOTAGE_FADE_OUT;

  // The 3D stage: in at L(1) in the bottom half, the whole frame for Hero,
  // out of the way (and back in its half) while the notation plays, then
  // Hero to the end. It fades out as the card fades in under it.
  const stageStart = L(1);
  const stageEnd = cardIn;
  const stageShell = { kind: "animation", start: stageStart };
  const nextStage = withoutUndefined({
    ...oldStage,
    start: round(stageStart),
    duration: round(stageEnd - stageStart),
    box: BOXES.bottom,
    opacity: 1,
    fadeIn: MOVE_SECONDS,
    fadeOut: card.fadeIn ?? 0.5,
    anchor: { itemId: footage.id, offset: round(stageStart - footage.start) },
    stage3d: {
      ...(oldStage.stage3d?.environment
        ? { environment: oldStage.stage3d.environment }
        : {}),
      shot: "orbit",
      spacing: 0.9,
      zoom: 0.6,
      elevation: 20,
    },
    keyframes: {
      box: moveKeyframes(stageShell, [
        { end: L(7), from: BOXES.bottom, to: BOXES.full },
        { end: L(15), from: BOXES.full, to: BOXES.bottom },
        { end: L(31), from: BOXES.bottom, to: BOXES.full },
      ]),
      opacity: moveKeyframes(stageShell, [
        { end: L(15), from: 1, to: STAGE_RESTING_OPACITY },
        { end: L(23), from: STAGE_RESTING_OPACITY, to: 1 },
      ]),
    },
  });

  // The 2D animation: both performers and the live mandala, for one pass
  // and a bit, fading in and out over the 3D's own fades.
  const notationStart = L(15) - MOVE_SECONDS;
  const nextNotation = withoutUndefined({
    ...(oldNotation ?? {}),
    id: NOTATION_ID,
    kind: "animation",
    start: round(notationStart),
    duration: round(L(23) - notationStart),
    box: BOXES.bottom,
    opacity: 1,
    fadeIn: MOVE_SECONDS,
    fadeOut: MOVE_SECONDS,
    fill: false,
    overlay: true,
    anchor: { itemId: footage.id, offset: round(notationStart - footage.start) },
    followers: oldStage.followers,
    animationAppearance: {
      ...oldStage.animationAppearance,
      mandala: true,
      mandalaThickness: MANDALA_THICKNESS,
    },
    stage3d: undefined,
    keyframes: undefined,
  });

  return {
    landings: { L, footageEnd, cardIn },
    replace: {
      [FOOTAGE_ID]: nextFootage,
      [STAGE_ID]: nextStage,
      [NOTATION_ID]: nextNotation,
    },
    inset: [withoutUndefined(insetOne), withoutUndefined(insetTwo)],
  };
}

/** The project with the cut applied; items it does not own are untouched. */
export function applyCut(project, now) {
  const plan = planCut(project);
  const tracks = project.tracks
    .filter((track) => track.id !== INSET_TRACK_ID)
    .map((track) => ({
      ...track,
      items: track.items.map((item) => plan.replace[item.id] ?? item),
    }));
  tracks.push({ id: INSET_TRACK_ID, hidden: false, locked: false, items: plan.inset });
  return { project: { ...project, tracks, updatedAt: now }, plan };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_FILE);
  const raw = await fs.readFile(file, "utf8");
  const saved = JSON.parse(raw);
  if (saved.format !== "feature-video-v1") throw new Error(`${file} is not a feature video.`);
  const now = Date.now();
  const { project, plan } = applyCut(saved.project, now);
  const { L, footageEnd, cardIn } = plan.landings;
  const at = (s) => s.toFixed(3);
  console.log(
    `Landings: L(1) ${at(L(1))}, L(7) ${at(L(7))}, L(15) ${at(L(15))}, ` +
      `L(23) ${at(L(23))}, L(31) ${at(L(31))}, L(34) ${at(L(34))}; ` +
      `footage ends ${at(footageEnd)}, card in ${at(cardIn)}`
  );
  if (dryRun) return;
  const history = path.join(path.dirname(file), "history");
  await fs.mkdir(history, { recursive: true });
  const archived = path.join(history, `r${String(saved.revision).padStart(6, "0")}.json`);
  await fs.writeFile(archived, raw);
  const next = { ...saved, revision: saved.revision + 1, savedAt: now, project };
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote revision ${next.revision} (previous kept as ${archived}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

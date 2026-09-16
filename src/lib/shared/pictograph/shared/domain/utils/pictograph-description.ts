/**
 * Accessible text description of a pictograph, built from the data the renderer
 * already holds (letter, start/end position, each hand's motion).
 *
 * A pictograph renders as an SVG image — grid dots, prop hands, arrows, glyphs —
 * so to a screen reader, a search crawler, or an AI agent reading the HTML it is
 * otherwise just "Pictograph". This turns the underlying data into a plain
 * sentence, wired into the SVG's `aria-label` so anyone (assistive tech, a
 * scraper, or a person reading the source) can reconstruct what the image shows.
 *
 * Terminology follows TKA canon: alpha = hands at opposite points, beta = hands
 * at the same point, gamma = hands at a right angle; motions are pro/anti shifts,
 * floats, dashes, or static; grid points are named by compass direction.
 */
import { MotionType, TnDMode } from "../enums/pictograph-enums";
import { PropType } from "../../../prop/domain/enums/prop-type";
import { isVisibleMotion, type MotionData } from "../models/motion-data";
import { deriveTnDFromPictograph } from "./tnd-deriver";

/** The minimal shape needed to describe a pictograph (Prepared/Pictograph data). */
type Describable = {
  letter?: string | null;
  startPlacement?: string | null;
  endPlacement?: string | null;
  motions?: { left?: MotionData | null; right?: MotionData | null } | null;
};

const LOCATION_NAME: Record<string, string> = {
  n: "north",
  e: "east",
  s: "south",
  w: "west",
  ne: "northeast",
  se: "southeast",
  sw: "southwest",
  nw: "northwest",
  c: "center",
};
const locName = (l: string | null | undefined): string =>
  l ? (LOCATION_NAME[l.toLowerCase()] ?? l) : "";

// α = hands at opposite points, β = same point, γ = right angle (TKA canon).
const GROUP_NAME: Record<string, string> = {
  alpha: "alpha (hands opposite)",
  beta: "beta (hands together)",
  gamma: "gamma (right angle)",
};
const groupOf = (pos: string | null | undefined): string | null => {
  if (!pos) return null;
  const m = pos.match(/[a-z]+/i);
  return m ? m[0].toLowerCase() : null;
};

const MOTION_VERB: Partial<Record<MotionType, string>> = {
  [MotionType.PRO]: "pro-spin shift",
  [MotionType.ANTI]: "anti-spin shift",
  [MotionType.FLOAT]: "float",
  [MotionType.DASH]: "dash",
  [MotionType.STATIC]: "static hold",
};

const TND_NAME: Record<TnDMode, string> = {
  [TnDMode.SPLIT_SAME]: "Split-Same timing",
  [TnDMode.SPLIT_OPP]: "Split-Opposite timing",
  [TnDMode.TOG_SAME]: "Together-Same timing",
  [TnDMode.TOG_OPP]: "Together-Opposite timing",
  [TnDMode.QUARTER_SAME]: "Quarter-Same timing",
  [TnDMode.QUARTER_OPP]: "Quarter-Opposite timing",
};

function motionPhrase(
  hand: "Left" | "Right",
  m: MotionData | null | undefined
): string | null {
  if (!isVisibleMotion(m)) return null;
  // A hand can't spin, so a hand shift IS a float (the renderer draws float
  // arrows for it); "fl" turns or an explicit FLOAT type also mean float.
  const isShift =
    m.motionType === MotionType.PRO || m.motionType === MotionType.ANTI;
  const isFloat =
    m.motionType === MotionType.FLOAT ||
    (m.turns as unknown) === "fl" ||
    (m.propType === PropType.HAND && isShift);
  const verb = isFloat
    ? "float"
    : (MOTION_VERB[m.motionType] ?? String(m.motionType));
  const from = locName(m.startLocation);
  const to = locName(m.endLocation);
  const n = typeof m.turns === "number" ? m.turns : 0;
  const turns = n > 0 ? `, ${n} turn${n === 1 ? "" : "s"}` : "";
  if (m.motionType === MotionType.STATIC || from === to) {
    return `${hand} hand ${verb} at ${from}${turns}`;
  }
  return `${hand} hand ${verb} ${from} to ${to}${turns}`;
}

/**
 * A one-sentence description of the pictograph for `aria-label` / metadata.
 * Pass the already-derived TnD mode (the renderer computes it) to skip a second
 * derivation; omit `opts` and it derives on its own.
 */
export function describePictograph(
  p: Describable | null | undefined,
  opts?: { tndMode?: TnDMode | null }
): string {
  const left = p?.motions?.left;
  const right = p?.motions?.right;
  if (!isVisibleMotion(left) && !isVisibleMotion(right))
    return "Pictograph (empty)";

  const startG = groupOf(p?.startPlacement);
  const endG = groupOf(p?.endPlacement);
  const startFull = startG ? (GROUP_NAME[startG] ?? startG) : null;
  const endFull = endG ? (GROUP_NAME[endG] ?? endG) : null;
  const posPhrase =
    startFull && endFull
      ? startG === endG
        ? startFull
        : `${startFull} to ${endFull}`
      : null;

  const letterPart = p?.letter ? `Letter ${p.letter}` : "Hand pictograph";
  const tndMode =
    opts && "tndMode" in opts
      ? opts.tndMode
      : deriveTnDFromPictograph(p as never).tndMode;
  const tndPart = tndMode ? TND_NAME[tndMode] : null;

  const head = [letterPart, posPhrase, tndPart].filter(Boolean).join(", ");
  const motions = [
    motionPhrase("Left", left),
    motionPhrase("Right", right),
  ].filter(Boolean);
  const motionSentence = motions.length ? motions.join("; ") + "." : "";

  return [head + ".", motionSentence].filter(Boolean).join(" ").trim();
}

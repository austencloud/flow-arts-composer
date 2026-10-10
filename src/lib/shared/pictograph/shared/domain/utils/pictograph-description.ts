import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
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

const LOCATION_NAME: Record<string, TranslationKey> = {
  n: "pictograph_desc_location_n",
  e: "pictograph_desc_location_e",
  s: "pictograph_desc_location_s",
  w: "pictograph_desc_location_w",
  ne: "pictograph_desc_location_ne",
  se: "pictograph_desc_location_se",
  sw: "pictograph_desc_location_sw",
  nw: "pictograph_desc_location_nw",
  c: "pictograph_desc_location_c",
};
const locName = (l: string | null | undefined): string =>
  l
    ? LOCATION_NAME[l.toLowerCase()]
      ? t(LOCATION_NAME[l.toLowerCase()]!)
      : l
    : "";

// α = hands at opposite points, β = same point, γ = right angle (TKA canon).
const GROUP_NAME: Record<string, TranslationKey> = {
  alpha: "pictograph_desc_group_alpha",
  beta: "pictograph_desc_group_beta",
  gamma: "pictograph_desc_group_gamma",
};
const groupOf = (pos: string | null | undefined): string | null => {
  if (!pos) return null;
  const m = pos.match(/[a-z]+/i);
  return m ? m[0].toLowerCase() : null;
};

const MOTION_VERB: Partial<Record<MotionType, TranslationKey>> = {
  [MotionType.PRO]: "pictograph_desc_motion_pro",
  [MotionType.ANTI]: "pictograph_desc_motion_anti",
  [MotionType.FLOAT]: "pictograph_desc_motion_float",
  [MotionType.DASH]: "pictograph_desc_motion_dash",
  [MotionType.STATIC]: "pictograph_desc_motion_static",
};

const TND_NAME: Record<TnDMode, TranslationKey> = {
  [TnDMode.SPLIT_SAME]: "pictograph_desc_timing_split_same",
  [TnDMode.SPLIT_OPP]: "pictograph_desc_timing_split_opp",
  [TnDMode.TOG_SAME]: "pictograph_desc_timing_tog_same",
  [TnDMode.TOG_OPP]: "pictograph_desc_timing_tog_opp",
  [TnDMode.QUARTER_SAME]: "pictograph_desc_timing_quarter_same",
  [TnDMode.QUARTER_OPP]: "pictograph_desc_timing_quarter_opp",
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
    ? t("pictograph_desc_motion_float")
    : MOTION_VERB[m.motionType]
      ? t(MOTION_VERB[m.motionType]!)
      : String(m.motionType);
  const from = locName(m.startLocation);
  const to = locName(m.endLocation);
  const n = typeof m.turns === "number" ? m.turns : 0;
  const turns =
    n > 0
      ? t(n === 1 ? "pictograph_desc_turn_one" : "pictograph_desc_turn_many", {
          count: n,
        })
      : "";
  const handName = t(
    hand === "Left" ? "pictograph_desc_left" : "pictograph_desc_right"
  );
  if (m.motionType === MotionType.STATIC || from === to) {
    return t("pictograph_desc_stationary", {
      hand: handName,
      motion: verb,
      location: from,
      turns,
    });
  }
  return t("pictograph_desc_moving", {
    hand: handName,
    motion: verb,
    from,
    to,
    turns,
  });
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
    return t("pictograph_desc_empty");

  const startG = groupOf(p?.startPlacement);
  const endG = groupOf(p?.endPlacement);
  const startFull = startG
    ? GROUP_NAME[startG]
      ? t(GROUP_NAME[startG])
      : startG
    : null;
  const endFull = endG ? (GROUP_NAME[endG] ? t(GROUP_NAME[endG]) : endG) : null;
  const posPhrase =
    startFull && endFull
      ? startG === endG
        ? startFull
        : t("pictograph_desc_placement_change", {
            from: startFull,
            to: endFull,
          })
      : null;

  const letterPart = p?.letter
    ? t("pictograph_desc_letter", { letter: p.letter })
    : t("pictograph_desc_hand_only");
  const tndMode =
    opts && "tndMode" in opts
      ? opts.tndMode
      : deriveTnDFromPictograph(p as never).tndMode;
  const tndPart = tndMode ? t(TND_NAME[tndMode]) : null;

  const head = [letterPart, posPhrase, tndPart].filter(Boolean).join(", ");
  const motions = [
    motionPhrase("Left", left),
    motionPhrase("Right", right),
  ].filter(Boolean);
  const motionSentence = motions.length ? motions.join("; ") + "." : "";

  return [head + ".", motionSentence].filter(Boolean).join(" ").trim();
}

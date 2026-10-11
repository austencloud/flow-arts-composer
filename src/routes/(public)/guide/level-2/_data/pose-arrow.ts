/**
 * End-direction arrows for the Level 2 "Turns" pedagogy frames.
 *
 * The original artboards draw a small red arrow on every halfway / thirds pose,
 * tracing where one staff END travels during that slice of the motion - pro as a
 * smooth curl, anti as the spiky zig-zag, dash as a shallow bow. The p3 caption
 * is the spec: *"These arrows refer to the pinky end on the first half, then the
 * thumb end on the second half. The full arrow depicts a half-circle, from the
 * start position's outer point."*
 *
 * The glyph is the app's OWN canonical motion-arrow (`static/images/arrows/*`,
 * cut from the same Illustrator source as the guide), inlined here so it renders
 * red with no async fetch - never a hand-rolled re-trace. Placement is driven by
 * the real animation engine (`poseAt`): we sample the traveling end at the slice
 * bounds to get A→B and map the glyph's tail→A / head→B. Same engine the printed
 * poses already use, so the arrow lands where playback puts the end.
 */
import { MotionType, RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { poseAt, type HalfwayMotion, type StaffPose } from "./halfway-pose";

const CENTER = 475; // 950 viewBox center (matches halfway-pose)
const STAFF_HALF = 125; // staff end offset from its center, in viewBox units (STAFF_D spans ~252)

/** One canonical arrow glyph: inlined path + the tail/head anchor points (in the
 *  glyph's own viewBox) that a slice's A→B maps onto. */
type Glyph = { d: string; w: number; h: number; tail: { x: number; y: number }; head: { x: number; y: number } };

// pro_1.0.svg - smooth curl (viewBox 126.9 x 242.5). Tail top-left, head = arrowhead tip at the base.
const PRO: Glyph = {
  d: "M49.4 241c-1.2 0-2.1-.2-2.5-.4C36 236 6 215.1.6 211.2c4-7.9 20.3-38.5 27.5-47.2.6-.8 3-2.7 7.1-2.7 2.8 0 5.8.9 8.9 2.8l-19.9 33.2 1-.1c60.3-6.4 87.3-50.3 87-88.3-.3-41.7-32.4-86.6-103.3-92.7C3 16 .4 11.9.5 8.2S3.3.5 9 .5h.5c36 1.5 66.1 13.8 87.1 35.6 18.5 19.2 29 44.9 29.5 72.2.8 46.5-29.2 98.8-97 104.1l-1.5.1L61 233.1c-4.2 6.8-9 7.9-11.6 7.9",
  w: 126.9,
  h: 242.5,
  tail: { x: 9, y: 5 },
  head: { x: 41, y: 236 },
};

// anti_1.0.svg - spiky zig-zag (viewBox 230.2 x 255.1). Tail top-left, head = arrowhead tip bottom-right.
const ANTI: Glyph = {
  d: "M186.5 255.1c-5 0-10-4.1-11.8-5.8l27.8-28.2-2.3-.1c-38.5-1.4-62.7-9.4-76-25.2-12.2-14.4-15.9-35.6-11.7-66.8l.2-1.5-1.4.3c-10.7 2.6-20.8 3.9-30 3.9-27.5 0-48.5-11.5-62.2-34.2C6.4 76.7 0 46.9 0 9.1 0 2.8 4.8 0 9.2 0c4.5 0 9.3 2.9 9.3 9.2 0 38.7 5.6 65.4 17 81.7 9.8 14 23.9 20.6 44.2 20.6 16.4 0 34.9-4.2 54.4-8.6l2-.5c-10.4 40.2-9.4 66.6 3.3 83 10.2 13.2 27.7 19.7 53.5 19.7 2.4 0 4.9-.1 7.5-.2l2.3-.1-27.9-27.4c1.8-1.6 6.7-5.6 11.6-5.6 1.8 0 3.5.6 5 1.7 8.5 6.2 34.5 35.2 38.8 39.9-4 4.6-28.1 32.3-38.8 40a8 8 0 0 1-4.9 1.7",
  w: 230.2,
  h: 255.1,
  tail: { x: 9, y: 6 },
  head: { x: 214, y: 235 },
};

// dash_1.0.svg - shallow bow (viewBox 522.7 x 87.1). Tail left, head = arrowhead at right.
const DASH: Glyph = {
  d: "M522.7 79.9c-.1 0 0 0 0 0-6.2 1.2-42.8 7.7-54.8 7.2-1.8 0-9.1-2.1-10.4-13.6l35.8-4.7C422 17.4 191.8-21.6 18.5 84 1.7 94.2-7.2 76.7 7.3 68 186.2-39.9 424 .7 504.4 52.7l-2.6-34.9c11.5-1.3 15.2 5.3 15.6 7.1 3.2 11.6 5 48.8 5.3 55",
  w: 522.7,
  h: 87.1,
  tail: { x: 12, y: 78 },
  head: { x: 512, y: 48 },
};

// static_1.0.svg - near-full loop (viewBox 108.3 x 216.8). Used centered for pivot (loop) slices.
const STATIC: Glyph = {
  d: "m48.5 210-23.3-16.8C137.5 180.2 139.3 31 11 11.8c-12.9-2-15.7 14.6-1.8 16.5C114.6 43.2 121 165.7 22.9 178.6l17.2-23.1s-9.3-7.1-14.8-1.6c-7.7 7.6-23.7 33.2-25.3 35.7 2.3 1.9 25.3 21.4 34.8 26.4 7 3.5 13.7-6.1 13.7-6",
  w: 108.3,
  h: 216.8,
  tail: { x: 54, y: 108 },
  head: { x: 54, y: 108 },
};

function glyphFor(type: MotionType): Glyph {
  switch (type) {
    case MotionType.PRO:
      return PRO;
    case MotionType.ANTI:
      return ANTI;
    case MotionType.DASH:
      return DASH;
    default:
      return STATIC;
  }
}

/** The two staff-end points (viewBox coords) for a pose: `+` = crossbar/+x end,
 *  `-` = plain/-x end. Ends sit ±STAFF_HALF from the staff center along `deg`. */
function ends(pose: StaffPose): { plus: Pt; minus: Pt } {
  const r = (pose.deg * Math.PI) / 180;
  const dx = Math.cos(r) * STAFF_HALF;
  const dy = Math.sin(r) * STAFF_HALF;
  return {
    plus: { x: pose.cx + dx, y: pose.cy + dy },
    minus: { x: pose.cx - dx, y: pose.cy - dy },
  };
}

type Pt = { x: number; y: number };
const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Which staff end is the "outer point" at fraction `t` - the one farther from
 *  the grid center, i.e. the end that traces the visible arc. `which` pins it to
 *  one physical end across a slice so A and B track the same end. */
function outerEnd(m: HalfwayMotion, t: number, which?: "plus" | "minus"): { pt: Pt; which: "plus" | "minus" } {
  const e = ends(poseAt(m, t));
  const pick = which ?? (dist2(e.plus, { x: CENTER, y: CENTER }) >= dist2(e.minus, { x: CENTER, y: CENTER }) ? "plus" : "minus");
  return { pt: pick === "plus" ? e.plus : e.minus, which: pick };
}

export type PoseArrow = { d: string; transform: string };

export type PoseArrowOpts = {
  /** Trace this physical end across the slice; default = the outer end at tEnd. */
  end?: "plus" | "minus";
  /** Flip the glyph across the A→B axis so the curl/zig bows the other way. */
  flip?: boolean;
  /** Uniform size nudge (1 = map head exactly onto B). */
  scale?: number;
};

/**
 * The end-direction arrow for the motion slice [tStart, tEnd]. Maps the glyph's
 * tail onto the traveling end's position at tStart and its head onto tEnd, so the
 * arrow spans exactly the arc the end travels. Returns an inlinable path + a full
 * SVG transform; the page renders `<g transform={a.transform}><path d={a.d}/></g>`.
 */
export function poseArrow(m: HalfwayMotion, tStart: number, tEnd: number, opts: PoseArrowOpts = {}): PoseArrow {
  const g = glyphFor(m.type);

  // Full-loop slice (static pivot, or an end that returns to itself): the tail→head
  // span collapses, so center the loop glyph on the pose and rotate to it.
  const endPick = outerEnd(m, tEnd, opts.end);
  const B = endPick.pt;
  const A = outerEnd(m, tStart, endPick.which).pt;
  const span = Math.sqrt(dist2(A, B));
  if (m.type === MotionType.STATIC || span < 24) {
    const pose = poseAt(m, tEnd);
    const s = (STAFF_HALF * 1.4 * (opts.scale ?? 1)) / Math.max(g.w, g.h);
    return {
      d: g.d,
      transform: `translate(${pose.cx} ${pose.cy}) rotate(${pose.deg}) scale(${s}) translate(${-g.w / 2} ${-g.h / 2})`,
    };
  }

  // Similarity map tail→A, head→B (translate·rotate·scale·[flip]·-tail).
  const u = { x: g.head.x - g.tail.x, y: g.head.y - g.tail.y };
  const v = { x: B.x - A.x, y: B.y - A.y };
  const uLen = Math.hypot(u.x, u.y) || 1;
  const s = (Math.hypot(v.x, v.y) / uLen) * (opts.scale ?? 1);
  const phi = ((Math.atan2(v.y, v.x) - Math.atan2(u.y, u.x)) * 180) / Math.PI;
  const flip = opts.flip ? " scale(1 -1)" : "";
  const tailY = opts.flip ? -g.tail.y : g.tail.y;
  return {
    d: g.d,
    transform: `translate(${A.x} ${A.y}) rotate(${phi}) scale(${s})${flip} translate(${-g.tail.x} ${-tailY})`,
  };
}

export const POSE_ARROW_RED = "#DC2626";

import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { CAP_HAND_PATHS } from "#lib/shared/guide-topics/caps-topic.js";
import {
  turnValuesForLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import { calculateEndOrientation } from "#lib/shared/render/core/calculations/orientation.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  GridMode,
  type GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { checkPoiString } from "./poi-string-check.js";

const OUT = process.env.SWEEP_OUT!;
const num = (k: string, d: string) =>
  (process.env[k] ?? d).split(",").map(Number);
const BPMS = num("BPMS", "60,90,120,150,180,210,240");
const RADII = num("RADII", "0.3,0.45,0.6,0.75,0.9");
const LENGTHS = num("LENGTHS", "0.6");
const TURNAROUNDS = num("TURNAROUNDS", "0.06");
const PATHS = num("PATHS", "1,2,3,4,5,6,7,8");
const TURNS = turnValuesForLevel(4).filter((t) => t !== "fl");
const RING: GridLocation[] = ["n", "e", "s", "w"] as GridLocation[];
const way = (a: GridLocation, b: GridLocation) =>
  (RING.indexOf(b) - RING.indexOf(a) + 4) % 4 === 1
    ? RotationDirection.CLOCKWISE
    : RotationDirection.COUNTER_CLOCKWISE;
const flip = (r: RotationDirection) =>
  r === RotationDirection.CLOCKWISE
    ? RotationDirection.COUNTER_CLOCKWISE
    : RotationDirection.CLOCKWISE;

type Beat = { motion: "pro" | "anti"; turns: number };
/** One hand's motions; repeats the path until the prop comes home pointing out. */
function handMotions(
  side: "left" | "right",
  start: GridLocation,
  path: readonly GridLocation[],
  beatOf: (i: number) => Beat
) {
  const out = [];
  let at = start,
    ori: Orientation = Orientation.OUT;
  for (let lap = 0; lap < 4; lap++) {
    path.forEach((to, i) => {
      const b = beatOf(i);
      const motionType = b.motion === "pro" ? MotionType.PRO : MotionType.ANTI;
      const w = way(at, to);
      const rotationDirection = b.motion === "pro" ? w : flip(w);
      const endOrientation = calculateEndOrientation({
        motionType,
        turns: b.turns,
        rotationDirection,
        startLocation: at,
        endLocation: to,
        startOrientation: ori,
      });
      out.push(
        createMotionData({
          motionType,
          rotationDirection,
          startLocation: at,
          endLocation: to,
          turns: b.turns,
          startOrientation: ori,
          endOrientation,
          hand: side === "left" ? HandSide.LEFT : HandSide.RIGHT,
          propType: PropType.POI,
          gridMode: GridMode.DIAMOND,
        })
      );
      at = to;
      ori = endOrientation;
    });
    if (ori === Orientation.OUT) break;
  }
  return out;
}

// Run as a Vitest test; see README.md.
it("sweep2", () => {
  const params: object[] = [];
  for (const bpm of BPMS)
    for (const handRadius of RADII)
      for (const stringLength of LENGTHS)
        for (const turnaroundBeats of TURNAROUNDS)
          params.push({
            bpm,
            handRadius,
            stringLength,
            turnaroundBeats,
            gravity: true,
          });
  const rows: unknown[] = [];
  for (const column of PATHS) {
    const cap = CAP_HAND_PATHS[column - 1]!.caps[0]!;
    for (const side of ["left", "right"] as const) {
      const hand = cap[side];
      for (const motion of ["anti", "pro"] as const)
        for (const on of TURNS)
          for (const third of TURNS) {
            // Left: two beats on, then back in the other motion. Right: the third beat
            // keeps the motion and may change turns, as Gage's Pro 1 → Pro 0.
            const back: "pro" | "anti" =
              side === "left" ? (motion === "pro" ? "anti" : "pro") : motion;
            const motions = handMotions(side, hand.start, hand.path, (i) =>
              i % 3 === 2
                ? { motion: back, turns: third as number }
                : { motion, turns: on as number }
            );
            const res = params.map((p) => {
              try {
                const r = checkPoiString(motions, p as never);
                return [
                  +Math.max(...r.beats.map((b) => b.maxLean)).toFixed(1),
                  +Math.min(...r.beats.map((b) => b.minTension)).toFixed(2),
                ];
              } catch {
                return null;
              }
            });
            rows.push({
              path: column,
              side,
              motion,
              on,
              third,
              beats: motions.length,
              res,
            });
          }
    }
  }
  writeFileSync(OUT, JSON.stringify({ params, rows }));
}, 7_200_000);

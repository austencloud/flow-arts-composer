/**
 * Fits one CAP trace to its frame on /notation/caps.
 *
 * The player and the ghost mandala both draw with the hand circle's centre at
 * the centre of their square stage, so a quarter CAP sits in one corner and
 * leaves most of the frame empty. This works out where to put that stage
 * inside the frame so the shape itself is centred and fills the frame.
 *
 * Units. The mandala calculator returns paths centred on (0, 0), y down, with
 * the hand circle at radius 80. The engine-aligned painter maps those units
 * onto a stage of side S at S/950 * 150/80 per unit (the hand circle lands on
 * the engine's 150 orbit in its 950 viewbox). Everything
 * here is returned as fractions of the frame's side, so the caller only has
 * to turn them into percentages.
 */
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import {
  MANDALA_GRID_RADIUS,
  ENGINE_GRID_RADIUS,
} from "#lib/shared/mandala/domain/mandala-constants.js";
import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Mandala units to fractions of the stage side. */
const UNIT = ENGINE_GRID_RADIUS / MANDALA_GRID_RADIUS / VIEWBOX_SIZE;

/** The club's visible tip, the same reach the ghost and trail use. */
export const CLUB_TIP_DX = 150;

/* Room around the traced shape, in mandala units: the club head's width and
   the trail's glow reach past the tip line by about this much. */
const PAD = 16;

/** Share of the frame side the padded shape fills. */
export const FILL = 0.84;

const ANGLE: Record<string, number> = {
  e: 0,
  s: Math.PI / 2,
  w: Math.PI,
  n: (3 * Math.PI) / 2,
};

export interface CapTraceFit {
  /** Left edge of the stage, as a fraction of the frame side. */
  translateX: number;
  /** Top edge of the stage, as a fraction of the frame side. */
  translateY: number;
  /** Side of the stage, as a multiple of the frame side. */
  scale: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function grow(box: Box, x: number, y: number): void {
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x);
  box.maxY = Math.max(box.maxY, y);
}

/**
 * The shape's box in mandala units: every point of the tip path (the paths are
 * dense cubic runs, so their control points sit on the curve's hull) plus the
 * hand's arc, so the club's whole length stays inside.
 */
export function capTraceBox(sequence: SequenceData): Box {
  const paths = calculateMandalaGeometry(
    sequence.steps,
    undefined,
    undefined,
    { tipEnds: 1, pathShape: "arc" },
    { dx: CLUB_TIP_DX, dy: 0 }
  );
  const box: Box = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const path of paths.right) {
    const nums = path.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2)
      grow(box, nums[i]!, nums[i + 1]!);
  }
  for (const step of sequence.steps) {
    const m = step.motions.right;
    if (!m) continue;
    const a = ANGLE[m.startLocation];
    const b = ANGLE[m.endLocation];
    if (a === undefined || b === undefined) continue;
    // Shortest way round between two neighbouring points of the diamond.
    let delta = b - a;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    for (let t = 0; t <= 8; t++) {
      const th = a + (delta * t) / 8;
      grow(
        box,
        MANDALA_GRID_RADIUS * Math.cos(th),
        MANDALA_GRID_RADIUS * Math.sin(th)
      );
    }
  }
  return box;
}

/**
 * Where the stage goes inside the frame. A point at stage fraction f lands at
 * frame fraction translate + scale * f, so the padded box's centre lands on
 * 0.5 and its longer side spans FILL of the frame.
 */
export function capTraceFit(sequence: SequenceData): CapTraceFit {
  const box = capTraceBox(sequence);
  const toStage = (v: number) => 0.5 + v * UNIT;
  const minX = toStage(box.minX - PAD);
  const maxX = toStage(box.maxX + PAD);
  const minY = toStage(box.minY - PAD);
  const maxY = toStage(box.maxY + PAD);
  const scale = FILL / Math.max(maxX - minX, maxY - minY);
  return {
    translateX: 0.5 - scale * ((minX + maxX) / 2),
    translateY: 0.5 - scale * ((minY + maxY) / 2),
    scale,
  };
}

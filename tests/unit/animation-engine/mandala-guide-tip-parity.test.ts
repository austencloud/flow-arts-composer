/**
 * The live mandala guide is a promise about the props: every point a traced
 * tip passes through lies on the guide, and the guide draws nothing the tips
 * never reach. This follows real Shape Engine realizations through the same
 * code the animator runs (per-beat interpolation, trail endpoints, the
 * square-to-frame offset) and through the same code the guide runs (path
 * preparation and the overlay canvas's transform), then compares the two in
 * the overlay's CSS pixels.
 *
 * Wide frames matter: the Shape Engine stage is wider than tall, so the
 * engine's square sits centred in a wider overlay. A guide scaled by the
 * overlay's width instead of the square's side came out 1.5x the traced path.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

import type { CsvEdge } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { parseCsvEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { applyVariationDescriptor } from "#lib/features/choreo-card/services/deck-variation.js";
import { hydrateSequence } from "#lib/features/choreo-card/services/sequence-render-hydrator.js";
import { buildFlowerSequence } from "#lib/features/lab/vtg-lab/services/build-flower-sequence.js";
import {
  frameOffset,
  measureFrame,
  squareFrame,
  type CanvasFrame,
} from "#lib/shared/animation-engine/domain/types/canvas-frame.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import {
  getDefaultTrailPointConfig,
  resolveTrailPointConfig,
} from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { calculateTrailSourceEndpoint } from "#lib/shared/animation-engine/services/prop-position-calculator.js";
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "#lib/shared/mandala/domain/mandala-overlay-types.js";
import { MandalaOverlayCanvas } from "#lib/shared/mandala/services/mandala-overlay-canvas.js";
import { MandalaPathPreparer } from "#lib/shared/mandala/services/mandala-path-preparer.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  flowerPetals,
  type FlowerStyle,
  type RotatingFlower,
} from "#lib/shared/shape-matrix/domain/flower-signature.js";
import type { RotationStyle } from "#lib/shared/shape-matrix/domain/rotation-style.js";
import { resolveFlowerArchetype } from "#lib/shared/shape-matrix/services/flower-archetype.js";
import {
  buildBaseIndex,
  resolveBase,
} from "#lib/shared/shape-matrix/services/build-realization-sequence.js";
import {
  classifyRotationStyleMembers,
  representativeRotationStyleMember,
  type RotationStyleArchetype,
} from "#lib/shared/shape-matrix/services/rotation-style-archetypes.js";
import {
  solvePropRelationshipPhase,
  type FlowerParityTarget,
} from "#lib/shared/shape-matrix/services/solve-prop-relationship-phase.js";
import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import baseWords from "../../../static/data/hero/tnd-base-words.json";

interface Pt {
  x: number;
  y: number;
}

/** Pixels a traced tip may sit off the painted guide: under a stroke width. */
const TOLERANCE_PX = 1;
const ENGINE_SAMPLES_PER_BEAT = 96;

// ── Real Shape Engine realizations ──────────────────────────────────────────

let index: Map<string, SequenceData>;
let edges: CsvEdge[];
let matrices: RotationStyleArchetype[];

function flower(style: FlowerStyle, turns: number, ori: "in" | "out"): RotatingFlower {
  return { style, turns, ori, grid: "diamond", petals: flowerPetals({ style, turns }) };
}

/** The clicked cell's two flowers, built the way the matrix builds them. */
function matrixTarget(pair: { left: RotatingFlower; right: RotatingFlower }): FlowerParityTarget {
  const points = getTipPoints(PropType.STAFF).points;
  const source = getDefaultTrailPointConfig(PropType.STAFF, points).right;
  if (source.type !== "tip") throw new Error("Staff right source is not a tip");
  const tip = points[source.index]!;
  const handFlower = (f: RotatingFlower) =>
    calculateMandalaGeometry(
      buildFlowerSequence(
        resolveFlowerArchetype(matrices, f.style),
        f,
        "left",
        edges,
        PropType.STAFF
      ).steps,
      undefined,
      undefined,
      { tipEnds: 1, pathShape: "arc" },
      tip
    ).left;
  return { left: handFlower(pair.left), right: handFlower(pair.right), tips: { left: tip, right: tip } };
}

const realizations = new Map<string, SequenceData>();

function realization(
  pair: { left: RotatingFlower; right: RotatingFlower },
  handMode: VtgMode,
  propMode: VtgMode
): SequenceData {
  const key = JSON.stringify([pair, handMode, propMode]);
  const cached = realizations.get(key);
  if (cached) return cached;
  const sequence = solveRealization(pair, handMode, propMode);
  realizations.set(key, sequence);
  return sequence;
}

function solveRealization(
  pair: { left: RotatingFlower; right: RotatingFlower },
  handMode: VtgMode,
  propMode: VtgMode
): SequenceData {
  const base = resolveBase(index, handMode, pair.left.style, pair.right.style);
  if (!base) throw new Error(`No ${handMode} base for this pair`);
  const solved = solvePropRelationshipPhase(base, pair, propMode, edges, matrixTarget(pair));
  if (!solved) throw new Error(`No ${handMode}→${propMode} phase for this pair`);
  return solved.sequence;
}

beforeAll(() => {
  const words = baseWords.map((record) => hydrateSequence(record));
  edges = parseCsvEdges(
    readFileSync(resolve("static/data/pictographs/DiamondPictographDataframe.csv"), "utf8")
  );
  index = buildBaseIndex(words);
  const classified = classifyRotationStyleMembers(words, "diamond");
  matrices = (["iso", "antispin", "hybrid"] as RotationStyle[]).flatMap((style) => {
    const members = classified.get(style) ?? [];
    if (members.length === 0) return [];
    const sequence = applyVariationDescriptor(
      representativeRotationStyleMember(members),
      { turnPattern: "0|0", turnLabel: "test-archetype", gridMode: "diamond" },
      edges
    ).sequence;
    return [{ style, byTurn: new Map([["0|0", sequence]]) }];
  });
});

// ── The animator's side: where each traced tip actually goes ────────────────

const ARC_PATHS = {
  getPathPolicy: () => ({ pathShape: "arc", motionAwarePaths: false }),
} as unknown as AnimationVisibilityStateManager;

function tracedTips(
  steps: readonly StepData[],
  hand: "left" | "right",
  propType: PropType,
  frame: CanvasFrame
): Pt[][] {
  const offset = frameOffset(frame);
  const config = resolveTrailPointConfig(propType, TrackingMode.BOTH_ENDS);
  const sources = [config.left, config.right].filter((s) => s.type !== "none");
  const endpointConfig = {
    canvasSize: frame.size,
    propDimensions: getPropDimensions(propType),
    flipped: false,
  };
  return sources.map((source) => {
    const trace: Pt[] = [];
    for (const step of steps) {
      for (let i = 0; i <= ENGINE_SAMPLES_PER_BEAT; i++) {
        const angles = interpolatePropAngles(step, i / ENGINE_SAMPLES_PER_BEAT, ARC_PATHS);
        const prop = hand === "left" ? angles.leftAngles : angles.rightAngles;
        if (!prop) continue;
        const tip = calculateTrailSourceEndpoint(prop, endpointConfig, source, propType);
        if (tip) trace.push({ x: tip.x + offset.x, y: tip.y + offset.y });
      }
    }
    return trace;
  });
}

// ── The guide's side: where the overlay paints each path ────────────────────

type Matrix = [number, number, number, number, number, number];

class FakePath2D {
  constructor(readonly d: string) {}
}

interface Stroke {
  d: string;
  matrix: Matrix;
}

function matrixContext(strokes: Stroke[]) {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  return {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    save: () => stack.push([...m]),
    restore: () => {
      m = stack.pop() ?? m;
    },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      m = [a, b, c, d, e, f];
    },
    translate: (x: number, y: number) => {
      m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y];
    },
    scale: (sx: number, sy: number) => {
      m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]];
    },
    stroke: (path: FakePath2D) => strokes.push({ d: path.d, matrix: [...m] }),
    clearRect: () => {},
    fillRect: () => {},
    setLineDash: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    putImageData: () => {},
  };
}

/**
 * Sample a painted path (`M` then cubic `C` segments, as the geometry
 * calculator writes it) and map it through the transform it was stroked with.
 */
function paintedPoints(stroke: Stroke, dpr: number): Pt[] {
  const n = (stroke.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const [a, b, c, d, e, f] = stroke.matrix;
  const toCss = (x: number, y: number): Pt => ({
    x: (a * x + c * y + e) / dpr,
    y: (b * x + d * y + f) / dpr,
  });
  let x0 = n[0]!;
  let y0 = n[1]!;
  const out: Pt[] = [toCss(x0, y0)];
  const STEPS = 8;
  for (let i = 2; i + 5 < n.length; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6) as [number, number, number, number, number, number];
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const u = 1 - t;
      out.push(
        toCss(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        )
      );
    }
    x0 = x3;
    y0 = y3;
  }
  return out;
}

function paintGuide(
  steps: readonly StepData[],
  leftPropType: PropType,
  rightPropType: PropType,
  frame: CanvasFrame,
  dpr: number
): { left: Pt[][]; right: Pt[][] } {
  Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });
  const strokes: Stroke[] = [];
  const main = matrixContext([]);
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    parentElement: null as unknown,
    setAttribute: () => {},
    getContext: () => main,
  };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
  const contexts: ReturnType<typeof matrixContext>[] = [];
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        // Only the first offscreen canvas is the guide buffer; the others are
        // overlap masks and the crossfade snapshot.
        const context = matrixContext(contexts.length === 0 ? strokes : []);
        contexts.push(context);
        return context;
      }
    }
  );
  const container = {
    firstChild: null,
    insertBefore: (child: typeof canvas) => {
      child.parentElement = container;
      return child;
    },
    removeChild: () => {},
  };

  const prepared = new MandalaPathPreparer().prepare(steps, frame.size, {
    show: "both",
    leftPropType,
    rightPropType,
    trackingMode: TrackingMode.BOTH_ENDS,
    pathOptions: { pathShape: "arc", motionAware: false },
    leftColor: "#3575E2",
    rightColor: "#ED1C24",
  });
  if (!prepared) throw new Error("No guide prepared");

  // The lifecycle manager allocates the overlay at the measured frame, and the
  // render loop keeps it there; the renderer's canvas size is the square side.
  const overlay = new MandalaOverlayCanvas();
  overlay.initialize(container as unknown as HTMLElement, frame.width, frame.height);
  overlay.renderFrame({
    preparedPaths: prepared,
    progress: 1,
    config: { ...DEFAULT_MANDALA_OVERLAY_CONFIG, enabled: true, mode: "guide", opacity: 0.55 },
    deltaTime: 1 / 60,
    currentTime: 0,
    canvasSize: frame.size,
    currentStep: 0,
  });
  overlay.dispose();

  const handOf = new Map(prepared.paths.map((p) => [(p.path2d as unknown as FakePath2D).d, p.hand]));
  const out = { left: [] as Pt[][], right: [] as Pt[][] };
  for (const stroke of strokes) {
    const hand = handOf.get(stroke.d);
    if (hand) out[hand].push(paintedPoints(stroke, dpr));
  }
  return out;
}

// ── Comparison ──────────────────────────────────────────────────────────────

type Segment = readonly [Pt, Pt];

function distanceToSegment(p: Pt, [a, b]: Segment): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Farthest any point of `from` sits from the nearest of `to`'s lines. */
function worstGap(from: readonly Pt[][], to: readonly Pt[][]): number {
  const segments: Segment[] = to.flatMap((line) =>
    line.slice(1).map((b, i): Segment => [line[i]!, b])
  );
  // Bucket segments by a coarse grid so a point only measures its neighbours;
  // a point with no neighbour within a cell falls back to every segment, so a
  // failure still reports the real gap.
  const CELL = 4;
  const grid = new Map<string, Segment[]>();
  for (const seg of segments) {
    const [a, b] = seg;
    for (let cx = Math.floor((Math.min(a.x, b.x) - CELL) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + CELL) / CELL); cx++) {
      for (let cy = Math.floor((Math.min(a.y, b.y) - CELL) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + CELL) / CELL); cy++) {
        const key = `${cx},${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(seg);
        else grid.set(key, [seg]);
      }
    }
  }
  let worst = 0;
  for (const line of from) {
    for (const p of line) {
      const near = grid.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`) ?? segments;
      let gap = Infinity;
      for (const seg of near) gap = Math.min(gap, distanceToSegment(p, seg));
      worst = Math.max(worst, gap);
    }
  }
  return worst;
}

// ── Cases ───────────────────────────────────────────────────────────────────

const FRAMES: Array<[string, CanvasFrame]> = [
  // The Shape Engine stage at 1600x1000: the reported mismatch.
  ["wide stage", measureFrame(577, 382)],
  ["tall stage", measureFrame(382, 577)],
  ["square", squareFrame(500)],
];

const CASES: Array<{
  name: string;
  pair: { left: RotatingFlower; right: RotatingFlower };
  handMode: VtgMode;
  propMode: VtgMode;
  props: { left: PropType; right: PropType };
}> = [
  {
    // The reported URL: Water hands, Fire props, 2|2 staffs, pro × anti.
    name: "SS hands, SO props, pro-2 × anti-2 staffs",
    pair: { left: flower("pro", 2, "in"), right: flower("anti", 2, "in") },
    handMode: "SS",
    propMode: "SO",
    props: { left: PropType.STAFF, right: PropType.STAFF },
  },
  {
    name: "QS hands, QS props, pro-1 × pro-1, staff and club",
    pair: { left: flower("pro", 1, "out"), right: flower("pro", 1, "out") },
    handMode: "QS",
    propMode: "QS",
    props: { left: PropType.STAFF, right: PropType.CLUB },
  },
  {
    name: "TO hands, SS props, pro-1 × anti-1 buugeng",
    pair: { left: flower("pro", 1, "out"), right: flower("anti", 1, "in") },
    handMode: "TO",
    propMode: "SS",
    props: { left: PropType.BUUGENG, right: PropType.BUUGENG },
  },
];

describe("live mandala guide ↔ traced prop tips", () => {
  beforeEach(() => {
    vi.stubGlobal("Path2D", FakePath2D);
    vi.spyOn(document, "createElementNS").mockImplementation(
      () =>
        ({
          setAttribute: () => {},
          getTotalLength: () => 1,
        }) as unknown as SVGPathElement
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const testCase of CASES) {
    for (const [frameName, frame] of FRAMES) {
      it.each([1, 2])(`${testCase.name}: tips ride the guide on a ${frameName} at DPR %s`, (dpr) => {
        const steps = realization(testCase.pair, testCase.handMode, testCase.propMode).steps;
        const guide = paintGuide(steps, testCase.props.left, testCase.props.right, frame, dpr);

        for (const hand of ["left", "right"] as const) {
          const traced = tracedTips(steps, hand, testCase.props[hand], frame);
          expect(traced.length, `${hand} traced sources`).toBeGreaterThan(0);
          expect(guide[hand].length, `${hand} guide paths`).toBeGreaterThan(0);
          // Every traced tip lies on the guide...
          expect(worstGap(traced, guide[hand]), `${hand} tip off the guide`).toBeLessThan(TOLERANCE_PX);
          // ...and the guide draws only where a tip goes.
          expect(worstGap(guide[hand], traced), `${hand} guide off the tips`).toBeLessThan(TOLERANCE_PX);
        }
      });
    }
  }
});

/**
 * The pedestal's top face: the generated figure of the sequence performed above
 * it, rendered as a texture-ready SVG.
 *
 * GENERATED, NEVER DRAWN. The Earth Long Terrace Gate 1 review (2026-08-08,
 * findings I4 and I11) caught a hand-drawn board showing letter G as two rings
 * side by side, when both of G's hands are at beta — the props are co-located
 * and their traces are concentric, not adjacent. The board drew the two props
 * in different places in a room whose whole subject is that they are in the
 * same place. A drawn motif can lie about the domain; one computed from the
 * bound sequence cannot. That review's own remediation was to generate the
 * trace from the prop-tip path, and this module is where the museum does it.
 *
 * Spec: docs/superpowers/specs/2026-08-16-museum-pedestal-and-console-design.md
 */
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
import { MANDALA_STANDARD_TIP_DX } from "#lib/shared/mandala/domain/mandala-constants.js";
import type {
  MandalaPalette,
  MandalaPaths,
} from "#lib/shared/mandala/domain/mandala-types.js";
import { MUSEUM_EXHIBIT_SEQUENCES } from "#lib/features/museum/data/museum-exhibit-sequences.js";
import { faceTraceCount } from "#lib/features/museum/domain/pedestal-standard.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

/** Rendered face resolution. Square, and a power of two for GPU sampling. */
const FACE_PX = 1024;

export interface PedestalFaceOptions {
  /** Key into MUSEUM_EXHIBIT_SEQUENCES. */
  sequenceId: string;
  /** What the performer above is holding. Decides the trace count. */
  propType: string;
  /**
   * Wing tint. The figure is drawn in one colour per wing rather than in the
   * app's left/right prop identity — a pedestal is architecture, not a pictograph,
   * and two prop colours on a stone face reads as decoration.
   */
  tint: string;
  /** Face size in pixels. Defaults to 1024. */
  size?: number;
  /**
   * Draw the HAND path rather than the prop-tip path.
   *
   * This is the wing opener's face. The opener shows the path with nothing in
   * the hands, so the trace is taken at the hand itself — tip offset zero —
   * rather than out at a prop's end. Same sequence, same generator, the figure
   * the three cases then apply a prop to.
   */
  handPathOnly?: boolean;
  /**
   * Steps to draw INSTEAD of the bound sequence's own.
   *
   * The console path. A visitor who reverses a performer's path or swaps which
   * hand plays which role is looking at a transform of the case's own record,
   * so the face has to be regenerated from those steps rather than from the
   * ones on file. `sequenceId` stays required even here: a face is never built
   * without naming the record it belongs to, and the id is still what proves
   * the record exists.
   */
  steps?: readonly StepData[];
}

export interface PedestalFace {
  /** The SVG source, for a texture loader or an inline preview. */
  svg: string;
  /** How many copies of the figure this prop draws: 2 bilateral, 1 unilateral. */
  traceCount: 1 | 2;
  /** True when the sequence produced no drawable path at all. */
  empty: boolean;
}

/**
 * A one-colour palette.
 *
 * The mandala renderer wants blue and red because it normally shows prop
 * identity. Here both hands draw the wing's own colour, so the face reads as a
 * single figure rather than as two competing ones.
 */
function monochromePalette(tint: string): MandalaPalette {
  return {
    leftStroke: tint,
    leftFill: tint,
    rightStroke: tint,
    rightFill: tint,
    purpleStroke: tint,
    purpleFill: tint,
  };
}

/** Both ends of one bilateral prop, drawn as one figure. */
function mergePaths(a: MandalaPaths, b: MandalaPaths): MandalaPaths {
  return {
    left: [...a.left, ...b.left],
    right: [...a.right, ...b.right],
    purple: [...a.purple, ...b.purple],
  };
}

/**
 * Give the SVG an intrinsic pixel size.
 *
 * `renderMandalaSVG` emits `width="100%" height="100%"` because its usual home
 * is an inline responsive box. A texture loader has no box: it hands the string
 * to an `<img>`, and an SVG with only percentage dimensions has no intrinsic
 * size, so the browser falls back to its 300px default and the face arrives at
 * a fraction of the resolution asked for. Stamping real dimensions on the root
 * element is the whole fix, and it leaves the shared renderer alone.
 */
function withIntrinsicSize(svg: string, size: number): string {
  return svg.replace(
    'width="100%" height="100%"',
    `width="${size}" height="${size}"`
  );
}

/**
 * Build the face for a bound museum sequence.
 *
 * Throws on an unknown sequence id rather than falling back to something
 * plausible. A pedestal showing the wrong figure is worse than a pedestal
 * showing none — the whole point of the object is that it cannot lie.
 */
export function buildPedestalFace(options: PedestalFaceOptions): PedestalFace {
  const {
    sequenceId,
    propType,
    tint,
    size = FACE_PX,
    handPathOnly = false,
  } = options;

  const sequence = MUSEUM_EXHIBIT_SEQUENCES[sequenceId];
  if (!sequence) {
    throw new Error(
      `Pedestal face: no bound museum sequence "${sequenceId}". ` +
        `Known ids: ${Object.keys(MUSEUM_EXHIBIT_SEQUENCES).join(", ")}`
    );
  }
  const steps = options.steps ?? sequence.steps;

  // Both hands always draw — that is not what bilaterality decides. What a
  // bilateral prop adds is a second END: held at its centre, a staff sweeps a
  // figure with the far end and a second, mirrored one with the near end. A
  // unilateral prop is held at one end, so only the far end draws.
  //
  // So the figure belongs to the hand, and the copy count belongs to the prop.
  const traceCount = handPathOnly ? 1 : faceTraceCount(propType);

  // The opener draws at the hand itself (offset zero) — the path with nothing
  // in the hands, which the three cases then apply a prop to.
  const farEnd = calculateMandalaGeometry(
    steps,
    propType,
    propType,
    undefined,
    handPathOnly ? { dx: 0, dy: 0 } : undefined
  );

  const paths: MandalaPaths =
    traceCount === 2
      ? mergePaths(
          farEnd,
          calculateMandalaGeometry(steps, propType, propType, undefined, {
            dx: -MANDALA_STANDARD_TIP_DX,
            dy: 0,
          })
        )
      : farEnd;

  const svg = withIntrinsicSize(
    renderMandalaSVG(paths, {
      size,
      style: "stroke",
      show: "both",
      strokeWidth: 6,
      palette: monochromePalette(tint),
    }),
    size
  );

  const empty = paths.left.length === 0 && paths.right.length === 0;

  return { svg, traceCount, empty };
}

/** The face as a data URI, ready for a texture loader. */
export function pedestalFaceDataUri(options: PedestalFaceOptions): string {
  const { svg } = buildPedestalFace(options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

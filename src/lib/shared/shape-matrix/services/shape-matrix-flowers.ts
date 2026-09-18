import type {
  MandalaPaths,
  MandalaPathShape,
} from "$lib/shared/mandala/domain/mandala-types";
import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { getMandalaPathOptions } from "$lib/shared/mandala/services/mandala-path-options";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import {
  getTipPoints,
  type TipPoint,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { getDefaultTrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  asPropPair,
  type ShapeMatrixPropPair,
  type ShapeMatrixReachPair,
  type ShapeMatrixTipPair,
} from "../domain/prop-pair";
import { resolveRotationStyleArchetypes } from "./rotation-style-archetypes";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { buildFlowerSequence } from "$lib/features/lab/vtg-lab/services/build-flower-sequence";
import {
  buildShapeMatrixAxis,
  flowerKey,
  type Flower,
} from "../domain/flower-signature";
import { resolveFlowerArchetype } from "./flower-archetype";

export interface ShapeMatrixData {
  axis: Flower[];
  /** flowerKey → blue-hand MandalaPaths (its .blue populated). */
  left: Map<string, MandalaPaths>;
  /** flowerKey → red-hand MandalaPaths (its .red populated). */
  right: Map<string, MandalaPaths>;
  /** The prop each hand was traced with. */
  props: ShapeMatrixPropPair;
  /** Canonical tracked source per hand, used by paths, parity, and live trails. */
  tips: ShapeMatrixTipPair;
  /** Per-hand radial reach of that tracked source. */
  reach: ShapeMatrixReachPair;
  /**
   * The larger reach. Every painter, the Theory pane and the Theory detail
   * scale by it, so cells, headers and the diagonal share one scale.
   */
  clubTipDx: number;
  /** Identifies the exact path and trace geometry behind this matrix. */
  geometryKey?: string;
}

export interface ShapeMatrixLoadOptions {
  pathShape?: MandalaPathShape;
  trace?: "hands" | "tips";
  /** The fixed policy that Hybrid preserves for float and other non-spin motions. */
  hybridFallback?: "arc" | "linear" | "concave";
}

interface ResolvedLoadOptions {
  pathShape: MandalaPathShape;
  trace: "hands" | "tips";
  hybridFallback: "arc" | "linear" | "concave";
  geometryKey: string;
}

const cache = new Map<string, Promise<ShapeMatrixData>>();
let flowerSources: Promise<{
  matrices: Awaited<ReturnType<typeof resolveRotationStyleArchetypes>>;
  edges: Awaited<ReturnType<typeof loadDiamondEdges>>;
}> | null = null;

class LazyPathMap extends Map<string, MandalaPaths> {
  constructor(
    private readonly resolvePath: (key: string) => MandalaPaths | undefined
  ) {
    super();
  }

  override get(key: string): MandalaPaths | undefined {
    const cached = super.get(key);
    if (cached) return cached;

    const resolved = this.resolvePath(key);
    if (resolved) super.set(key, resolved);
    return resolved;
  }
}

/**
 * A single prop, or an equal pair, is one cached build. A mixed pair awaits
 * both hands' single builds and stitches them: the left map from the left
 * prop, the right map from the right prop. The maps are lazy, so composition
 * is cheap and is not cached on its own; switching one hand reuses the other
 * hand's warm build.
 */
export function loadShapeMatrix(
  props: PropType | ShapeMatrixPropPair = PropType.STAFF,
  options: ShapeMatrixLoadOptions = {}
): Promise<ShapeMatrixData> {
  const pair = asPropPair(props);
  if (pair.left === pair.right) return loadSingle(pair.left, options);
  return Promise.all([
    loadSingle(pair.left, options),
    loadSingle(pair.right, options),
  ]).then(([left, right]) => composeShapeMatrix(left, right));
}

function loadSingle(
  propType: PropType,
  options: ShapeMatrixLoadOptions
): Promise<ShapeMatrixData> {
  const resolved = resolveLoadOptions(options);
  const key = `${propType}|${resolved.geometryKey}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = build(propType, resolved);
  cache.set(key, pending);
  void pending.catch(() => {
    // A transient fetch failure must not turn the matrix's retry button into
    // a permanent replay of the same rejected promise.
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

function composeShapeMatrix(
  left: ShapeMatrixData,
  right: ShapeMatrixData
): ShapeMatrixData {
  return {
    axis: left.axis,
    left: left.left,
    right: right.right,
    props: { left: left.props.left, right: right.props.right },
    tips: { left: left.tips.left, right: right.tips.right },
    reach: { left: left.reach.left, right: right.reach.right },
    clubTipDx: Math.max(left.reach.left, right.reach.right),
    geometryKey: left.geometryKey,
  };
}

function resolveLoadOptions(
  options: ShapeMatrixLoadOptions
): ResolvedLoadOptions {
  const pathShape = options.pathShape ?? "arc";
  const trace = options.trace ?? "tips";
  const hybridFallback = options.hybridFallback ?? "arc";
  return {
    pathShape,
    trace,
    hybridFallback,
    geometryKey:
      pathShape === "hybrid"
        ? `${pathShape}:${hybridFallback}:${trace}`
        : `${pathShape}:${trace}`,
  };
}

export function shapeMatrixTipPoint(propType: PropType): TipPoint | null {
  const points = getTipPoints(propType).points;
  const source = getDefaultTrailPointConfig(propType, points).right;
  if (source.type === "tip") return points[source.index] ?? null;
  if (source.type === "custom") return { dx: source.dx, dy: source.dy };
  return null;
}

function loadFlowerSources() {
  if (flowerSources) return flowerSources;
  const pending = Promise.all([
    resolveRotationStyleArchetypes("diamond"),
    loadDiamondEdges(),
  ]).then(([matrices, edges]) => ({ matrices, edges }));
  flowerSources = pending;
  void pending.catch(() => {
    if (flowerSources === pending) flowerSources = null;
  });
  return pending;
}

async function build(
  propType: PropType,
  options: ResolvedLoadOptions
): Promise<ShapeMatrixData> {
  const { matrices, edges } = await loadFlowerSources();
  const proArch = resolveFlowerArchetype(matrices, "pro");
  const antiArch = resolveFlowerArchetype(matrices, "anti");
  const tip =
    options.trace === "hands"
      ? { dx: 0, dy: 0 }
      : shapeMatrixTipPoint(propType);
  if (!tip)
    throw new Error(`Prop ${propType} has no tracked Shape Matrix source`);
  const clubTipDx = Math.hypot(tip.dx, tip.dy);

  const axis = buildShapeMatrixAxis();
  const flowerByKey = new Map(
    axis.map((flower) => [flowerKey(flower), flower])
  );
  const canonicalPaths = new Map<string, MandalaPaths>();
  const pathsFor = (key: string): MandalaPaths | undefined => {
    const cached = canonicalPaths.get(key);
    if (cached) return cached;

    const f = flowerByKey.get(key);
    if (!f) return undefined;
    const startedAt = import.meta.env.DEV ? performance.now() : 0;
    const arch = f.style === "anti" ? antiArch : proArch;
    // ONE canonical locus per flower descriptor (computed from the left hand),
    // reused on both axes so the row header, the column header, and the diagonal
    // cell are geometrically identical — only the stroke color differs.
    // Computing the right axis from its own hand point-reflects the shape (the
    // hands are anchored at opposite points), which desyncs the two axes and
    // stops the diagonal from overlapping into a clean purple pictograph.
    const seq = buildFlowerSequence(arch, f, "left", edges, propType);
    // Hybrid assigns pro and anti their canonical paths while preserving the
    // selected fixed path for float motions, exactly as the live guide does.
    const preview = applySequencePathPreview(seq, {
      pathShape:
        options.pathShape === "hybrid"
          ? options.hybridFallback
          : options.pathShape,
      motionAwarePaths: options.pathShape === "hybrid",
    });
    const paths = calculateMandalaGeometry(
      preview?.steps ?? seq.steps,
      undefined,
      undefined,
      getMandalaPathOptions(options.pathShape, 1),
      tip
    );
    canonicalPaths.set(key, paths);
    if (import.meta.env.DEV) {
      performance.measure(
        `shape-matrix:path:${propType}:${options.geometryKey}:${key}`,
        {
          start: startedAt,
          end: performance.now(),
        }
      );
    }
    return paths;
  };

  // The explorer only displays one turn band per axis. Materializing all 116
  // descriptors here made every cold visit pay for paths the user might never
  // open. These maps retain the same geometry owner while computing a flower
  // on first use and sharing that locus between the blue and red axes.
  const left = new LazyPathMap(pathsFor);
  const right = new LazyPathMap((key) => {
    const paths = pathsFor(key);
    return paths ? { left: [], right: paths.left, purple: [] } : undefined;
  });

  return {
    axis,
    left,
    right,
    props: { left: propType, right: propType },
    tips: { left: tip, right: tip },
    reach: { left: clubTipDx, right: clubTipDx },
    clubTipDx,
    geometryKey: options.geometryKey,
  };
}

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { loadDiamondEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import {
  TND_BY_FAMILY,
  type TnDElement,
} from "#lib/features/choreo-card/domain/tnd-element.js";
import { loadBaseIndex, resolveBase } from "./build-realization-sequence";
import {
  MODE_FAMILY_ID,
  MODE_ORDER,
  MODE_LABEL,
  type VtgMode,
} from "./shape-matrix-realizations";
import type { CellOverlay } from "./build-realization-cards";
import { type Flower } from "../domain/flower-signature";
import {
  identifyShapeMatrixRealization,
  type ShapeMatrixRealizationSource,
} from "./shape-matrix-realization-source";
import {
  derivePropRelationship,
  type PropRelationship,
} from "../domain/prop-relationship";
import { buildExactFlowerPhases } from "./solve-prop-relationship-phase";

/** VTG mode → TnD family id. DIAMOND-GRID ONLY: same-direction elements
 *  (water/earth/sun) are grid-mode invariant, but the opposite-direction trio
 *  permutes in box mode (air/fire ↔ moon). The shape matrix is diamond, so
 *  this static map is valid here — do not reuse it for a box-mode surface. */
export const FAMILY_BY_MODE = MODE_FAMILY_ID;

export interface ModeRealization {
  mode: VtgMode;
  /** Exact prop relationship requested by prop-first selection, when present. */
  propMode: VtgMode | null;
  modeLabel: string;
  /** Base word, simplified at DISPLAY time (e.g. "AAAA" → shown as "A"). */
  word: string;
  element: TnDElement;
  propRelationship: PropRelationship;
  /** Parity-corrected sequence — feeds the animation player directly. */
  seq: SequenceData;
  /** Stable realization identity plus the base/cell/mode lineage that built it. */
  source: ShapeMatrixRealizationSource;
}

/** The VTG mode the props are in, when they are in one at all. */
export function propModeOf(relationship: PropRelationship): VtgMode | null {
  if (relationship.kind !== "full") return null;
  return (
    MODE_ORDER.find(
      (candidate) => MODE_FAMILY_ID[candidate] === relationship.element.familyId
    ) ?? null
  );
}

function relationshipKey(relationship: PropRelationship): string {
  if (relationship.kind === "full") return relationship.element.familyId;
  if (relationship.kind === "direction-only") {
    return `${relationship.kind}:${relationship.direction}`;
  }
  return relationship.kind;
}

function createModeRealization(
  base: SequenceData,
  pair: { left: Flower; right: Flower },
  mode: VtgMode,
  phase: ReturnType<typeof buildExactFlowerPhases>[number]
): ModeRealization | null {
  const element = TND_BY_FAMILY[MODE_FAMILY_ID[mode]];
  if (!element) return null;
  const propRelationship = derivePropRelationship(phase.sequence, pair);
  const propMode = propModeOf(propRelationship);
  const source = identifyShapeMatrixRealization(
    base,
    phase.sequence,
    pair,
    mode,
    propMode
  );
  return {
    mode,
    propMode,
    modeLabel: MODE_LABEL[mode],
    word: (base.word ?? mode).toUpperCase(),
    element,
    propRelationship,
    seq: source.sequence,
    source,
  };
}

/** All exact flower-preserving prop phases for one hand relationship. */
export async function buildModeRealizationCandidates(
  pair: { left: Flower; right: Flower },
  overlay: CellOverlay,
  mode: VtgMode
): Promise<ModeRealization[]> {
  const modeStartedAt = import.meta.env.DEV ? performance.now() : 0;
  try {
    const [idx, edges] = await Promise.all([
      loadBaseIndex(),
      loadDiamondEdges(),
    ]);
    const base = resolveBase(
      idx,
      mode,
      pair.left.style === "float" ? "pro" : pair.left.style,
      pair.right.style === "float" ? "pro" : pair.right.style
    );
    if (!base) return [];
    const phases = buildExactFlowerPhases(base, pair, edges, overlay);
    const byRelationship = new Map<string, ModeRealization>();
    for (const phase of phases) {
      const realization = createModeRealization(base, pair, mode, phase);
      if (!realization) continue;
      const key = relationshipKey(realization.propRelationship);
      if (!byRelationship.has(key)) byRelationship.set(key, realization);
    }
    return [...byRelationship.values()];
  } catch {
    return [];
  } finally {
    if (import.meta.env.DEV) {
      performance.measure(`shape-matrix:realization:${mode}`, {
        start: modeStartedAt,
        end: performance.now(),
      });
    }
  }
}

export async function buildModeRealization(
  pair: { left: Flower; right: Flower },
  overlay: CellOverlay,
  mode: VtgMode,
  targetPropMode: VtgMode | null = null
): Promise<ModeRealization | null> {
  const candidates = await buildModeRealizationCandidates(pair, overlay, mode);
  if (targetPropMode) {
    return (
      candidates.find((candidate) => candidate.propMode === targetPropMode) ??
      null
    );
  }
  return candidates[0] ?? null;
}

/**
 * The public drill's builder: buildModeCards minus the PNG card bakes (that
 * ~14s cost and its lab bake import stay on the lab QA path). Hand-first builds
 * use the cell's displayed phase. Prop-first builds use the exact phase solver.
 */
export async function buildModeRealizations(
  pair: { left: Flower; right: Flower },
  overlay: CellOverlay,
  targetPropMode: VtgMode | null = null
): Promise<ModeRealization[]> {
  const buildStartedAt = import.meta.env.DEV ? performance.now() : 0;
  const out: ModeRealization[] = [];
  for (const mode of MODE_ORDER) {
    const realization = await buildModeRealization(
      pair,
      overlay,
      mode,
      targetPropMode
    );
    if (realization) out.push(realization);
  }
  if (import.meta.env.DEV) {
    performance.measure("shape-matrix:realizations", {
      start: buildStartedAt,
      end: performance.now(),
    });
  }
  return out;
}

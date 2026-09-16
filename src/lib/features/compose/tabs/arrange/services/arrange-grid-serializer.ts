/**
 * ArrangeGridSerializer - Serializes grid state to a human-readable template format.
 *
 * Produces a structured text representation with:
 * - Sequence registry (deduplicated, with IDs like S1, S2)
 * - Cell layout section showing grid positions, spans, layers, transforms, offsets
 */

import type {
  TunnelLayerConfig,
  TransformType,
  AppliedTransform,
} from "$lib/shared/animation-engine/domain/compose-types";
import type { GridCell } from "../state/arrange-grid-state.svelte";
import type { SerializationContext } from "./types";

/**
 * Migrates legacy `appliedTransforms` (string[]) to the new `transformStack`
 * (AppliedTransform[]) format. Used during deserialization of persisted
 * compositions that were saved before the transformStack migration.
 *
 * - If `transformStack` already exists, it is returned as-is.
 * - If only `appliedTransforms` exists, each entry is wrapped with
 *   `hand: 'both'` and `timestamp: 0`.
 * - If neither exists, an empty array is returned.
 */
export function migrateAppliedTransforms(layer: {
  appliedTransforms?: TransformType[];
  transformStack?: AppliedTransform[];
}): { transformStack: AppliedTransform[] } {
  if (layer.transformStack) return { transformStack: layer.transformStack };
  if (layer.appliedTransforms) {
    return {
      transformStack: layer.appliedTransforms.map((type) => ({
        type,
        hand: "both" as const,
        timestamp: 0,
      })),
    };
  }
  return { transformStack: [] };
}

interface RegistryEntry {
  id: string;
  refLayer: TunnelLayerConfig;
}

function findRegistryEntry(
  registry: Map<string, RegistryEntry>,
  layer: TunnelLayerConfig
): RegistryEntry | undefined {
  const seq = layer.sequence;
  const word = seq.intendedWord || seq.word || seq.name || "unnamed";
  const beats = seq.steps?.length ?? 0;
  return registry.get(`${word}:${beats}`);
}

function getMotionFallback(
  layer: TunnelLayerConfig,
  refLayer: TunnelLayerConfig
): string | null {
  const layerStep = layer.sequence.steps?.[0];
  const refStep = refLayer.sequence.steps?.[0];
  if (!layerStep?.motions || !refStep?.motions) return null;

  const lb = layerStep.motions.left;
  const lr = layerStep.motions.right;
  const rb = refStep.motions.left;
  const rr = refStep.motions.right;

  const differs =
    lb?.startLocation !== rb?.startLocation ||
    lr?.startLocation !== rr?.startLocation;

  if (!differs) return null;

  const parts: string[] = [];
  if (lb) parts.push(`left:${lb.startLocation}→${lb.endLocation}`);
  if (lr) parts.push(`right:${lr.startLocation}→${lr.endLocation}`);
  return parts.length > 0 ? `(${parts.join(" ")})` : null;
}

function buildLayerQualifiers(
  layer: TunnelLayerConfig,
  refLayer: TunnelLayerConfig,
  cell: GridCell
): string {
  const parts: string[] = [];

  // Transforms (migrated from legacy appliedTransforms if needed)
  const stack = migrateAppliedTransforms(layer).transformStack;
  const transformTypes = stack.map((t) => t.type);
  if (transformTypes.length) {
    parts.push(`[${transformTypes.join(", ")}]`);
  } else {
    const fallback = getMotionFallback(layer, refLayer);
    if (fallback) parts.push(fallback);
  }

  // Beat offsets
  if (layer.beatOffset > 0) parts.push(`offset:+${layer.beatOffset}`);
  if (cell.beatOffset > 0) parts.push(`cell-offset:+${cell.beatOffset}`);

  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export function serializeGrid(context: SerializationContext): string {
  const { cells, bpm, skipStartPlacement, gridRows, gridCols } = context;

  const enabled = cells
    .filter((c) => c.layers.length > 0)
    .sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));

  // Build sequence registry: fingerprint -> { id, refLayer }
  const seqRegistry = new Map<string, RegistryEntry>();
  let seqCounter = 0;

  const getSeqId = (layer: TunnelLayerConfig): string => {
    const seq = layer.sequence;
    const word = seq.intendedWord || seq.word || seq.name || "unnamed";
    const beats = seq.steps?.length ?? 0;
    const fingerprint = `${word}:${beats}`;

    const existing = seqRegistry.get(fingerprint);
    if (existing) return existing.id;

    seqCounter++;
    const id = `S${seqCounter}`;
    seqRegistry.set(fingerprint, { id, refLayer: layer });
    return id;
  };

  // First pass: assign sequence IDs (prefer untransformed layers as reference)
  for (const cell of enabled) {
    const untransformed = cell.layers.filter(
      (l) => !migrateAppliedTransforms(l).transformStack.length
    );
    const transformed = cell.layers.filter(
      (l) => migrateAppliedTransforms(l).transformStack.length > 0
    );
    for (const layer of [...untransformed, ...transformed]) {
      getSeqId(layer);
    }
  }

  // Build output
  const lines: string[] = [];
  lines.push("Composition Template");
  lines.push("====================");
  lines.push(
    `${enabled.length}/${gridRows * gridCols} cells | ${gridRows}×${gridCols} grid | BPM ${bpm} | ${skipStartPlacement ? "Skip start" : "Show start"}`
  );

  // SEQUENCES section
  if (seqRegistry.size > 0) {
    lines.push("");
    lines.push("SEQUENCES");
    lines.push("---------");
    for (const [fingerprint, { id, refLayer }] of seqRegistry) {
      const seq = refLayer.sequence;
      const grid = seq.gridMode ?? "diamond";
      const [word, beats] = fingerprint.split(":");
      lines.push(`${id}: ${word} (${beats} beats, ${grid})`);
    }
  }

  // CELL LAYOUT section
  lines.push("");
  lines.push("CELL LAYOUT");
  lines.push("-----------");

  for (const cell of enabled) {
    const span =
      cell.colSpan > 1 || cell.rowSpan > 1
        ? ` ${cell.colSpan}×${cell.rowSpan}`
        : "";
    const pos = `(${cell.row},${cell.col})`;
    const pad = span ? `${pos}${span}` : `${pos}     `;

    if (cell.layers.length === 1) {
      const layer = cell.layers[0]!;
      const sId = getSeqId(layer);
      const entry = findRegistryEntry(seqRegistry, layer);
      const qualifiers = buildLayerQualifiers(
        layer,
        entry?.refLayer ?? layer,
        cell
      );
      lines.push(`${pad} ${sId}${qualifiers}`);
    } else {
      lines.push(pad);
      for (let i = 0; i < cell.layers.length; i++) {
        const layer = cell.layers[i]!;
        const sId = getSeqId(layer);
        const entry = findRegistryEntry(seqRegistry, layer);
        const qualifiers = buildLayerQualifiers(
          layer,
          entry?.refLayer ?? layer,
          cell
        );
        lines.push(`  L${i + 1}: ${sId}${qualifiers}`);
      }
    }
  }

  return lines.join("\n");
}

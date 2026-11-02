/**
 * What a host outside the matrix needs to ask about one pick: the realization
 * a cell builds in a hands mode, the element its props trace, and the letters
 * its chip prints. Each call runs the drill's own chain (load the matrix,
 * build the cell overlay, build the mode's candidates, take the first one in
 * the requested mode), so the answers match what the engine shows. Nothing
 * here adds a rule of its own.
 */
import type {
  FlowerPair,
  TnDElement,
  TurnValue,
  VtgMode,
} from "@tka/shape-domain";
import { flowerKey } from "@tka/shape-domain";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  buildModeRealizationCandidates,
  type ModeRealization,
} from "./services/build-mode-realizations.js";
import { loadShapeMatrix } from "./services/shape-matrix-flowers.js";
import type { ShapeMatrixPropPair } from "./services/prop-pair.js";

export interface BridgeOptions {
  /** The prop the hands were traced with; the matrix's default when absent. */
  props?: PropType | ShapeMatrixPropPair;
}

/**
 * The realization for a pair in a hands mode, or null when the mode has none
 * for this pair. `turns` mirrors the matrix's [leftTurn, rightTurn] for the
 * caller's bookkeeping; each flower already carries its own turns, which is
 * what the build reads.
 */
export async function realizationFor(
  pair: FlowerPair,
  mode: VtgMode,
  _turns: readonly [TurnValue, TurnValue],
  options: BridgeOptions = {}
): Promise<ModeRealization | null> {
  const data = await loadShapeMatrix(options.props);
  const overlay = {
    left: data.left.get(flowerKey(pair.left))?.left ?? [],
    right: data.right.get(flowerKey(pair.right))?.right ?? [],
    tips: data.tips,
  };
  const candidates = await buildModeRealizationCandidates(pair, overlay, mode);
  return candidates.find((candidate) => candidate.mode === mode) ?? null;
}

/** The element the props trace: what the engine's Hands to Props row shows. */
export async function propsElementFor(
  mode: VtgMode,
  pair: FlowerPair,
  turns: readonly [TurnValue, TurnValue],
  options: BridgeOptions = {}
): Promise<TnDElement | null> {
  const realization = await realizationFor(pair, mode, turns, options);
  const relationship = realization?.propRelationship;
  return relationship?.kind === "full" ? relationship.element : null;
}

/** The letters the chip prints: the base word, simplified for display (C, or LF). */
export async function letterFor(
  pair: FlowerPair,
  mode: VtgMode,
  turns: readonly [TurnValue, TurnValue],
  options: BridgeOptions = {}
): Promise<string | null> {
  const realization = await realizationFor(pair, mode, turns, options);
  return realization ? simplifyRepeatedWord(realization.word) : null;
}

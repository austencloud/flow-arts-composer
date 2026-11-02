export * from "./flowers/flower-signature.js";
export * from "./flowers/filter-flower-axis.js";
export * from "./flowers/flower-at-turn.js";
export * from "./flowers/matrix-size-preset.js";
export * from "./flowers/matrix-turn-band.js";
export * from "./flowers/prop-relationship.js";
export * from "./flowers/rotation-style.js";
export * from "./flowers/theory-flower.js";
export * from "./flowers/theory-prop-relationship.js";
export * from "./flowers/theory-ratio.js";
export * from "./elements/vtg-modes.js";
export * from "./elements/tnd-elements.js";
export * from "./letters/csv-edges.js";
export * from "./turns/level-turn-values.js";
export * from "./turns/turn-pattern-parser.js";
export * from "./qft/qft-model.js";
import type { Flower } from "./flowers/flower-signature.js";

/** The two flowers of a matrix cell: the left hand's and the right hand's. */
export interface FlowerPair {
  left: Flower;
  right: Flower;
}

export const SHAPE_DOMAIN_VERSION = "0.1.0";

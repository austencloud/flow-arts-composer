export { default as ShapeMatrixApp } from "./app/ShapeMatrixApp.svelte";
export { default as ShapeMatrixGrid } from "./components/ShapeMatrixGrid.svelte";
export { default as ShapeMatrixDrill } from "./components/ShapeMatrixDrill.svelte";
export { default as ShapeMatrixTeaser } from "./components/ShapeMatrixTeaser.svelte";
export { default as ElementChipRow } from "./components/ElementChipRow.svelte";
export { default as PropRelationshipChipRow } from "./components/PropRelationshipChipRow.svelte";
export { default as RelationshipChoiceChip } from "./components/RelationshipChoiceChip.svelte";
export { default as ElementStrip } from "./components/ElementStrip.svelte";
export {
  mountShapeEngine,
  mountElementStrip,
  type MountHandle,
  type MountShapeEngineOptions,
  type MountElementStripOptions,
} from "./mount.svelte.js";
export {
  currentTracePick,
  DEFAULT_ELEMENT_ICONS,
  type ShapeEngineVariant,
  type TracePick,
} from "./app/context/shape-engine-host-context.js";
export type {
  ShapeMatrixAppSnapshot,
  ShapeMatrixAppPersistence,
  ShapeMatrixPropSource,
} from "./app/state/shape-matrix-app-state.svelte.js";
export * from "./services/shape-matrix-flowers.js";
export * from "./services/build-realization-cards.js";
export * from "./services/build-mode-realizations.js";
export * from "./services/verify-realization-parity.js";
export * from "./services/shape-matrix-render.js";
export * from "./services/shape-matrix-poi-render.js";
export * from "./services/shape-matrix-realizations.js";
export * from "./services/build-realization-sequence.js";
export * from "./services/tnd-base-index.js";
export * from "./services/prop-pair.js";
export * from "./services/shape-matrix-display.js";
export * from "./strings.svelte.js";
export * from "./bridge.js";
export * as domain from "@tka/shape-domain";

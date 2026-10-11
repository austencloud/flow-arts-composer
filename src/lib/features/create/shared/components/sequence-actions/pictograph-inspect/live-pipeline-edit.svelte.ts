/**
 * Live Pipeline Edit signal
 *
 * A single active in-flight pipeline edit, published by PipelineEditorDock on
 * every WASD/numeric keystroke and read by PipelineTraceSection to show the
 * edited tier's value live — before Save — without re-running the async arrow
 * pipeline. One edit is active at a time (one color, one tier), so a single
 * module-level rune is sufficient. Cleared on Save, tier switch, deselect, and
 * dock teardown.
 */

export type PipelineEditTier =
  | "global"
  | "special-json"
  | "prop-geometry"
  | "default";

export interface LivePipelineEdit {
  hand: HandSide;
  tier: PipelineEditTier;
  x: number;
  y: number;
}

let current = $state<LivePipelineEdit | null>(null);

export const livePipelineEdit = {
  get current(): LivePipelineEdit | null {
    return current;
  },
  publish(edit: LivePipelineEdit): void {
    current = edit;
  },
  clear(): void {
    current = null;
  },
};
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

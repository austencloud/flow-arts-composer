/**
 * The contract every Create method preview scene follows, and the lazy
 * registry the preview stage loads scenes from. Scene modules load by
 * dynamic import after first paint, so the front door's first paint carries
 * no scene code (spec: Performance).
 *
 * Every scene:
 * - draws with the renderers and data its method uses;
 * - draws its finished picture first and calls `onready`, then plays only
 *   while `playing` is true, starting a fresh run for each new `turn`;
 * - when `playing` turns false mid-run, stops at once and settles on the
 *   finished picture (playSceneTurns fades a cut run through the tint);
 * - holds no buttons, links, or focusable elements;
 * - names the method flow it mirrors in its header comment.
 */
import type { Component } from "svelte";
import type { MethodPreviewShape } from "./method-preview-layout";

export interface MethodPreviewSceneProps {
  /** True while it is this card's turn. A scene animates only then. */
  playing: boolean;
  /** The coordinator's turn number. A new number while playing is a new run. */
  turn: number;
  /** Which composition the box takes. */
  shape: MethodPreviewShape;
  /** The box's size in CSS px. */
  width: number;
  height: number;
  /** The method's color, for the finger and highlights. */
  accent: string;
  /** Call once, when the finished picture is drawn and the scene can play. */
  onready: () => void;
}

export type MethodPreviewSceneModule = {
  default: Component<MethodPreviewSceneProps>;
};

/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
};

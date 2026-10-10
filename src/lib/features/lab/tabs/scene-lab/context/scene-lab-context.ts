/**
 * Scene Lab Context
 *
 * Distributes the SceneLabState to any descendant in the Scene Lab subtree.
 */

import { getContext, setContext } from "svelte";
import type { SceneLabState } from "../state/scene-lab-state.svelte";
import type { ComposerEditorState } from "#lib/shared/3d/scene-composer/composer-editor-state.svelte.js";

const KEY = Symbol("scene-lab-context");

export interface SceneLabContext {
  readonly state: SceneLabState;
  readonly composerState: ComposerEditorState;
}

export function setSceneLabContext(ctx: SceneLabContext): void {
  setContext(KEY, ctx);
}

export function getSceneLabContext(): SceneLabContext {
  const ctx = getContext<SceneLabContext | undefined>(KEY);
  if (!ctx) {
    throw new Error(
      "getSceneLabContext() called outside of SceneLab subtree"
    );
  }
  return ctx;
}

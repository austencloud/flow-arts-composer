import { getContext, setContext } from "svelte";
import type { PostModuleState } from "../state/post-module-state.svelte";

const KEY = Symbol("post-module");

export function setPostModuleContext(state: PostModuleState): void {
  setContext(KEY, state);
}

export function getPostModuleContext(): PostModuleState {
  const state = getContext<PostModuleState | undefined>(KEY);
  if (!state) throw new Error("Post module context is unavailable.");
  return state;
}

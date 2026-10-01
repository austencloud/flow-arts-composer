import { getContext, setContext, type Snippet } from "svelte";

/**
 * A header row outside the editor, such as the Post module's row with
 * Projects and the post's name. The editor puts Save, more actions and
 * Export there; without one they stay in its own top bar.
 */
export interface PostEditorHeader {
  actions: Snippet | undefined;
}

const KEY = Symbol("post-editor-header");

export function providePostEditorHeader(): PostEditorHeader {
  const header = $state<PostEditorHeader>({ actions: undefined });
  setContext(KEY, header);
  return header;
}

export function getPostEditorHeader(): PostEditorHeader | undefined {
  return getContext<PostEditorHeader | undefined>(KEY);
}

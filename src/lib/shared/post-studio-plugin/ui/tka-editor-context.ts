import { getContext, setContext } from "svelte";
import type {
  VideoEditorPlugin,
  VideoEditorState,
} from "@austencloud/video-editor";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import type { StaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";

/** What tka's plugin functions need beyond the generic state. */
export interface TkaEditorFacts {
  /** tka's wrapper, the same object the editor UI holds as `editor`. */
  wrapper: PostEditorState;
  isQrImage(imageId: string): boolean;
  /** The plugin tka created, for the kind labels. */
  plugin: VideoEditorPlugin | null;
  /** Opens the timing mode on the selected clip; set by the scope from Task 15b on. */
  openBeats?(): void;
}

const FACTS = new WeakMap<object, TkaEditorFacts>();

/** Called once where the wrapper is created (the workspace until Task 15a, then TkaEditorScope). */
export function registerTkaEditor(
  editor: PostEditorState,
  facts: TkaEditorFacts
): void {
  FACTS.set(editor, facts);
}

/** The facts for an editor tka created, or undefined for any other editor. */
export function tkaEditorOf(
  editor: VideoEditorState
): TkaEditorFacts | undefined {
  return FACTS.get(editor);
}

/** Design H's context; Tasks 13 to 15b add its members. */
export interface TkaEditorContext {
  editor: PostEditorState;
  /** Where each take's LED staffs are, for the Effects tool. */
  readonly staffTips: StaffTipAnalysis | null;
  readonly cardRenderOptions: Partial<SequenceExportOptions> | null;
  /** A feature video's editor: a card can carry the link its QR shows. */
  readonly featureMode: boolean;
  readonly stepCount: number;
  /** The post's changed notation is still being prepared. */
  readonly sequenceBusy: boolean;
}

const TKA_EDITOR = Symbol("tka-editor");

export function provideTkaEditor(ctx: TkaEditorContext): TkaEditorContext {
  setContext(TKA_EDITOR, ctx);
  return ctx;
}

export function useTkaEditor(): TkaEditorContext {
  const ctx = getContext<TkaEditorContext | undefined>(TKA_EDITOR);
  if (!ctx)
    throw new Error(
      "useTkaEditor() runs inside TkaEditorScope or the workspace."
    );
  return ctx;
}

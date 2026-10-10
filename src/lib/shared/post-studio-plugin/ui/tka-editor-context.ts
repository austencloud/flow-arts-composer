import { getContext, setContext } from "svelte";
import type {
  CompositionSourceBinding,
  VideoEditorPlugin,
  VideoEditorState,
} from "@austencloud/video-editor";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import type { StaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
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
  /** Opens the save menu for the post's sequence where a media layer was right-clicked. */
  openSaveMenu?(event: MouseEvent): void;
  /** The card options a QR image's poster look follows. */
  readonly cardRenderOptions?: Partial<SequenceExportOptions> | null;
}

const FACTS = new WeakMap<object, TkaEditorFacts>();
/**
 * The facts registered last. tka runs one editor at a time, so a plugin
 * function the editor hands no state (the media layers' right click) reads
 * these.
 */
let current: TkaEditorFacts | null = null;

/** Called once where the wrapper is created (the workspace until Task 15a, then TkaEditorScope). */
export function registerTkaEditor(
  editor: PostEditorState,
  facts: TkaEditorFacts
): void {
  FACTS.set(editor, facts);
  current = facts;
}

/** The facts for an editor tka created, or undefined for any other editor. */
export function tkaEditorOf(
  editor: VideoEditorState
): TkaEditorFacts | undefined {
  return FACTS.get(editor);
}

/** The facts of the editor tka registered last, or null before any. */
export function currentTkaEditor(): TkaEditorFacts | null {
  return current;
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
  /** The sequence the post draws, with its labels and actions applied. */
  readonly sequence: SequenceData;
  /** The record a scan of the card opens: the source, not a labeled copy. */
  readonly qrSequence: SequenceData | undefined;
  /** The workspace's source for a role; a layer reads another role's through it. */
  bindingFor(role: string): CompositionSourceBinding | null;
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

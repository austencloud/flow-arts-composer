import { getContext, setContext } from "svelte";
import type {
  CompositionSourceBinding,
  VideoEditorPlugin,
  VideoEditorState,
} from "@austencloud/video-editor";
import type { PostStudioLayerPainter } from "@austencloud/video-editor/render";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import type { StaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { PostTimingSession } from "$lib/shared/share/components/post-studio/builder/post-timing-session.svelte";
import type { PostStudioShareExport } from "@austencloud/video-editor/ui";
import type { TimingUi } from "./tka-timing-ui.svelte";

/** What tka's plugin functions need beyond the generic state. */
export interface TkaEditorFacts {
  /** tka's wrapper, the same object the editor UI holds as `editor`. */
  wrapper: PostEditorState;
  isQrImage(imageId: string): boolean;
  /** The plugin tka created, for the kind labels. */
  plugin: VideoEditorPlugin | null;
  /**
   * Opens the timing mode: on the selected clip, or the clip under the
   * playhead, without a take; on the take's first clip with one.
   */
  openBeats?(takeId?: string): void;
  /** The beat-timing session, for the timing mode's keys. */
  readonly timing: PostTimingSession;
  /** Opens the save menu for the post's sequence where a media layer was right-clicked. */
  openSaveMenu?(event: MouseEvent): void;
  /** The card options a QR image's poster look follows. */
  readonly cardRenderOptions?: Partial<SequenceExportOptions> | null;
  /** The post's sequence as the host passed it, for the editor's label and the export file name. */
  readonly sequence: SequenceData;
}

const FACTS = new WeakMap<object, TkaEditorFacts>();

/** Called once where the wrapper is created, in TkaEditorScope. */
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

/** The animation overlay the bindings load; the wrapper's `hasAnimationOverlay` reads `painter`. */
export interface TkaOverlayHolder {
  painter: PostStudioLayerPainter | null;
  /** The sequence the loaded painter draws; export waits until it is the one on screen. */
  sequence: SequenceData | null;
  error: string | null;
}

/** The take preview resolver the timing session plays through; the bindings fill it. */
export interface TkaPreviewsHolder {
  resolve: ((takeId: string, url: string | null) => string | null) | null;
}

/** The strip painters the bindings make, for the timing timeline's square. */
export interface TkaStripsHolder {
  painterFor: ((mode: string) => PostStudioLayerPainter | null) | null;
}

/** What TkaEditorScope hands its `children` snippet. */
export interface TkaScopeChildren {
  editor: PostEditorState;
  plugin: VideoEditorPlugin;
  readonly inspectorTarget: HTMLElement | null;
  /** The host's registerExport, wrapped so the dev bridge renders through the same controls. */
  registerExport: (controls: PostStudioShareExport) => () => void;
}

/** Design H's context, provided by TkaEditorScope. */
export interface TkaEditorContext {
  editor: PostEditorState;
  /** Where each take's LED staffs are, for the Effects tool; the bindings set it. */
  staffTips: StaffTipAnalysis | null;
  readonly cardRenderOptions: Partial<SequenceExportOptions> | null;
  /** A feature video's editor: a card can carry the link its QR shows. */
  readonly featureMode: boolean;
  readonly stepCount: number;
  /** The post's changed notation is still being prepared. */
  readonly sequenceBusy: boolean;
  /** Why the post's changed notation could not be prepared, or null. */
  readonly sequenceError: string | null;
  /** The sequence the post draws, with its labels and actions applied. */
  readonly sequence: SequenceData;
  /** The same sequence, by the name the workspace and the bindings read. */
  readonly displaySequence: SequenceData;
  /** The record a scan of the card opens: the source, not a labeled copy. */
  readonly qrSequence: SequenceData | undefined;
  /** The workspace's source for a role; a layer reads another role's through it. The workspace sets it. */
  bindingFor: (role: string) => CompositionSourceBinding | null;
  /** Asks the host to prepare the animation preview. */
  onRequestAnimation(): void;
  /** Opens the save menu for the post's sequence where a media layer was right-clicked. */
  openSaveMenu(event: MouseEvent): void;
  /** The beat-timing session. */
  readonly timing: PostTimingSession;
  /** What the timing mode's toolbar, dock, panel and stage share. */
  readonly timingUi: TimingUi;
  /** The sequence's saved videos, as the per-sequence store holds them. */
  readonly catalogVideos: readonly CollaborativeVideo[];
  readonly previews: TkaPreviewsHolder;
  readonly overlay: TkaOverlayHolder;
  readonly strips: TkaStripsHolder;
  /** The viewer's side inspector, where the tool panel goes; the viewer bridge sets it. */
  readonly inspectorTarget: HTMLElement | null;
  setInspectorTarget(element: HTMLElement | null): void;
  /** False while the post is mounted but hidden. */
  readonly active: boolean;
  readonly selectedPropType: PropType;
  /** Sets the post's prop and tells the host. */
  choosePropType(propType: PropType): void;
  /** The viewer shell is moving its panels. */
  readonly viewerMoving: boolean;
  /** The viewer shell's own player is the active one. */
  readonly viewerActive: boolean;
  readonly cardPreviewUrl: string | null;
  readonly animationPreviewUrl: string | null;
  readonly animationPreviewType: "video" | "image";
  readonly isPreparingCard: boolean;
  readonly isPreparingAnimation: boolean;
}

const TKA_EDITOR = Symbol("tka-editor");

export function provideTkaEditor(ctx: TkaEditorContext): TkaEditorContext {
  setContext(TKA_EDITOR, ctx);
  return ctx;
}

export function useTkaEditor(): TkaEditorContext {
  const ctx = getContext<TkaEditorContext | undefined>(TKA_EDITOR);
  if (!ctx) throw new Error("useTkaEditor() runs inside TkaEditorScope.");
  return ctx;
}

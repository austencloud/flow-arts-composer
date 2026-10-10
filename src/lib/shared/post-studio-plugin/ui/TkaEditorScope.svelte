<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";
  import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
  import { keyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { createPostSequenceView } from "$lib/shared/media-composition/services/post-sequence-view.svelte";
  import type {
    PostProject,
    PostVideoItem,
  } from "@austencloud/video-editor/core";
  import {
    DEFAULT_HAND_LABELING,
    type HandLabeling,
  } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { CompositionSourceBinding } from "@austencloud/video-editor";
  import {
    createPostEditorState,
    type CatalogTakeSource,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import type { PostStudioLayerPainter } from "@austencloud/video-editor/render";
  import type { StaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
  import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
  import { createPostTimingSession } from "$lib/shared/share/components/post-studio/builder/post-timing-session.svelte";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import { qrPayloadForImage } from "./post-qr-image-appearance";
  import { beatsClipOf } from "./tka-beats";
  import { tkaEditorServices } from "./tka-host";
  import { createTkaEditorPlugin } from "./tka-editor-plugin";
  import {
    provideTkaEditor,
    registerTkaEditor,
    type TkaOverlayHolder,
    type TkaPreviewsHolder,
    type TkaScopeChildren,
    type TkaStripsHolder,
  } from "./tka-editor-context";
  import { createTimingUi } from "./tka-timing-ui.svelte";
  import TkaViewerBridge from "./TkaViewerBridge.svelte";

  /**
   * tka's side of one post: it creates the editor for the sequence, the beat
   * timing session and tka's plugin, provides the TKA context the plugin's
   * components read, keeps the viewer shell in step, and renders the editor
   * in `children`.
   */
  interface Props {
    /** Retain the draft while its host is hidden, without running playback. */
    active: boolean;
    sequence: SequenceData;
    initialProject?: PostProject;
    /**
     * A feature video. Its post saves to its folder on this computer, never
     * to this browser's Post Studio storage; see feature-video-client.ts.
     */
    feature?: FeatureVideoSync;
    cardPreviewUrl: string | null;
    animationPreviewUrl: string | null;
    animationPreviewType: "video" | "image";
    cardRenderOptions: Partial<SequenceExportOptions>;
    isPreparingCard: boolean;
    isPreparingAnimation: boolean;
    selectedPropType: PropType;
    onPropChange: (propType: PropType) => void;
    onProjectPropChange: (propType: PropType | undefined) => void;
    /** Asks the host to prepare the animation preview. */
    onRequestAnimation?: () => void;
    children: Snippet<[TkaScopeChildren]>;
  }

  let {
    active,
    sequence,
    initialProject,
    feature,
    cardPreviewUrl,
    animationPreviewUrl,
    animationPreviewType,
    cardRenderOptions,
    isPreparingCard,
    isPreparingAnimation,
    selectedPropType,
    onPropChange,
    onProjectPropChange,
    onRequestAnimation,
    children,
  }: Props = $props();

  const sharedSurfaces = getViewerStudioSurfaces();

  // The per-sequence catalog, shared with the rest of the app, so a video
  // uploaded elsewhere shows up here without reopening.
  const videoLibrary = untrack(() =>
    sequence.id ? getSequenceVideosStore(sequence.id) : null
  );

  const catalogVideos = $derived(videoLibrary?.videos ?? []);
  const catalog = $derived<CatalogTakeSource[]>(
    catalogVideos
      .filter((video) => Boolean(video.videoUrl) && video.duration > 0)
      .map((video) => ({
        videoId: video.id,
        label: video.description?.trim() || t("share_studio_saved_video"),
        url: video.videoUrl,
        durationSeconds: video.duration,
        ...(video.beatMap ? { legacyStepMap: video.beatMap } : {}),
      }))
  );

  // The holders the bindings fill. Accessors over raw state, so a painter is
  // never proxied.
  let overlayPainter = $state.raw<PostStudioLayerPainter | null>(null);
  let overlaySequence = $state.raw<SequenceData | null>(null);
  let overlayError = $state<string | null>(null);
  const overlay: TkaOverlayHolder = {
    get painter() {
      return overlayPainter;
    },
    set painter(next) {
      overlayPainter = next;
    },
    get sequence() {
      return overlaySequence;
    },
    set sequence(next) {
      overlaySequence = next;
    },
    get error() {
      return overlayError;
    },
    set error(next) {
      overlayError = next;
    },
  };
  const previews: TkaPreviewsHolder = { resolve: null };
  let stripPainterFor = $state.raw<TkaStripsHolder["painterFor"]>(null);
  const strips: TkaStripsHolder = {
    get painterFor() {
      return stripPainterFor;
    },
    set painterFor(next) {
      stripPainterFor = next;
    },
  };

  // Read once: the Post page opens a new workspace for another feature video.
  const featureVideo = feature;

  let qrImageIds = $state<Record<string, boolean>>({});

  const editor = createPostEditorState({
    initialProject,
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlay.painter !== null,
    // A feature video keeps its post, timings and undo history apart from
    // this browser's Post Studio storage.
    store: featureVideo?.store,
    services: tkaEditorServices(videoLibrary),
  });

  /** tka's plugin with its editor UI, made once per post. */
  const plugin = createTkaEditorPlugin();

  // The bindings fill the preview resolver as the editor opens, before any
  // take plays.
  const session = createPostTimingSession(
    editor,
    (takeId, url) => previews.resolve?.(takeId, url) ?? url
  );

  /** What the timing mode's toolbar, dock, panel and stage share. */
  const timingUi = createTimingUi();

  /** Opens beat tapping on a clip's footage, starting at its first frame. */
  function openBeats(clip: PostVideoItem): void {
    editor.pause();
    session.openAt(clip.takeId, clip.sourceIn);
    editor.mode = "timing";
  }

  /** From the video list: starts where the take's first clip does. */
  function openTakeBeats(takeId: string): void {
    let firstClip: PostVideoItem | null = null;
    for (const track of editor.project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && item.takeId === takeId) {
          if (!firstClip || item.start < firstClip.start) firstClip = item;
        }
      }
    }
    editor.pause();
    session.openAt(takeId, firstClip?.sourceIn ?? 0);
    editor.mode = "timing";
  }

  function tapBeatsHere(): void {
    const beatsClip = beatsClipOf(editor);
    if (beatsClip) openBeats(beatsClip);
  }

  /** The save menu a right click on a media layer opens; mounted once below. */
  let saveMenuHost = $state<VisualSequenceSaveContextMenuHost | undefined>();
  registerTkaEditor(editor, {
    wrapper: editor,
    isQrImage: (id) => qrImageIds[id] === true,
    plugin,
    openBeats: (takeId) =>
      takeId === undefined ? tapBeatsHere() : openTakeBeats(takeId),
    timing: session,
    openSaveMenu: (event) =>
      saveMenuHost?.openContextMenu(event.clientX, event.clientY),
    get cardRenderOptions() {
      return cardRenderOptions ?? null;
    },
  });

  $effect(() => onProjectPropChange(editor.project.propType));

  function choosePropType(propType: PropType): void {
    editor.edit((project, context) =>
      project.propType === propType
        ? project
        : { ...project, propType, updatedAt: context.now }
    );
    onPropChange(propType);
  }

  /**
   * The performer works in their own frame and the camera sees it reflected,
   * so beside footage the notation follows the take's hand labeling: a
   * catalog video remembers its own, anything else mirrors.
   */
  const handLabeling = $derived.by((): HandLabeling | null => {
    const take = editor.takesInUse[0] ?? editor.takes[0];
    if (!take) return null;
    if (take.ref.kind === "catalog") {
      const videoId = take.ref.videoId;
      const video = catalogVideos.find((entry) => entry.id === videoId);
      if (video?.handLabeling) return video.handLabeling;
    }
    return DEFAULT_HAND_LABELING;
  });
  const labeledCard = createPostSequenceView({
    getSequence: () => sequence,
    getLabeling: () => handLabeling,
    getMirrored: () => editor.project.mirrored ?? false,
    getActions: () => editor.project.sequenceActions ?? [],
  });
  const displaySequence = $derived(labeledCard.sequence);

  // Set by the bindings and the workspace as the editor opens.
  let staffTips = $state.raw<StaffTipAnalysis | null>(null);
  let bindingSource = $state.raw<
    ((role: string) => CompositionSourceBinding | null) | null
  >(null);
  let inspectorTarget = $state<HTMLElement | null>(null);

  const context = provideTkaEditor({
    editor,
    get staffTips() {
      return staffTips;
    },
    set staffTips(next) {
      staffTips = next;
    },
    get cardRenderOptions() {
      return cardRenderOptions ?? null;
    },
    get featureMode() {
      return !!featureVideo;
    },
    get stepCount() {
      return displaySequence.steps?.length ?? 0;
    },
    get sequenceBusy() {
      return labeledCard.pending;
    },
    get sequenceError() {
      return labeledCard.error;
    },
    get sequence() {
      return displaySequence;
    },
    get displaySequence() {
      return displaySequence;
    },
    // The canvas was never handed a separate scan record, so a card's QR
    // opens the sequence the post draws.
    qrSequence: undefined,
    get bindingFor() {
      return bindingSource ?? (() => null);
    },
    set bindingFor(next) {
      bindingSource = next;
    },
    onRequestAnimation() {
      onRequestAnimation?.();
    },
    openSaveMenu: (event) =>
      saveMenuHost?.openContextMenu(event.clientX, event.clientY),
    timing: session,
    timingUi,
    get catalogVideos() {
      return catalogVideos;
    },
    previews,
    overlay,
    strips,
    get inspectorTarget() {
      return inspectorTarget;
    },
    setInspectorTarget(element) {
      inspectorTarget = element;
    },
    get active() {
      return active;
    },
    get selectedPropType() {
      return selectedPropType;
    },
    choosePropType,
    get viewerMoving() {
      return !!sharedSurfaces?.moving;
    },
    get viewerActive() {
      return !!sharedSurfaces?.active;
    },
    get cardPreviewUrl() {
      return cardPreviewUrl;
    },
    get animationPreviewUrl() {
      return animationPreviewUrl;
    },
    get animationPreviewType() {
      return animationPreviewType;
    },
    get isPreparingCard() {
      return isPreparingCard;
    },
    get isPreparingAnimation() {
      return isPreparingAnimation;
    },
  });

  onMount(() => {
    // Standalone sequence pages have no app shortcut coordinator. Reuse its
    // manager and history bindings; both are safe to initialize again in-app.
    const manager = getKeyboardShortcutManager();
    manager.initialize();
    registerEditHistoryShortcuts(manager, keyboardShortcutState.isMac);
  });

  $effect(() => {
    const imageIds = new Set(
      editor.project.tracks.flatMap((track) =>
        track.items.flatMap((item) =>
          item.kind === "image" ? [item.imageId] : []
        )
      )
    );
    for (const imageId of imageIds) {
      const url = editor.imageUrl(imageId);
      if (!url) continue;
      void qrPayloadForImage(url).then((payload) => {
        if (editor.imageUrl(imageId) === url) {
          qrImageIds = { ...qrImageIds, [imageId]: payload !== null };
        }
      });
    }
  });

  onDestroy(() => editor.dispose());
</script>

<TkaViewerBridge />
{@render children({
  editor,
  plugin,
  get inspectorTarget() {
    return context.inspectorTarget;
  },
})}
<!-- One save menu for every media layer; its menu and prompt portal out. -->
<VisualSequenceSaveContextMenuHost
  bind:this={saveMenuHost}
  sequence={displaySequence}
/>

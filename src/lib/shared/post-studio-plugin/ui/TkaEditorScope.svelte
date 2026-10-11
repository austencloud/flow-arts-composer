<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getKeyboardShortcutManager } from "#lib/shared/keyboard/get-keyboard-shortcut-manager.js";
  import { registerEditHistoryShortcuts } from "#lib/shared/keyboard/registration/register-edit-history-shortcuts.js";
  import { keyboardShortcutState } from "#lib/shared/keyboard/state/keyboard-shortcut-state.svelte.js";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import {
    getEffectsConfigContext,
    setEffectsConfigContext,
  } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import {
    getAnimationVisibilityContext,
    setAnimationVisibilityContext,
  } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { tryGetViewerUrlSessionContext } from "#lib/shared/sequence-viewer/services/viewer-url-session.js";
  import {
    capturePsSlice,
    persistedPsSlice,
    seedFromPsSlice,
    type PsSlicePayload,
  } from "#lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice.js";
  import { getViewerStudioSurfaces } from "#lib/shared/sequence-viewer/context/viewer-studio-surfaces-context.js";
  import { getSequenceVideosStore } from "#lib/shared/video-collaboration/state/sequence-videos-store.svelte.js";
  import { createPostSequenceView } from "#lib/shared/media-composition/services/post-sequence-view.svelte.js";
  import type {
    PostProject,
    PostVideoItem,
    SequenceTimeMap,
  } from "@austencloud/video-editor/core";
  import {
    DEFAULT_HAND_LABELING,
    type HandLabeling,
  } from "#lib/shared/video-collaboration/domain/hand-labeling.js";
  import type { CompositionSourceBinding } from "@austencloud/video-editor";
  import {
    createPostEditorState,
    type CatalogTakeSource,
  } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import type { PostStudioLayerPainter } from "@austencloud/video-editor/render";
  import type { StaffTipAnalysis } from "#lib/shared/media-composition/state/staff-tip-analysis.svelte.js";
  import type { FeatureVideoSync } from "#lib/shared/media-composition/services/feature-video-client.js";
  import {
    isSavedFeatureExport,
    type SavedFeatureExport,
  } from "#lib/shared/media-composition/domain/feature-video-export.js";
  import type { PostStudioShareExport } from "@austencloud/video-editor/ui";
  import { provideStrings } from "@austencloud/video-editor/strings";
  import "@austencloud/video-editor/css/video-editor-tokens.css";
  import { tkaEditorTranslate } from "#lib/shared/media-composition/state/editor-strings.js";
  import { createPostTimingSession } from "#lib/shared/share/components/post-studio/builder/post-timing-session.svelte.js";
  import VisualSequenceSaveContextMenuHost from "#lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import { qrPayloadForImage } from "./post-qr-image-appearance";
  import { withPostStudioPropType } from "./post-studio-prop-render-options";
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
   * tka's side of one post: it owns what the host hands the studio (the
   * prop, the link state and the share seam), creates the editor for the
   * sequence, the beat timing session and tka's plugin, provides the TKA
   * context the plugin's components read, keeps the viewer shell in step,
   * and renders the editor in `children`. A host keys the scope by the
   * sequence, since a post plan belongs to exactly one.
   */
  interface Props {
    /** Retain the draft while its host is hidden, without running playback. */
    active?: boolean;
    sequence: SequenceData;
    initialProject?: PostProject;
    /**
     * A feature video. Its post saves to its folder on this computer, never
     * to this browser's Post Studio storage; see feature-video-client.ts.
     */
    feature?: FeatureVideoSync;
    cardPreviewUrl: string | null;
    animationPreviewUrl: string | null;
    animationPreviewType?: "video" | "image";
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    resolvedCardAutoLayout?: ResolvedAutoLayout | null;
    performanceDurationSeconds?: number;
    sequenceTimeMap?: SequenceTimeMap | null;
    isPreparingCard?: boolean;
    isPreparingAnimation?: boolean;
    /** Asks the host to prepare the animation preview. */
    onRequestAnimation: () => void;
    /** The host's share seam; the editor's export controls register through it. */
    onRegisterShareExport?: (controls: PostStudioShareExport | null) => void;
    children: Snippet<[TkaScopeChildren]>;
  }

  let {
    active = true,
    sequence,
    initialProject,
    feature,
    cardPreviewUrl,
    animationPreviewUrl,
    animationPreviewType = "video",
    cardRenderOptions = null,
    isPreparingCard = false,
    isPreparingAnimation = false,
    onRequestAnimation,
    onRegisterShareExport,
    children,
  }: Props = $props();

  const effectsConfig =
    getEffectsConfigContext() ??
    createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);
  const animationVisibility =
    getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  setAnimationVisibilityContext(animationVisibility);

  // ps slice: a shared link can carry the prop and the sound. See
  // `ps-slice.ts`, "Own-link rule": any non-null URL payload is an override.
  const viewerUrlSession = tryGetViewerUrlSessionContext();
  const psSeedPayload =
    (viewerUrlSession?.getSeed("ps") as PsSlicePayload | null) ?? null;
  const psSeed =
    psSeedPayload && viewerUrlSession?.isOverride("ps", persistedPsSlice())
      ? seedFromPsSlice(psSeedPayload)
      : null;

  // A post keeps its own prop. For older projects, use the first visible
  // sequence motion before falling back to the viewer's current prop.
  let urlPropType = $state<PropType | undefined>(psSeed?.propType);
  let projectPropType = $state<PropType | undefined>(initialProject?.propType);
  const sequencePropType = $derived(
    sequence.steps
      .flatMap((step) => [step.motions.left, step.motions.right])
      .find((motion) => motion.isVisible)?.propType
  );
  const propTypeTouched = $derived(
    urlPropType !== undefined || projectPropType !== undefined
  );
  const selectedPropType = $derived(
    urlPropType ??
      projectPropType ??
      sequencePropType ??
      settingsService.settings.leftPropType ??
      PropType.STAFF
  );
  const synchronizedCardRenderOptions = $derived(
    withPostStudioPropType(cardRenderOptions, selectedPropType)
  );

  /** A pick in the post replaces a link's prop and becomes the post's own. */
  function onPropChange(propType: PropType): void {
    urlPropType = undefined;
    projectPropType = propType;
  }

  function onProjectPropChange(propType: PropType | undefined): void {
    projectPropType = propType;
  }

  /** The ps slice speaks the older names: the take's own sound, or none. */
  const audioSeed: "takes" | "silent" | null =
    psSeed?.audioMode === undefined
      ? null
      : psSeed.audioMode === "original"
        ? "takes"
        : "silent";
  let audio = $state<"takes" | "silent">(audioSeed ?? "takes");
  let audioTouched = $state(audioSeed !== null);

  function setAudio(next: "takes" | "silent", chosen = true): void {
    if (chosen && next !== audio) audioTouched = true;
    audio = next;
  }

  const capturePs = (options: { full?: boolean } = {}) =>
    capturePsSlice(
      {
        propType: selectedPropType,
        propTypeTouched,
        audioMode: audio === "takes" ? "original" : "instagram",
        audioModeTouched: audioTouched,
      },
      options
    );

  if (viewerUrlSession) {
    const unregisterPsSlice = viewerUrlSession.registerSlice("ps", capturePs);
    onDestroy(unregisterPsSlice);
  }

  $effect(() => {
    if (!viewerUrlSession) return;
    void capturePs();
    viewerUrlSession.scheduleUrlWrite();
  });

  // The editor files read their texts through the package context; tka
  // answers them with its own translations.
  provideStrings(tkaEditorTranslate);

  // The host holds one stable seam that forwards to the open editor's
  // controls.
  let workspaceExport: PostStudioShareExport | null = null;

  onMount(() => {
    onRegisterShareExport?.({
      render: () => workspaceExport?.render() ?? Promise.resolve(false),
      cancel: () => workspaceExport?.cancel(),
      renderTo: (name) =>
        workspaceExport?.renderTo?.(name) ??
        Promise.reject(new Error("This editor cannot render.")),
      progress: () => workspaceExport?.progress?.() ?? null,
    });
    return () => onRegisterShareExport?.(null);
  });

  function registerHostExport(controls: PostStudioShareExport): () => void {
    workspaceExport = controls;
    return () => {
      if (workspaceExport === controls) workspaceExport = null;
    };
  }

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
    services: tkaEditorServices(videoLibrary, featureVideo ?? null),
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
      return synchronizedCardRenderOptions;
    },
    get sequence() {
      return sequence;
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
      return synchronizedCardRenderOptions;
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

  /** The open editor's export controls, for the dev bridge's render. */
  let exportControls: PostStudioShareExport | null = null;

  /** The host's registerExport, keeping the controls for the dev bridge. */
  function registerExport(controls: PostStudioShareExport): () => void {
    exportControls = controls;
    const release = registerHostExport(controls);
    return () => {
      if (exportControls === controls) exportControls = null;
      release();
    };
  }

  /**
   * `post-project.mjs render` runs the export in this editor and is answered
   * where the file landed, once it is in the feature video's exports/.
   */
  async function bridgeRender(name?: string): Promise<SavedFeatureExport> {
    const renderTo = exportControls?.renderTo;
    if (!renderTo) throw new Error("This editor cannot render.");
    const saved = await renderTo(name);
    if (!isSavedFeatureExport(saved))
      throw new Error("The render finished but was not saved.");
    return saved;
  }

  onMount(() => {
    if (!import.meta.env.DEV) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import("#lib/shared/media-composition/services/post-project-dev-client.js")
      .then(({ startPostProjectDevBridge }) => {
        if (disposed) return;
        stop = startPostProjectDevBridge(
          editor,
          featureVideo
            ? {
                featureSlug: featureVideo.slug,
                // Another editor, the CLI or a hand edit saved a newer copy.
                onFeatureRevision: (revision) =>
                  void featureVideo.checkRevision(revision),
                // `post-project.mjs render` runs the export in this editor.
                render: {
                  run: bridgeRender,
                  progress: () => exportControls?.progress?.() ?? null,
                },
              }
            : {}
        );
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  });

  // The shell reads the outgoing play intent before releasing its loan.
  $effect(() => {
    if (!active && !sharedSurfaces?.active) {
      untrack(() => session.pause());
    }
  });

  // A hidden tab stops animation frames but not the music. The workspace
  // pauses the editor; the beat-timing session pauses here.
  function pauseSessionWhenHidden(): void {
    if (document.visibilityState === "hidden") session.pause();
  }

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

<svelte:document onvisibilitychange={pauseSessionWhenHidden} />

<TkaViewerBridge />
{@render children({
  editor,
  plugin,
  get inspectorTarget() {
    return context.inspectorTarget;
  },
  registerExport,
  audioSeed,
  onAudioChange: setAudio,
})}
<!-- One save menu for every media layer; its menu and prompt portal out. -->
<VisualSequenceSaveContextMenuHost
  bind:this={saveMenuHost}
  sequence={displaySequence}
/>

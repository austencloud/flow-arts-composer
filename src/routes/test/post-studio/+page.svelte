<!--
  Visual harness for Post Studio with the published ΩΛ-XJ sequence and the
  recovered first September 6 camera cut, offered as a saved video in
  the editor's video list. The clip is gitignored, so the route also works
  without it: add a video from this device instead.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { setLocale, toLocale } from "$lib/shared/i18n/i18n.svelte.js";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { hydrateSequence } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getSharer } from "$lib/shared/share/get-sharer";
  import {
    getSequenceVideosStore,
    resetSequenceVideoStores,
  } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { buildCardRenderOptions } from "$lib/shared/share/services/card-render-options";
  import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
  import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
  import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
  import { keyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
  import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
  import {
    loadPostDraft,
    savePostDraft,
  } from "$lib/shared/media-composition/services/post-draft-storage";
  import { keyframeClearFixture } from "./keyframe-clear-fixture";

  const SEQUENCE_WORD = "ΩΛ-XJΩΛ-XJΩΛ-XJΩΛ-XJ";
  const SEQUENCE_ID = "ΩΛ-XJ";
  const VIDEO_URL = "/word-videos/inshot-recovery/camera-cut-1.mp4";
  /** The InShot draft's cut length; the encoded file rounds to video frames. */
  const VIDEO_DURATION = 25.137199;
  const VIDEO_ID = "post-studio-omlam-xj-recovered-cut";

  let sequence = $state<SequenceData | null>(null);
  let initialProject = $state<PostProject | undefined>(undefined);
  let diskDrafts = $state(false);
  let draftLoadError = $state<string | null>(null);
  let cardPreviewUrl = $state<string | null>(null);
  let animationPreviewUrl = $state<string | null>(null);
  let animationPreviewType = $state<"video" | "image">("video");
  let isPreparingAnimation = $state(false);
  let cardRenderOptions = $state<ReturnType<
    typeof buildCardRenderOptions
  > | null>(null);
  let loadError = $state<string | null>(null);
  let animationTimer: ReturnType<typeof setTimeout> | null = null;

  function seedPerformance(sequenceId: string): void {
    const now = new Date();
    const record: CollaborativeVideo = {
      id: VIDEO_ID,
      videoUrl: VIDEO_URL,
      storagePath: "local-example/inshot-recovery/camera-cut-1.mp4",
      duration: VIDEO_DURATION,
      fileSize: 0,
      mimeType: "video/mp4",
      sequenceId,
      sequenceName: SEQUENCE_ID,
      associations: [],
      performers: [],
      creatorId: "slice-performer",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      description: "ΩΛ-XJ — recovered full-speed cut",
      createdAt: now,
      updatedAt: now,
    };
    resetSequenceVideoStores();
    const store = getSequenceVideosStore(sequenceId);
    store.add(record);
    // The real method writes to Firestore, which needs a signed-in creator.
    // The harness keeps the choice in memory so the toggle can be exercised.
    store.applyHandLabeling = async (videoId, handLabeling) => {
      const held = store.videos.find((video) => video.id === videoId);
      if (held) store.add({ ...held, handLabeling, updatedAt: new Date() });
    };
  }

  onMount(async () => {
    const isolatedKeyframes =
      new URL(window.location.href).searchParams.get("fixture") ===
      "keyframe-clear";
    const requestedLocale = toLocale(
      new URL(window.location.href).searchParams.get("lang") ?? ""
    );
    if (requestedLocale) await setLocale(requestedLocale);
    // The boot bar in app.html waits for the app layout to report 100%, and a
    // /test route never runs that layout, so without this the splash sits over
    // the harness until its 15s safety net fires.
    (
      window as unknown as { __tkaLoadProgress?: (p: number) => void }
    ).__tkaLoadProgress?.(100);
    registerLoopDetector(loopDetector);
    try {
      const [loaded, draft] = await Promise.all([
        getBrowseLoader().loadFullSequenceData(SEQUENCE_WORD, SEQUENCE_ID),
        isolatedKeyframes
          ? Promise.resolve({
              project: null,
              diskAvailable: false,
              error: null,
            })
          : loadPostDraft(SEQUENCE_ID),
      ]);
      initialProject = draft.project ?? undefined;
      diskDrafts = draft.diskAvailable;
      draftLoadError = draft.error;
      if (!loaded)
        throw new Error("The visual fixture is no longer published.");
      const hydrated = await hydrateSequence(loaded);
      const editorSequenceId = isolatedKeyframes
        ? "post-keyframe-clear-fixture"
        : hydrated.id;
      seedPerformance(editorSequenceId);
      sequence = {
        ...hydrated,
        id: editorSequenceId,
        performanceVideoUrl: VIDEO_URL,
      };
      if (isolatedKeyframes)
        initialProject = keyframeClearFixture(editorSequenceId);
      cardRenderOptions = buildCardRenderOptions(sequence, { darkMode: true });

      const blob = await getSharer().getCardImageBlob(sequence, {
        darkMode: true,
      });
      cardPreviewUrl = URL.createObjectURL(blob);

      if (sequence.animatedSequenceUrl) {
        animationPreviewUrl = sequence.animatedSequenceUrl;
        animationPreviewType = "image";
      }
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load Post Studio.";
    }
  });

  onMount(() => {
    // Test routes omit the app's shortcut coordinator. Ctrl+Z and Ctrl+Y
    // reach the editor's Undo and Redo through the app's own history routing.
    const manager = new KeyboardShortcutManager(new ShortcutRegistry());
    registerEditHistoryShortcuts(manager, keyboardShortcutState.isMac);
    manager.initialize();
    return () => manager.dispose();
  });

  onDestroy(() => {
    if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
    if (animationTimer) clearTimeout(animationTimer);
  });

  function requestAnimation(): void {
    if (animationPreviewUrl || isPreparingAnimation) return;
    isPreparingAnimation = true;
    animationTimer = setTimeout(() => {
      isPreparingAnimation = false;
      animationTimer = null;
    }, 1800);
  }
</script>

<svelte:head>
  <title>Post Studio visual harness</title>
</svelte:head>

<main class="harness">
  {#if loadError}
    <div class="load-state error" role="alert">{loadError}</div>
  {:else if !sequence}
    <div class="load-state" role="status">
      <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
      Loading a published sequence…
    </div>
  {:else}
    <PostStudio
      {sequence}
      {initialProject}
      onSaveDraft={diskDrafts ? savePostDraft : undefined}
      {draftLoadError}
      {cardPreviewUrl}
      {animationPreviewUrl}
      {animationPreviewType}
      performanceDurationSeconds={VIDEO_DURATION}
      {cardRenderOptions}
      isPreparingCard={!cardPreviewUrl}
      {isPreparingAnimation}
      onRequestAnimation={requestAnimation}
    />
  {/if}
</main>

<ToastContainer />

<style>
  :global(body) {
    margin: 0;
    background: #09090d;
  }

  .harness {
    display: grid;
    /* Stretch, not start: the studio is a full-height surface everywhere it
       actually ships (a modal over the viewer). Starting it meant that above
       ~2600px the studio collapsed to its intrinsic height and the canvas
       column narrowed with it, so the harness stopped representing the app at
       exactly the widths worth checking. */
    align-items: stretch;
    width: 100%;
    height: 100dvh;
    padding: clamp(0.5rem, 1.5vw, 2rem);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 12% 0%,
        rgba(87, 64, 180, 0.18),
        transparent 34rem
      ),
      #09090d;
  }

  .load-state {
    display: flex;
    align-items: center;
    justify-self: center;
    /* The grid stretches its child so the studio fills the viewport; this one
       hugs its text instead. */
    align-self: start;
    gap: 0.625rem;
    margin-top: 25dvh;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.875rem;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9375rem;
  }

  .load-state.error {
    border-color: rgba(229, 90, 90, 0.28);
    color: #ffb4b4;
  }
</style>

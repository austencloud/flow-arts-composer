<!--
  Visual harness for PostShareSheet.

  Renders the REAL component (not a mockup) so composition, control sizing and
  the no-layout-shift behavior can be checked at every required viewport
  without driving the whole create → save → viewer flow.

  It also renders a REAL sequence, pulled from the published gallery through
  the same loader the viewer uses. A hand-written one was here before, and it
  taught the page nothing true: invented steps render invented pictographs, so
  the card the sheet composes around was not a card this app can produce.
  Austen (2026-08-11): "Even when we're testing we should be using real data."

  `?real-video` mounts the same offscreen animation stack the viewer exports
  from, so the sheet can also exercise its real render → blob hydration →
  download path without needing an account.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import { SequenceModalExporter } from "$lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte";
  import PostShareSheet from "$lib/shared/share/components/PostShareSheet.svelte";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import type { MetaPublishStatus } from "$lib/shared/share/services/meta-publish";
  import type { InstagramCapabilitySnapshot } from "$lib/shared/share/domain/instagram/instagram-capability-schema";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { hydrateSequence } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getSharer } from "$lib/shared/share/get-sharer";
  import { getVideosForSequence } from "$lib/shared/video-collaboration/services/collaborative-video-manager";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import demoSequence from "$lib/shared/landing/data/demo-sequence.json";

  /**
   * A real published sequence: 16 steps, a rotated LOOP of period 4, owned by
   * Austen in `publicSequences`. Guest-readable, so the harness needs no
   * sign-in.
   *
   * Chosen because its word repeats four times, which keeps the check the old
   * synthetic sequence existed for: the header and the filename must read
   * CΨΩX, never CΨΩXCΨΩXCΨΩXCΨΩX
   * (.claude/rules/simplified-word-display.md).
   *
   * Both the word and the id are needed: the loader resolves by word and takes
   * the id only to disambiguate, so an id alone matches nothing.
   */
  const SEQUENCE_WORD = "CΨΩXCΨΩXCΨΩXCΨΩX";
  const SEQUENCE_ID = "2077a0d6-01d1-4b2b-a920-da9da6ee7e47";

  let sequence = $state<SequenceData | null>(null);
  let gallerySequence: SequenceData | null = null;
  let loadError = $state<string | null>(null);
  let studioHarness = $state(false);
  let cardOnly = $state(false);
  let studioCardUrl = $state<string | null>(null);
  let studioAnimationUrl = $state<string | null>(null);
  let studioAnimationType = $state<"video" | "image">("video");
  let initialArtifact = $state<"card" | "video">("card");
  let tkaHandoffCount = $state(0);
  let realVideoMode = $state(false);
  let failNextRealRender = $state(false);
  let animationCanvas = $state<HTMLCanvasElement | null>(null);
  let playbackController: AnimationPlaybackController | null = null;
  let realVideoUrl = $state<string | null>(null);
  let realRenderVersion = 0;

  // This is deliberately instance-owned. A fixture opened in another tab must
  // not cancel or revoke the viewer's singleton export preview.
  const realVideoExporter = new SequenceModalExporter();
  const animationState = createAnimationPanelState();
  const exportOptions = getExportOptionsState();
  let realExporting = $derived(realVideoExporter.state.isExporting);
  let realExportProgress = $derived(
    realVideoExporter.state.progress?.progress ?? null
  );
  let currentLetter = $derived.by(() => {
    const steps = animationState.sequenceData?.steps;
    if (!steps?.length) return null;
    const index = Math.min(
      Math.max(0, Math.floor(animationState.currentStep) - 1),
      steps.length - 1
    );
    return steps[index]?.letter ?? null;
  });
  let currentStepData = $derived.by(() => {
    const current = animationState.sequenceData;
    if (!current?.steps?.length) return null;
    if (animationState.currentStep < 1 && current.startPlacement)
      return current.startPlacement;
    const index = Math.min(
      Math.max(0, Math.floor(animationState.currentStep) - 1),
      current.steps.length - 1
    );
    return current.steps[index] ?? null;
  });
  let gridMode = $derived(animationState.sequenceData?.gridMode);

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    studioHarness = params.has("studio");
    cardOnly = params.has("card");
    realVideoMode = params.has("real-video");
    initialArtifact = params.get("artifact") === "video" ? "video" : "card";
    playbackController = new AnimationPlaybackController(
      new SequenceAnimationOrchestrator(
        new AnimationStateManager(),
        getViewerAnimationPropConfig
      ),
      new AnimationLoop()
    );
    const requestedMeta = params.get("meta");
    if (
      requestedMeta === "none" ||
      requestedMeta === "unchosen" ||
      requestedMeta === "instagram" ||
      requestedMeta === "both"
    ) {
      metaState = requestedMeta;
      overrideEnabled = true;
    }
    // Hydration runs the viewer's own path, which asks for a loop detector.
    // The real viewer route registers it exactly like this.
    registerLoopDetector(loopDetector);
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        SEQUENCE_WORD,
        SEQUENCE_ID
      );
      if (!loaded) {
        loadError = "That sequence is not in the published gallery any more.";
        return;
      }
      const hydrated = await hydrateSequence(loaded);
      const linkedVideos = studioHarness
        ? await getVideosForSequence(SEQUENCE_ID).catch(() => [])
        : [];
      const performanceVideoUrl =
        hydrated.performanceVideoUrl ?? linkedVideos[0]?.videoUrl;
      sequence = performanceVideoUrl
        ? { ...hydrated, performanceVideoUrl }
        : hydrated;
      gallerySequence = sequence;
      if (
        realVideoMode &&
        !playbackController.initialize(sequence, animationState)
      ) {
        loadError =
          "The real animation engine could not initialize this sequence.";
        return;
      }

      if (params.has("open")) {
        await tick();
        isOpen = true;
      }

      if (studioHarness) {
        const card = await getSharer().getCardImageBlob(sequence, {
          darkMode: true,
        });
        studioCardUrl = URL.createObjectURL(card);
        if (sequence.animatedSequenceUrl) {
          studioAnimationUrl = sequence.animatedSequenceUrl;
          studioAnimationType = "image";
        }
      }
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load the sequence.";
    }
  });

  onDestroy(() => {
    if (studioCardUrl) URL.revokeObjectURL(studioCardUrl);
    realRenderVersion += 1;
    realVideoExporter.dispose();
    playbackController?.dispose();
    animationState.dispose();
  });

  let isOpen = $state(false);

  async function useBundledCardSequence(): Promise<void> {
    // The landing page's real fallback sequence exercises source replacement
    // without creating a new sequence or publishing test assets.
    sequence = await hydrateSequence(
      structuredClone(demoSequence) as unknown as SequenceData
    );
  }
  let videoBlobUrl = $state<string | null>(null);
  let isExportingVideo = $state(false);
  let exportProgress = $state<number | null>(null);

  // The sheet composes differently depending on which Meta accounts are
  // connected, and that state arrives over a Firestore subscription the
  // harness cannot produce. These are the four shapes worth checking.
  const available = {
    available: true,
    reasonCode: null,
    recoveryAction: "none",
  } as const;
  const needsFacebook = {
    available: false,
    reasonCode: "meta/facebook-capability-required",
    recoveryAction: "connect-facebook",
  } as const;
  const needsPermission = {
    available: false,
    reasonCode: "meta/permission-missing",
    recoveryAction: "reconnect",
  } as const;
  const TEST_INSTAGRAM_CAPABILITIES = {
    schemaVersion: 1,
    id: "instagram-login:ig-austencloud:harness",
    accountId: "ig-austencloud",
    username: "austencloud",
    accountType: "CREATOR",
    route: "instagram-login",
    graphVersion: "v26.0",
    appAccess: "standard",
    permissions: {
      instagram_business_basic: "granted",
      instagram_business_content_publish: "granted",
    },
    features: {
      image: available,
      reel: available,
      carousel: available,
      story: available,
      "trial-reel": available,
      "alt-text": available,
      cover: available,
      "feed-distribution": available,
      "user-tags": available,
      location: available,
      collaborators: needsFacebook,
      "product-tags": needsFacebook,
      "partnership-labels": needsFacebook,
      "ai-disclosure": available,
      "api-audio": needsFacebook,
      comments: needsPermission,
      insights: needsPermission,
      schedule: available,
    },
    verifiedAtMs: 1,
    expiresAtMs: 9_999_999_999_999,
  } satisfies InstagramCapabilitySnapshot;

  const META_STATES = {
    none: { instagram: null, facebookPage: null },
    // Connected to an account that administers several Pages, none chosen.
    // The sheet must ask rather than post to whichever Page sorts first.
    unchosen: {
      instagram: null,
      facebookPage: {
        selectedPageId: "",
        selectedPageName: "",
        pages: [
          { id: "page-1", name: "The Kinetic Alphabet" },
          { id: "page-2", name: "Flow Arts Chicago" },
        ],
        expiresAtMs: 0,
      },
    },
    instagram: {
      instagram: {
        accountId: "ig-austencloud",
        username: "austencloud",
        accountType: "CREATOR",
        route: "instagram-login",
        expiresAtMs: 0,
        capabilities: TEST_INSTAGRAM_CAPABILITIES,
      },
      facebookPage: null,
    },
    both: {
      instagram: {
        accountId: "ig-austencloud",
        username: "austencloud",
        accountType: "CREATOR",
        route: "instagram-login",
        expiresAtMs: 0,
        capabilities: TEST_INSTAGRAM_CAPABILITIES,
      },
      facebookPage: {
        selectedPageId: "page-1",
        selectedPageName: "The Kinetic Alphabet",
        pages: [
          { id: "page-1", name: "The Kinetic Alphabet" },
          { id: "page-2", name: "Flow Arts Chicago" },
        ],
        expiresAtMs: 0,
      },
    },
  } satisfies Record<string, MetaPublishStatus>;

  type MetaStateKey = keyof typeof META_STATES;
  let metaState = $state<MetaStateKey>("none");

  /**
   * Passing no override at all is the production path while
   * META_POSTING_ENABLED is false: no connect chips, no post buttons, handoff
   * only. It is a fourth shape, and the one shipping today.
   */
  let overrideEnabled = $state(false);

  function fakeRender(): void {
    isExportingVideo = true;
    exportProgress = 0.42;
  }

  function clearRealVideo(): boolean {
    realRenderVersion += 1;
    realVideoExporter.cancel();
    realVideoExporter.dismissPreview();
    realVideoUrl = null;
    return true;
  }

  async function requestRealVideo(): Promise<boolean> {
    if (!sequence || !animationCanvas || !playbackController) return false;
    if (failNextRealRender) {
      failNextRealRender = false;
      return false;
    }

    clearRealVideo();
    const exportVersion = ++realRenderVersion;
    const options = exportOptions.getVideoOptions();
    await realVideoExporter.exportAnimation(
      {
        fps: options.fps,
        loopCount: options.loopCount,
        resolution: options.resolution,
        includeStartPlacement: options.includeStartPlacement,
        includeEndHold: options.includeEndHold,
      },
      {
        canvas: animationCanvas,
        playbackController,
        panelState: animationState,
      },
      {
        onSuccess: () => {},
        onError: () => {},
        onHaptic: () => {},
      }
    );
    if (exportVersion !== realRenderVersion) return false;
    realVideoUrl = realVideoExporter.state.previewBlobUrl;
    return !!realVideoUrl;
  }
</script>

{#if !studioHarness}
  <div class="harness" data-sheet-open={isOpen}>
    <h1>PostShareSheet</h1>
    <div class="controls">
      <button type="button" onclick={() => (isOpen = true)}>Open sheet</button>
      {#if cardOnly && !studioHarness}
        <button type="button" onclick={useBundledCardSequence}
          >Use bundled card sequence</button
        >
        <button type="button" onclick={() => (sequence = gallerySequence)}
          >Use gallery card sequence</button
        >
      {/if}
      {#if realVideoMode}
        <button type="button" onclick={() => (failNextRealRender = true)}
          >Fail next real render</button
        >
        <button type="button" onclick={clearRealVideo}
          >Cancel real render</button
        >
      {/if}
      <button type="button" onclick={fakeRender}>Simulate video render</button>
      <button
        type="button"
        onclick={() => {
          isExportingVideo = false;
          exportProgress = null;
        }}>Clear render state</button
      >
      <button type="button" onclick={() => (metaState = "none")}
        >Meta: not connected</button
      >
      <button type="button" onclick={() => (metaState = "instagram")}
        >Meta: Instagram only</button
      >
      <button type="button" onclick={() => (metaState = "both")}
        >Meta: IG + Page</button
      >
      <button type="button" onclick={() => (metaState = "unchosen")}
        >Meta: Page not chosen</button
      >
      <button type="button" onclick={() => (overrideEnabled = !overrideEnabled)}
        >{overrideEnabled
          ? "Meta: as shipped (flag off)"
          : "Meta: use override"}</button
      >
    </div>
    <p class="note">
      {#if loadError}
        Couldn't load the real sequence: {loadError}
      {:else if !sequence}
        Loading {SEQUENCE_ID} from the published gallery…
      {:else}
        Real sequence {sequence.word} ({sequence.steps?.length ?? 0} steps).
        {#if realVideoMode}
          Real video export uses the selected resolution, FPS, and repeats.
          Choose Download a file in the sheet to run render → blob hydration →
          download.
        {:else}
          Video export is driven by the viewer in the real app; this harness
          only simulates its progress states.
        {/if}
        {#if tkaHandoffCount}
          Send in Flow Arts Composer selected {tkaHandoffCount} time{tkaHandoffCount ===
          1
            ? ""
            : "s"}.
        {/if}
      {/if}
    </p>
  </div>
{/if}

<!-- No `shareUrl`: Copy link and Caption exercise the sheet's lazy short-code
     path. A hardcoded link would skip the real link-preparation behavior. -->
{#if studioHarness && sequence}
  <main class="studio-harness">
    <PostStudio
      {sequence}
      cardPreviewUrl={studioCardUrl}
      animationPreviewUrl={studioAnimationUrl}
      animationPreviewType={studioAnimationType}
      isPreparingCard={!studioCardUrl}
      isPreparingAnimation={isExportingVideo}
      onRequestAnimation={fakeRender}
    />
  </main>
{:else}
  <PostShareSheet
    isOpen={isOpen && !!sequence}
    {sequence}
    availableArtifacts={cardOnly ? ["card"] : ["card", "video"]}
    {initialArtifact}
    shareUrl=""
    canCreateLink={!realVideoMode}
    videoBlobUrl={realVideoMode ? realVideoUrl : videoBlobUrl}
    isExportingVideo={realVideoMode ? realExporting : isExportingVideo}
    exportProgress={realVideoMode ? realExportProgress : exportProgress}
    onRequestVideo={realVideoMode ? requestRealVideo : fakeRender}
    onCancelVideo={realVideoMode ? clearRealVideo : undefined}
    onPrepareFile={realVideoMode ? clearRealVideo : undefined}
    onSendInTka={() => (tkaHandoffCount += 1)}
    onClose={() => (isOpen = false)}
    metaStatusOverride={overrideEnabled ? META_STATES[metaState] : undefined}
  />
{/if}

{#if realVideoMode}
  <div class="offscreen-animation" aria-hidden="true">
    <AnimatorCanvas
      leftProp={animationState.leftPropState}
      rightProp={animationState.rightPropState}
      gridVisible={true}
      {gridMode}
      letter={currentLetter}
      stepData={currentStepData}
      sequenceData={animationState.sequenceData}
      isPlaying={animationState.isPlaying}
      onCanvasReady={(canvas) => (animationCanvas = canvas)}
    />
  </div>
{/if}

<style>
  .harness {
    padding: 2rem;
    color: var(--theme-text, #fff);
  }

  .studio-harness {
    width: 100%;
    min-height: 100dvh;
    padding: clamp(0.5rem, 1.5vw, 2rem);
    background:
      radial-gradient(
        circle at 12% 0%,
        rgba(87, 64, 180, 0.18),
        transparent 34rem
      ),
      #09090d;
  }

  h1 {
    font-size: 1.5rem;
    margin: 0 0 1rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .controls button {
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .note {
    margin-top: 1rem;
    opacity: 0.7;
    font-size: 0.875rem;
  }

  .offscreen-animation {
    position: fixed;
    top: -99999px;
    left: -99999px;
    width: 320px;
    height: 320px;
    overflow: hidden;
  }
</style>

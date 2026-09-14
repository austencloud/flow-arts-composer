<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { resolveRecordedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";

  interface Props {
    word: string;
    posterUrl?: string | null;
    loadSequence?: () => Promise<SequenceData | null>;
    /** A host-owned sequence bypasses the lazy loader and updates in place. */
    sequence?: SequenceData | null;
    /** Keep the canonical player-and-rail composition visible and interactive. */
    alwaysLive?: boolean;
    /** Host controls rendered in the player frame's unused side rail. */
    controls?: Snippet;
    playbackActive?: boolean;
    playbackMounted?: boolean;
    onRequestPlayback?: () => void;
    activation?: "manual" | "ambient";
    onopen?: () => void;
    openLabel?: string;
    allowQR?: boolean;
    leftPropType?: PropType | null;
    rightPropType?: PropType | null;
    railLeftPropType?: PropType | null;
    railRightPropType?: PropType | null;
    primaryPropColors?: ViewerCustomColorPair;
    externalPlaying?: boolean | null;
    onExternalPlayingChange?: (playing: boolean) => void;
    onStepChange?: (step: number, sequenceId: string | null) => void;
    onSeekRef?: (seek: ((step: number) => void) | null) => void;
    onCellClick?: (stepNumber: number) => void;
    singlePlay?: boolean;
    /** Applied by InlineAnimationPlayer after a reactive sequence reload. */
    initialStep?: number | null;
  }

  let {
    word,
    posterUrl = null,
    loadSequence,
    sequence: directSequence = null,
    alwaysLive = false,
    controls,
    playbackActive = true,
    playbackMounted = playbackActive,
    onRequestPlayback,
    activation = "manual",
    onopen,
    openLabel,
    allowQR = true,
    leftPropType = null,
    rightPropType = null,
    railLeftPropType = null,
    railRightPropType = null,
    primaryPropColors,
    externalPlaying = null,
    onExternalPlayingChange,
    onStepChange,
    onSeekRef,
    onCellClick,
    singlePlay = false,
    initialStep = null,
  }: Props = $props();

  const previewAnimationScope = createAnimationScope({
    persistence: "ephemeral",
  });

  type ResolutionState = "idle" | "loading" | "ready" | "unavailable";

  let loadedSequence = $state<SequenceData | null>(null);
  let resolutionState = $state<ResolutionState>("idle");
  let manualPlayerRequested = $state(false);
  let nearViewport = $state(false);
  let visible = $state(false);
  // Ambient previews wait until the browser preference is known before they
  // start moving. That prevents a reduced-motion visitor from seeing even one
  // eager animation frame during hydration.
  let prefersReducedMotion = $state(true);
  let ambientCardRevealed = $state(false);
  let posterFailed = $state(false);
  let playerLoadState = $state<"idle" | "loading" | "loaded" | "error">("idle");
  let playerReady = $state(false);
  let playerRuntimeError = $state(false);
  let playbackStep = $state(1);
  let directSequenceId = $state<string | null>(null);
  let resolutionPromise: Promise<SequenceData | null> | null = null;
  const sequence = $derived(directSequence ?? loadedSequence);

  // Creator-recorded presentation, resolved ONCE and handed to the player,
  // the step strip, and the Choreo Card together so all three render the same
  // prop pair. Null = no recorded intent; every layer then keeps its default
  // visitor-context behavior. Never written back to global Settings.
  const recordedPropConfig = $derived(resolveRecordedPropConfig(sequence));

  const playerRequested = $derived(
    alwaysLive ||
      manualPlayerRequested ||
      (activation === "ambient" && !prefersReducedMotion)
  );
  const playerMounted = $derived(
    (alwaysLive || playbackMounted) && playerRequested && sequence !== null
  );
  const showCardLayer = $derived(
    !alwaysLive &&
      playerLoadState !== "error" &&
      !playerRuntimeError &&
      (!playerMounted || !playerReady || ambientCardRevealed)
  );
  const loadingRequestedPlayer = $derived(
    playerRequested &&
      (resolutionState === "loading" ||
        playerLoadState === "loading" ||
        (playerMounted && !playerReady))
  );

  $effect(() => {
    const nextSequenceId = directSequence?.id ?? null;
    if (!nextSequenceId) {
      directSequenceId = null;
      return;
    }
    if (nextSequenceId === directSequenceId) return;

    // A direct host replaces its recipe in the existing player. Set the rail to
    // the requested position immediately, then let the reloaded engine confirm
    // it; otherwise the old recipe can remain highlighted during that handoff.
    directSequenceId = nextSequenceId;
    playbackStep = initialStep ?? 1;
  });

  onMount(() => {
    if (typeof window.matchMedia !== "function") {
      prefersReducedMotion = false;
      return;
    }

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const updateMotionPreference = () => {
      prefersReducedMotion = motionPreference.matches;
    };

    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      motionPreference.removeEventListener("change", updateMotionPreference);
    };
  });

  function beginSequenceResolution(
    force = false
  ): Promise<SequenceData | null> {
    if (directSequence) return Promise.resolve(directSequence);
    if (sequence && !force) return Promise.resolve(sequence);
    if (resolutionPromise && !force) return resolutionPromise;

    resolutionState = "loading";
    if (force) resolutionPromise = null;

    if (!loadSequence) {
      resolutionState = "unavailable";
      return Promise.resolve(null);
    }

    const request = loadSequence()
      .then((resolved) => {
        loadedSequence = resolved;
        resolutionState = resolved ? "ready" : "unavailable";
        return resolved;
      })
      .catch((caught) => {
        console.error(
          "[SequenceShowcasePreview] Sequence preview could not be loaded:",
          caught
        );
        loadedSequence = null;
        resolutionState = "unavailable";
        return null;
      })
      .finally(() => {
        if (resolutionPromise === request) resolutionPromise = null;
      });

    resolutionPromise = request;
    return request;
  }

  function activatePreviewWhenNear(node: HTMLElement) {
    return activateWhenNear(node, {
      rootMargin: "180px",
      deferUntilIdle: true,
      idleTimeout: 1200,
      fallbackDelay: 150,
      activate: () => {
        nearViewport = true;
        void beginSequenceResolution();
      },
    });
  }

  function trackPreviewVisibility(node: HTMLElement) {
    if (typeof IntersectionObserver === "undefined") {
      visible = true;
      return {};
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
      },
      { threshold: 0.15 }
    );
    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  function requestPlayback(): void {
    manualPlayerRequested = true;
    onRequestPlayback?.();
    void beginSequenceResolution();
  }

  function retrySequence(): void {
    manualPlayerRequested = true;
    void beginSequenceResolution(true);
  }

  function revealAmbientCard(event: PointerEvent): void {
    if (activation === "ambient" && event.pointerType === "mouse") {
      ambientCardRevealed = true;
    }
  }

  function hideAmbientCard(): void {
    if (activation === "ambient") ambientCardRevealed = false;
  }

  function revealAmbientCardForKeyboard(): void {
    if (activation === "ambient") ambientCardRevealed = true;
  }

  $effect(() => {
    if (playerMounted) return;
    playerReady = false;
    playerRuntimeError = false;
    playbackStep = 1;
  });
</script>

<div
  class="sequence-preview"
  class:ambient={activation === "ambient"}
  class:with-controls={alwaysLive && !!controls}
  data-preview-state={showCardLayer ? "card" : "live"}
  data-activation={activation}
  data-playback-active={playbackActive}
  data-player-mounted={playerMounted}
  data-carousel-step={playbackStep}
  onpointerenter={revealAmbientCard}
  onpointerleave={hideAmbientCard}
  onfocusin={revealAmbientCardForKeyboard}
  onfocusout={hideAmbientCard}
  use:activatePreviewWhenNear
  use:trackPreviewVisibility
  role="group"
  aria-label="{word} Choreo Card and animation preview"
>
  <div
    class="live-presentation"
    aria-hidden={showCardLayer}
    inert={showCardLayer}
  >
    <div class="player-zone">
      <div class="live-player">
        <LazyMount
          loader={() =>
            import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte")}
          active={playerMounted}
          keepAlive={false}
          prefetch={nearViewport && sequence !== null}
          debugName="sequence showcase animation"
          onStatusChange={(status) => (playerLoadState = status)}
          props={{
            sequence,
            leftPropType:
              leftPropType ?? recordedPropConfig?.leftPropType ?? null,
            rightPropType:
              rightPropType ?? recordedPropConfig?.rightPropType ?? null,
            primaryPropColors,
            autoPlay: true,
            showControls: false,
            chrome: "minimal",
            fill: true,
            scrubbable: alwaysLive,
            interactive: alwaysLive || activation === "manual",
            hoverHint: "none",
            cornerToggle: !alwaysLive && activation === "manual",
            playbackAllowed:
              playbackActive && (alwaysLive || visible) && !ambientCardRevealed,
            resumeWhenPlaybackAllowed: true,
            externalBpm: 60,
            // A live reference demonstrates the whole sequence, even when the
            // visitor's workspace is set to repeat an individual count.
            externalPlaybackMode: alwaysLive ? "continuous" : null,
            externalPlaying,
            onExternalPlayingChange,
            singlePlay,
            initialStep,
            disableContextMenu: true,
            hideStepNumbers: true,
            beatIndicators: false,
            onStepChange: (step: number, sequenceId: string | null) => {
              if (directSequence && sequenceId !== directSequence.id) return;
              playbackStep = step;
              onStepChange?.(step, sequenceId);
            },
            onSeekRef,
            onReady: () => {
              playerReady = true;
              playerRuntimeError = false;
            },
            onLoadError: () => {
              playerRuntimeError = true;
            },
            visibilityManagerOverride: previewAnimationScope.visibility,
            effectsConfigState: previewAnimationScope.effects,
            trailSettingsOverride: previewAnimationScope.settings.trail,
          }}
        >
          {#snippet error(_caught, retry)}
            <div class="preview-error" role="alert">
              <span>The player could not load.</span>
              <button type="button" onclick={retry}>Try again</button>
            </div>
          {/snippet}
        </LazyMount>
      </div>

      {#if controls}
        <div class="control-rail">
          {@render controls()}
        </div>
      {/if}
    </div>

    <div class="strip-zone">
      <LazyMount
        loader={() => import("$lib/shared/timeline/StepStrip.svelte")}
        active={playerMounted}
        keepAlive={false}
        prefetch={nearViewport && sequence !== null}
        debugName="sequence showcase step carousel"
        props={{
          sequence,
          includeStartPosition: !alwaysLive,
          leftPropType:
            railLeftPropType ??
            leftPropType ??
            recordedPropConfig?.leftPropType ??
            null,
          rightPropType:
            railRightPropType ??
            rightPropType ??
            recordedPropConfig?.rightPropType ??
            null,
          leftColorOverride: primaryPropColors?.left,
          rightColorOverride: primaryPropColors?.right,
          currentStep: playbackStep,
          bpm: 60,
          density: "compact",
          fillHeight: true,
          anchor: "center",
          orientation: "horizontal",
          loop: alwaysLive,
          stepPulse: false,
          onCellClick,
        }}
      />
    </div>
  </div>

  {#if !alwaysLive}
    <div
      class="card-layer"
      class:visible={showCardLayer}
      aria-hidden={!showCardLayer}
    >
      <div class="card-art">
        {#if sequence}
          <PropAwareThumbnail
            {sequence}
            leftPropType={recordedPropConfig?.leftPropType}
            rightPropType={recordedPropConfig?.rightPropType}
            catDogModeEnabled={recordedPropConfig?.catDogMode ?? false}
            eager
            {allowQR}
          />
        {:else if posterUrl && !posterFailed}
          <img
            class="legacy-poster"
            src={posterUrl}
            alt=""
            loading="lazy"
            onerror={() => (posterFailed = true)}
          />
        {:else}
          <div class="poster-glyph" aria-hidden="true">
            {#if word && word !== "Sequence"}
              <TKAWordGlyph {word} height={30} darkMode />
            {:else}
              <i class="fa-solid fa-arrows-rotate"></i>
            {/if}
          </div>
        {/if}
      </div>

      {#if showCardLayer && resolutionState === "unavailable" && activation === "manual"}
        <div class="preview-error" role="alert">
          <span>Preview unavailable</span>
          <button type="button" onclick={retrySequence}>Try again</button>
        </div>
      {:else if showCardLayer && activation === "manual"}
        <button
          type="button"
          class="play-preview"
          onclick={requestPlayback}
          disabled={loadingRequestedPlayer}
          aria-busy={loadingRequestedPlayer || undefined}
          aria-label="Play {word} preview"
        >
          {#if loadingRequestedPlayer}
            <span class="spinner" aria-hidden="true"></span>
          {:else}
            <i class="fa-solid fa-play" aria-hidden="true"></i>
          {/if}
        </button>
      {/if}
    </div>
  {/if}

  {#if activation === "ambient" && onopen}
    <button
      type="button"
      class="open-preview"
      onclick={onopen}
      aria-label={openLabel ?? `Open ${word} sequence`}
    ></button>
  {/if}
</div>

<style>
  .sequence-preview {
    --sequence-preview-stage-bg: #05070a;

    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
    overflow: hidden;
    border: var(
      --sequence-showcase-border,
      1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12))
    );
    border-radius: var(--sequence-showcase-radius, 10px);
    background: var(--sequence-preview-stage-bg);
    isolation: isolate;
  }

  .live-presentation,
  .preview-error {
    position: absolute;
    inset: 0;
  }

  .live-presentation {
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--sequence-preview-stage-bg);
  }

  .player-zone {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .live-player {
    position: absolute;
    inset: 0;
  }

  .sequence-preview.with-controls {
    aspect-ratio: auto;
  }

  .with-controls .live-presentation {
    position: relative;
    inset: auto;
  }

  .with-controls .player-zone {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(6rem, 9rem);
    align-items: stretch;
  }

  .with-controls .live-player {
    position: relative;
    inset: auto;
    width: 100%;
    aspect-ratio: 1;
  }

  .control-rail {
    display: grid;
    align-content: start;
    min-width: 0;
    padding: 0.5rem;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .strip-zone {
    flex: 0 0 clamp(3.75rem, 22%, 6.5rem);
    min-width: 0;
    min-height: 0;
    padding: 0.25rem;
    overflow: hidden;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  @container (max-width: 28rem) {
    .with-controls .player-zone {
      grid-template-columns: minmax(0, 1fr);
    }

    .control-rail {
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
      border-left: 0;
    }
  }

  .card-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    background: var(--sequence-preview-stage-bg);
    transition:
      opacity var(--duration-normal, 180ms) ease,
      visibility 0s linear var(--duration-normal, 180ms);
  }

  .card-layer.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  .ambient .card-layer {
    pointer-events: none;
  }

  .card-art {
    position: absolute;
    inset: 0;
    container-type: size;
    container-name: image-container choreo-card;
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .card-art > :global(.prop-thumbnail) {
    max-width: 100%;
    max-height: 100%;
  }

  .legacy-poster {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .poster-glyph {
    width: min(72cqw, 13rem);
    min-height: 2rem;
    display: grid;
    place-items: center;
    color: var(--theme-text, #ffffff);
    opacity: 0.76;
  }

  .poster-glyph i {
    font-size: clamp(2rem, 18cqw, 3.5rem);
  }

  .play-preview {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    align-items: center;
    justify-content: center;
    width: clamp(4rem, 24cqw, 5.5rem);
    min-width: var(--touch-target-min, 44px);
    aspect-ratio: 1;
    min-height: var(--touch-target-min, 44px);
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    color: #ffffff;
    background: rgba(7, 10, 14, 0.9);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.34);
    font-size: clamp(1.35rem, 8cqw, 2rem);
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition:
      background var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease,
      transform var(--duration-fast, 120ms) ease;
  }

  .play-preview:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--theme-accent, #22c55e) 72%, white);
    background: rgba(12, 17, 23, 0.96);
    transform: translate(-50%, calc(-50% - 2px)) scale(1.03);
  }

  .play-preview:focus-visible,
  .preview-error button:focus-visible {
    outline: 2px solid var(--theme-accent, #22c55e);
    outline-offset: 2px;
  }

  .play-preview:disabled {
    cursor: wait;
    opacity: 0.78;
  }

  .play-preview i {
    padding-left: 0.16em;
  }

  .open-preview {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    min-width: var(--touch-target-min, 44px);
    min-height: var(--touch-target-min, 44px);
    padding: 0;
    border: 0;
    border-radius: inherit;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }

  .open-preview:focus-visible {
    outline: 2px solid var(--theme-accent, #22c55e);
    outline-offset: -3px;
  }

  .live-player {
    min-width: 0;
    min-height: 0;
    background: var(--sequence-preview-stage-bg);
  }

  .preview-error {
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--theme-text, #ffffff);
    background: var(--sequence-preview-stage-bg);
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .preview-error button {
    min-height: var(--touch-target-min, 44px);
    padding: 0.5rem 1rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.22));
    border-radius: 999px;
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .preview-error button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.16));
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    flex: 0 0 auto;
    border: 2px solid rgba(255, 255, 255, 0.24);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: preview-spin 700ms linear infinite;
  }

  @keyframes preview-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card-layer {
      transition: none;
    }

    .play-preview {
      transition: none;
    }

    .spinner {
      animation-duration: 1400ms;
    }
  }
</style>

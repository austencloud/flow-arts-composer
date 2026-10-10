<!--
  ComposerGenerateDemo

  The Generate section's interactive demo: a real Generate button wired to the
  real client-side generation engine (generationOrchestrator — the same
  context-free service the app's own Generate tab uses). Tap it and a fresh
  rotated LOOP cascades into the workspace on the left and plays on the right.

  The two regions show the sequence's two halves — the notation it IS and the
  movement it BECOMES. An earlier version paired the player with a mandala, but
  the player's own trails already draw that figure, so the pair said one thing
  twice.

  The left stage is the REAL StepGrid, and the reveal is the app's own
  generation cascade: setPendingGenerationAnimation is the flag the Generate tab
  raises before a generated sequence reaches the workspace (see
  generate-actions.svelte.ts), and StepGrid consumes it on its first render.
  Remounting on the new sequence id gives each draw that first render, so every
  click cascades exactly as it does in the app.

  Engine, grid, and player chunks are all dynamically imported so the
  prerendered page pays nothing until the section is reached (grid/player mount
  on idle, seeded with the page's per-visit generated sequence; the engine chunk
  loads on the first button tap). The presentation stage reserves a bounded
  footprint so nothing shifts while those chunks arrive.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { MediaQuery } from "svelte/reactivity";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { activateWhenNear } from "#lib/actions/activate-when-near.js";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ComposerWordRow from "./ComposerWordRow.svelte";
  import {
    HERO_TIP_EFFECT_MAP,
    HERO_TRAIL_PRESET,
  } from "#lib/shared/landing/data/hero-trail-preset.js";
  import { setPendingGenerationAnimation } from "#lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    classifyComposerGenerationFailure,
    type ComposerGenerationResult,
  } from "./composer-generation-failure";
  import { shouldAdoptCarriedSequence } from "./composer-sequence-ownership";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";
  import { generateComposerDemoSequence } from "./composer-demo-generation";
  import { observeComposerStopVisibility } from "./observe-composer-stop-visibility";

  /** Four columns keep the real workspace cells legible at showcase scale. */
  const STEP_COLUMNS = 4;

  // Introduce circular paths consistently, regardless of saved hybrid choices.
  const demoVisibilityManager = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  demoVisibilityManager.setPathPolicy({
    pathShape: "arc",
    motionAwarePaths: false,
  });

  /** The page's per-visit demo sequence seeds the stages; null while it is
      still generating (the bounded stages hold the footprint). */
  let {
    sequence,
    onGenerated,
    leftPropType,
    rightPropType,
    appearance,
    active = true,
    embedded = false,
    propControl,
  }: {
    sequence: SequenceData | null;
    onGenerated?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    appearance?: ComposerPropAppearance;
    active?: boolean;
    embedded?: boolean;
    /** The host page's prop chooser, shown at the start of the word row. */
    propControl?: Snippet;
  } = $props();

  let current = $state<SequenceData | null>(null);
  let generating = $state(false);
  let result = $state<ComposerGenerationResult>("idle");
  let previewActive = $state(false);
  let inViewport = $state(false);
  let playbackStep = $state<number | null>(null);
  let playbackSequenceId = $state<string | null>(null);
  const selectedStepNumber = $derived(
    current && playbackSequenceId === current.id ? playbackStep : null
  );
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  function handlePlayerStepChange(step: number, sequenceId: string | null) {
    playbackStep = Math.floor(step);
    playbackSequenceId = sequenceId;
  }

  // Viewer parity: clicking a cell snaps the player to that step and keeps its
  // play state, as the sequence viewer's rail and the Construct stop do. The
  // player publishes its seek through onSeekRef and re-registers only when the
  // callback identity changes, so these stay stable across LazyMount's rebuilt
  // props objects.
  let seekToStep: ((step: number) => void) | null = null;
  function handleSeekRef(seek: ((step: number) => void) | null) {
    seekToStep = seek;
  }
  function handleStepClick(stepNumber: number) {
    seekToStep?.(stepNumber);
  }
  function handleStartClick() {
    seekToStep?.(0);
  }

  // The page sequence changes when the hero rolls or Construct composes; the
  // generator shows it when it is in view. Its own draws set the local copy
  // and then write the page sequence, so the write comes back with the id
  // already shown and never reads as a change.
  $effect(() => {
    if (shouldAdoptCarriedSequence(current, sequence, inViewport)) {
      current = sequence;
    }
  });

  const stepData = $derived<StepData[]>(
    current ? [...(current.steps ?? [])] : []
  );

  function activatePreview(node: HTMLElement) {
    return activateWhenNear(node, {
      activate: () => (previewActive = true),
      rootMargin: "360px",
      deferUntilIdle: true,
      idleTimeout: 2200,
      fallbackDelay: 180,
    });
  }

  const observeViewport = (node: HTMLElement) =>
    observeComposerStopVisibility(node, (visible) => (inViewport = visible));

  async function generate() {
    if (generating) return;
    previewActive = true;
    generating = true;
    result = "idle";
    try {
      const seq = await generateComposerDemoSequence();
      // Plain-ify reactive proxies before handing to the grid/player.
      // Raise the app's generation flag first: the remounted StepGrid reads it
      // on its first render and runs the same staggered reveal the Generate tab
      // produces. It clears itself once consumed.
      setPendingGenerationAnimation(true);
      current = seq;
      onGenerated?.(seq);
      result = "success";
    } catch (error) {
      result = classifyComposerGenerationFailure(error);
      if (result === "error") {
        console.error("[composer presentation] generation failed", error);
      }
    } finally {
      generating = false;
    }
  }
</script>

<div
  class="generate-demo"
  class:embedded
  use:activatePreview
  use:observeViewport
>
  <div class="stages">
    <!-- The notation: the real workspace grid, cascading in on each draw.
         fitAllSteps scales the cells to the box instead of sizing them from the
         column count alone. No arrivalSequence: it draws a mandala chip into the
         grid, and the player beside it already traces that same figure. -->

    <div class="stage notation-stage">
      <ComposerWordRow word={current?.word ?? ""} live="polite" {propControl} />
      <div class="stage-content">
        {#key current?.id}
          <LazyMount
            loader={() =>
              import("#lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte")}
            active={previewActive && inViewport && !!current}
            props={{
              steps: stepData,
              startPlacement: current?.startPlacement ?? null,
              manualColumnCount: STEP_COLUMNS,
              activeMode: "generate",
              selectedStepNumber,
              autoFocusSelectedStep: false,
              onStepClick: handleStepClick,
              onStartClick: handleStartClick,
              fitAllSteps: true,
              sequenceWord: current?.word ?? "",
              leftPropTypeOverride: leftPropType,
              rightPropTypeOverride: rightPropType ?? leftPropType,
              fanAppearanceOverride: appearance?.fanAppearance,
              propLookOverride: appearance?.propLook,
              leftBuugengFlippedOverride: appearance?.leftBuugengFlipped,
              rightBuugengFlippedOverride: appearance?.rightBuugengFlipped,
              leftColorOverride: appearance?.primaryPropColors?.left,
              rightColorOverride: appearance?.primaryPropColors?.right,
            }}
          />
        {/key}
      </div>
    </div>
    <!-- The movement: the same steps, playing. -->
    <div class="stage movement-stage">
      <div class="stage-content">
        <LazyMount
          loader={() =>
            import("#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte")}
          active={previewActive && inViewport && !!current}
          props={{
            sequence: current,
            autoPlay: active && inViewport && !reduceMotion.current,
            chrome: "minimal",
            fill: true,
            cornerToggle: true,
            cornerToggleAtRest: true,
            playbackAllowed: active && inViewport,
            resumeWhenPlaybackAllowed: true,
            onStepChange: handlePlayerStepChange,
            onSeekRef: handleSeekRef,
            leftPropType,
            rightPropType: rightPropType ?? leftPropType,
            ...appearance,
            visibilityManagerOverride: demoVisibilityManager,
            trailSettingsOverride: HERO_TRAIL_PRESET,
            tipEffectMap: HERO_TIP_EFFECT_MAP,
          }}
        />
      </div>
    </div>
  </div>

  <div class="demo-footer">
    <div class="action-row">
      <PanelButton variant="primary" onclick={generate} disabled={generating}>
        <i
          class="fas {generating ? 'fa-circle-notch fa-spin' : 'fa-dice'}"
          aria-hidden="true"
        ></i>
        <span
          >{generating
            ? t("composer_demo_generating")
            : t("composer_demo_generate_new")}</span
        >
      </PanelButton>
      <!-- The line is always reserved so either failure state can arrive without
           moving the controls or demonstrations around it. Success says nothing:
           the grid cascading and the player restarting ARE the confirmation, and
           narrating them adds a line of copy that tells the visitor what they can
           already see. -->
      <span
        class="retry-note"
        class:shown={result === "no-result" || result === "error"}
        aria-live="polite"
      >
        {result === "no-result"
          ? t("composer_demo_no_result")
          : result === "error"
            ? t("composer_demo_generate_failed")
            : ""}
      </span>
    </div>
  </div>
</div>

<style>
  .generate-demo {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    padding: clamp(1rem, 1.8cqw, 1.5rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1.1rem, 2cqw, 1.5rem);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.92)) 85%,
      transparent
    );
    box-shadow: 0 2rem 5rem oklch(0.04 0.03 270 / 0.28);
  }

  .generate-demo.embedded {
    padding: clamp(1rem, 1.8cqw, 1.5rem);
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .stages {
    display: grid;
    grid-template-columns: minmax(0, 1.28fr) minmax(26rem, 0.92fr);
    gap: 0;
    min-height: 0;
  }

  /* The overview gets the wider track. Both components keep a definite block
     size for their size-container math, but the stage stops growing once the
     artifacts have enough room to explain themselves. */
  .stage {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(2.5rem, auto) minmax(0, 1fr);
  }

  .movement-stage {
    grid-template-rows: minmax(0, 1fr);
    padding-left: clamp(1rem, 1.8cqw, 1.75rem);
    border-left: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .stage-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: stretch;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid
      color-mix(in srgb, var(--theme-stroke, #fff) 72%, transparent);
    border-radius: 1rem;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, oklch(0.16 0.018 270 / 0.45)) 92%,
      var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.92))
    );
  }

  .stage-content > :global(*) {
    min-width: 0;
    min-height: 0;
  }

  .demo-footer {
    min-height: 5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.16));
  }

  .action-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .retry-note {
    min-height: 1.25rem;
    font-size: var(--font-size-min, 0.875rem);
    color: oklch(0.74 0.018 270);
    font-style: italic;
    visibility: hidden;
  }
  .retry-note.shown {
    visibility: visible;
  }

  @container (max-width: 56rem) {
    .stages {
      grid-template-columns: 1fr;
    }

    .stage {
      min-height: clamp(15rem, 66cqw, 24rem);
    }

    .movement-stage {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      padding-left: 0;
      border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
      border-left: 0;
    }

    .movement-stage .stage-content {
      min-height: clamp(18rem, 70cqw, 30rem);
    }
  }
</style>

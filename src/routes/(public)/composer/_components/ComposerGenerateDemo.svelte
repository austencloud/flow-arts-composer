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
  import { MediaQuery } from "svelte/reactivity";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { setPendingGenerationAnimation } from "$lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import {
    classifyComposerGenerationFailure,
    type ComposerGenerationResult,
  } from "./composer-generation-failure";
  import { shouldAdoptCarriedSequence } from "./composer-sequence-ownership";

  /** Eight columns let a 16-step LOOP read as an overview instead of a second
      square competing with the focused animation. */
  const STEP_COLUMNS = 8;
  const COMPACT_STEP_COLUMNS = 4;

  /** The page's per-visit demo sequence seeds the stages; null while it is
      still generating (the bounded stages hold the footprint). */
  let {
    sequence,
    onGenerated,
  }: {
    sequence: SequenceData | null;
    onGenerated?: (sequence: SequenceData) => void;
  } = $props();

  let current = $state<SequenceData | null>(null);
  let hasGeneratedLocally = $state(false);
  let generating = $state(false);
  let result = $state<ComposerGenerationResult>("idle");
  let active = $state(false);
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  const compactLayout = new MediaQuery("(max-width: 56rem)");

  $effect(() => {
    if (shouldAdoptCarriedSequence(current, sequence, hasGeneratedLocally)) {
      current = sequence;
    }
  });

  const word = $derived(
    current ? simplifyRepeatedWord(current.word ?? "") : ""
  );

  const stepData = $derived<StepData[]>(
    current ? [...(current.steps ?? [])] : []
  );

  function activatePreview(node: HTMLElement) {
    return activateWhenNear(node, {
      activate: () => (active = true),
      rootMargin: "360px",
      deferUntilIdle: true,
      idleTimeout: 2200,
      fallbackDelay: 180,
    });
  }

  async function generate() {
    if (generating) return;
    active = true;
    generating = true;
    result = "idle";
    try {
      const [{ generationOrchestrator }, models, circular, grid, prop] =
        await Promise.all([
          import("$lib/shared/create/services/generation-orchestrator"),
          import("$lib/shared/foundation/domain/models/generation/generate-models"),
          import("$lib/shared/foundation/domain/models/generation/circular-models"),
          import("$lib/shared/pictograph/grid/domain/enums/grid-enums"),
          import("$lib/shared/pictograph/prop/domain/enums/prop-type"),
        ]);
      // This button intentionally exposes one prepared recipe, not the full
      // generator: 16 steps, intermediate difficulty, smooth constraints, and
      // a rotated quarter-period LOOP. Each draw may change the whole sequence.
      const seq = await generationOrchestrator.generateSequence({
        mode: models.GenerationMode.CIRCULAR,
        loopType: circular.LOOPType.ROTATED,
        period: circular.Period.QUARTERED,
        length: 16,
        turnIntensity: 1.5,
        gridMode: grid.GridMode.DIAMOND,
        propType: prop.PropType.STAFF,
        difficulty: models.DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      // Plain-ify reactive proxies before handing to the grid/player.
      // Raise the app's generation flag first: the remounted StepGrid reads it
      // on its first render and runs the same staggered reveal the Generate tab
      // produces. It clears itself once consumed.
      setPendingGenerationAnimation(true);
      hasGeneratedLocally = true;
      current = JSON.parse(JSON.stringify(seq)) as SequenceData;
      onGenerated?.(current);
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

<div class="generate-demo" use:activatePreview>
  <div class="stages">
    <!-- The notation: the real workspace grid, cascading in on each draw.
         fitAllSteps scales the cells to the box instead of sizing them from the
         column count alone. No arrivalSequence: it draws a mandala chip into the
         grid, and the player beside it already traces that same figure. -->

    <div class="stage notation-stage">
      <header class="stage-heading">
        <strong>Sequence</strong>
        <span>Notation</span>
      </header>
      <div class="stage-content">
        {#key current?.id}
          <LazyMount
            loader={() =>
              import("$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte")}
            active={active && !!current}
            props={{
              steps: stepData,
              startPlacement: current?.startPlacement ?? null,
              manualColumnCount: compactLayout.current
                ? COMPACT_STEP_COLUMNS
                : STEP_COLUMNS,
              activeMode: "generate",
              fitAllSteps: true,
              sequenceWord: current?.word ?? "",
            }}
          />
        {/key}
      </div>
    </div>
    <!-- The movement: the same steps, playing. -->
    <div class="stage movement-stage">
      <header class="stage-heading">
        <strong>Movement</strong>
        <span>Animation</span>
      </header>
      <div class="stage-content">
        {#key current?.id}
          <LazyMount
            loader={() =>
              import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte")}
            active={active && !!current}
            props={{
              sequence: current,
              autoPlay: !reduceMotion.current,
              chrome: "minimal",
              fill: true,
              cornerToggle: true,
            }}
          />
        {/key}
      </div>
    </div>
  </div>

  <div class="demo-footer">
    <!-- The word slot stays reserved while a sequence loads, so the action
         never moves sideways. -->
    <div class="caption-row">
      <span class="caption-label">Sequence word</span>
      <span class="tka-font caption-word" class:pending={!current}>{word}</span>
    </div>

    <div class="action-row">
      <button
        type="button"
        class="generate-button"
        onclick={generate}
        disabled={generating}
      >
        <i
          class="fas {generating ? 'fa-circle-notch fa-spin' : 'fa-dice'}"
          aria-hidden="true"
        ></i>
        <span>{generating ? "Generating..." : "Generate a new one"}</span>
      </button>
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
          ? "That recipe found no valid sequence. Draw again."
          : result === "error"
            ? "The generator couldn't run. Try again."
            : ""}
      </span>
    </div>
  </div>
</div>

<style>
  .generate-demo {
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

  .stages {
    display: grid;
    grid-template-columns: minmax(0, 1.28fr) minmax(26rem, 0.92fr);
    gap: 0;
  }

  /* The overview gets the wider track. Both components keep a definite block
     size for their size-container math, but the stage stops growing once the
     artifacts have enough room to explain themselves. */
  .stage {
    min-width: 0;
    height: clamp(20rem, 27cqw, 31rem);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
  }

  .movement-stage {
    padding-left: clamp(1rem, 1.8cqw, 1.75rem);
    border-left: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
  }

  .stage-heading {
    min-height: 1.5rem;
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 0.625rem;
    color: var(--theme-text, #fff);
  }

  .stage-heading strong {
    font-size: var(--font-size-base, 1rem);
    font-weight: 650;
  }

  .stage-heading span {
    color: var(--theme-text-dim, oklch(0.7 0.018 270));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  .stage-content {
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
    min-height: 5.5rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.16));
  }

  .caption-row {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.55rem;
    color: oklch(0.74 0.018 270);
  }

  .caption-label {
    color: var(--theme-text-dim, oklch(0.7 0.018 270));
    font-size: var(--font-size-min, 0.875rem);
  }

  .caption-word {
    font-size: var(--font-size-lg, 1.125rem);
    color: oklch(0.88 0.03 270);
  }

  .caption-word.pending {
    visibility: hidden;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .generate-button {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 48px;
    padding: 0 1.8rem;
    font-size: var(--font-size-base, 1rem);
    font-weight: 650;
    font-family: inherit;
    color: #fff;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 58%, transparent);
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      var(--theme-card-bg, transparent)
    );
    box-shadow: 0 0.75rem 1.75rem
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent);
    cursor: pointer;
    transition:
      transform var(--transition-fast, 150ms ease),
      background var(--transition-fast, 150ms ease),
      box-shadow var(--transition-fast, 150ms ease),
      opacity var(--transition-fast, 150ms ease);
  }

  .generate-button:hover:not(:disabled) {
    transform: translateY(-1px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      var(--theme-card-bg, transparent)
    );
    box-shadow: 0 1rem 2.25rem
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 28%, transparent);
  }

  .generate-button:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .retry-note {
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
      height: clamp(15rem, 66cqw, 24rem);
    }

    .movement-stage {
      height: auto;
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      padding-left: 0;
      border-top: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
      border-left: 0;
    }

    .movement-stage .stage-content {
      height: clamp(18rem, 70cqw, 30rem);
    }

    .demo-footer {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }

    .action-row {
      align-items: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .generate-button {
      transition: none;
    }
    .generate-button:hover:not(:disabled) {
      transform: none;
    }
  }
</style>

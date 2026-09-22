<!--
GlyphOverlay.svelte

Cross-fading glyph overlay for AnimatorCanvas.
Displays TKA glyph and beat number with smooth fade transitions.

Uses {#key} blocks to ensure each unique letter/step triggers proper
in/out transitions, creating a true cross-fade effect.

Dark mode: Uses prop-based approach for preview isolation.
When darkMode prop is provided, it overrides global state.
CSS class .dark-mode triggers styling, with fallback to :global(:root.dark).
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import TKAGlyph from "$lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import TurnsColumn from "$lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte";
  import StepNumber from "$lib/shared/pictograph/shared/components/StepNumber.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import ElementalGlyph from "$lib/shared/pictograph/shared/components/ElementalGlyph.svelte";
  import { getLetterDimensions } from "$lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
  import { derivePropElementalTypeForStep } from "$lib/shared/shape-matrix/domain/prop-relationship";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    calculateGlyphOverlayFrame,
    type GlyphOverlayFrameMode,
  } from "$lib/shared/animation-engine/domain/glyph-overlay-frame";

  let {
    // Current glyph state
    letter = null,
    displayedLetter = null,
    displayedTurnsTuple = "(s, 0, 0)",
    displayedStepNumber = null,
    displayedMusicalPosition = undefined,
    // Step data for turn color interpretation (determines blue/red assignment)
    stepData = null,
    // Visibility
    tkaGlyphVisible = true,
    elementalGlyphVisible = false,
    propElementalGlyphVisible = false,
    propElementalType = null,
    stepNumbersVisible = true,
    // Start→end position indicator (α/β/γ) centered at the top. Educational
    // overlay for the guide's hand-path exploration; off elsewhere.
    placementGlyphVisible = false,
    // Dark mode - when provided, overrides global state (for preview isolation)
    darkMode = false,
    // Start position indicator - shows "Start" in top-left when at start position
    isAtStartPlacement = false,
    // End position indicator - shows "End" in top-left when at end position (freeform sequences only)
    isAtEndPlacement = false,
    // Pictographs keep their canonical square. Stage embeds may let the four
    // annotations use a rectangular frame while the motion plane stays square.
    glyphFrame = "pictograph",
  }: {
    letter?: Letter | null;
    displayedLetter?: Letter | null;
    displayedTurnsTuple?: string;
    displayedStepNumber?: number | null;
    displayedMusicalPosition?: string | null;
    stepData?: PictographData | null;
    tkaGlyphVisible?: boolean;
    elementalGlyphVisible?: boolean;
    propElementalGlyphVisible?: boolean;
    /** Host-supplied prop relationship; derived from the step when absent. */
    propElementalType?: ElementalType | null;
    stepNumbersVisible?: boolean;
    placementGlyphVisible?: boolean;
    darkMode?: boolean;
    isAtStartPlacement?: boolean;
    isAtEndPlacement?: boolean;
    glyphFrame?: GlyphOverlayFrameMode;
  } = $props();

  let overlayWidth = $state(0);
  let overlayHeight = $state(0);
  const frame = $derived(
    calculateGlyphOverlayFrame(glyphFrame, overlayWidth, overlayHeight)
  );

  // Cross-fade duration in ms
  const FADE_DURATION = DURATION.normal;
  // The step number swaps instead of cross-fading (see the markup comment),
  // so its out and in phases each take half the envelope. Both overlays then
  // start and finish their step transition at the same instants.
  const STEP_NUMBER_PHASE_DURATION = FADE_DURATION / 2;

  // Track letter dimensions with reactive state that updates when cache is populated
  // We use $state + $effect because $derived only evaluates once per change,
  // but the cache is populated asynchronously by TKAGlyph after SVG loads
  let letterDimensions = $state({ width: 100, height: 100 });

  // Watch for letter changes and poll for dimensions until they're loaded
  $effect(() => {
    if (!letter || !tkaGlyphVisible) {
      letterDimensions = { width: 100, height: 100 };
      return;
    }

    // IMPORTANT: Reset to default first to prevent using stale dimensions from previous letter
    // This ensures TurnsColumn won't render until we have the correct dimensions
    letterDimensions = { width: 100, height: 100 };

    // Check cache immediately
    const cached = getLetterDimensions(letter);
    if (cached.width !== 100 || cached.height !== 100) {
      letterDimensions = cached;
      return;
    }

    // Dimensions not cached yet - poll until available
    // TKAGlyph will load them, we just need to detect when it's done
    const interval = setInterval(() => {
      const dims = getLetterDimensions(letter);
      if (dims.width !== 100 || dims.height !== 100) {
        letterDimensions = dims;
        clearInterval(interval);
      }
    }, 16); // Check every frame

    return () => clearInterval(interval);
  });

  // Create a composite key for glyph changes to trigger cross-fade
  // Includes letter and turns tuple so changing either triggers a transition
  const glyphKey = $derived(letter ? `${letter}-${displayedTurnsTuple}` : null);

  const elementalInfo = $derived(deriveTnDFromPictograph(stepData));
  const elementalLetter = $derived(
    stepData?.letter ?? displayedLetter ?? letter
  );

  // Create a key for step number changes
  const stepKey = $derived(
    isAtStartPlacement
      ? "start"
      : isAtEndPlacement
        ? "end"
        : (displayedStepNumber?.toString() ?? null)
  );

  // The artwork itself is keyed by element. Consecutive steps that share the
  // same symbol stay visually steady; an actual symbol change crossfades once.
  const elementalKey = $derived(elementalInfo.elementalType);
  // The props' own relationship, classified from this step's spin and phase.
  const effectivePropElementalType = $derived(
    propElementalType ?? derivePropElementalTypeForStep(stepData)
  );
  const propElementalKey = $derived(effectivePropElementalType);

  // Current step's start/end grid positions (α/β/γ) for the PlacementGlyph.
  // StepData carries both; StartPlacementData/PictographData without them just
  // suppress the glyph (PlacementGlyph.shouldRender needs both present).
  const stepStartPlacement = $derived(
    (stepData as StepData | null)?.startPlacement ?? null
  );
  const stepEndPlacement = $derived(
    (stepData as StepData | null)?.endPlacement ?? null
  );
  // Key the position cross-fade on the transition itself so each step swap
  // fades like the letter glyph and the step number.
  const positionKey = $derived(
    stepStartPlacement && stepEndPlacement
      ? `${stepStartPlacement}->${stepEndPlacement}`
      : null
  );
</script>

<div
  class="glyph-overlay"
  class:dark-mode={darkMode}
  data-controlled="true"
  data-glyph-frame={glyphFrame}
  bind:clientWidth={overlayWidth}
  bind:clientHeight={overlayHeight}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${frame.width} ${frame.height}`}
    class="glyph-svg"
  >
    <!-- TKA Glyph with cross-fade using {#key} block -->
    <!-- When glyphKey changes, old element fades out while new element fades in simultaneously -->
    {#if letter && tkaGlyphVisible}
      {#key glyphKey}
        <g
          class="glyph-group"
          transform={`translate(0 ${frame.bottomOffset})`}
          in:fade={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
          out:fade={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
        >
          <TKAGlyph
            {letter}
            pictographData={null}
            x={50}
            y={800}
            scale={1}
            visible={true}
            {darkMode}
          />
          <TurnsColumn
            turnsTuple={displayedTurnsTuple}
            {letter}
            {letterDimensions}
            pictographData={stepData}
            x={50}
            y={800}
            scale={1}
            visible={true}
            {darkMode}
            instantAppear={true}
          />
        </g>
      {/key}
    {/if}

    <!-- Keep the outgoing symbol mounted until its outro completes. Because
         Crossfade renders an HTML div, the keyed SVG group is the valid SVG
         equivalent used by the other glyphs in this overlay. -->
    {#if elementalGlyphVisible && elementalInfo.elementalType}
      {#key elementalKey}
        <g
          class="elemental-glyph-transition"
          transform={`translate(${frame.rightOffset} ${frame.bottomOffset})`}
          in:fade|global={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
          out:fade|global={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
        >
          <ElementalGlyph
            elementalType={elementalInfo.elementalType}
            letter={elementalLetter}
            visible={true}
          />
        </g>
      {/key}
    {/if}

    <!-- The hand relationship owns the bottom-right corner; the prop
         relationship sits top-right, behind its own toggle. -->
    {#if propElementalGlyphVisible && effectivePropElementalType}
      {#key propElementalKey}
        <g
          class="prop-elemental-glyph-transition"
          transform={`translate(${frame.rightOffset} 0)`}
          in:fade|global={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
          out:fade|global={{
            duration: motionDuration(FADE_DURATION),
            easing: cubicOut,
          }}
        >
          <ElementalGlyph
            elementalType={effectivePropElementalType}
            visible={true}
            corner="top-right"
            ariaLabel={`Prop timing and direction element: ${effectivePropElementalType}`}
          />
        </g>
      {/key}
    {/if}

    <!-- Start→end position (α/β/γ) centered at top. Stays put between steps;
         PlacementGlyph's own pulse reacts only when the positions actually change. -->
    {#if placementGlyphVisible && positionKey && !isAtStartPlacement}
      <PlacementGlyph
        startPlacement={stepStartPlacement as GridPlacement}
        endPlacement={stepEndPlacement as GridPlacement}
        {letter}
        visible={true}
        centerX={frame.centerX}
      />
    {/if}

    <!-- Step number cross-fade. Both texts sit at the SAME svg coordinates
         (StepNumber.svelte: x=50,y=50), so a simultaneous in+out fade (the
         Crossfade primitive's default "crossfade" mode) double-exposes two
         overlapping, both-legible words mid-transition — most visible on the
         Start/End swap. The Crossfade component itself can't wrap this: it
         renders an HTML <div>, invalid inside this <svg>/<g> tree. This ports
         its "swap" mode's sequencing by hand (out fully completes before in
         starts — in:fade delay = out's full duration, matching Crossfade's
         own inDelay = duration computation for mode="swap") so the words
         never overlap. See crossfade-primitive.md.
         Each phase runs for half of FADE_DURATION so the whole swap fits the
         same envelope as the letter glyph's cross-fade below-left; a full
         duration per phase made the number visibly lag the glyph.
         The Start/End words are step labels too: the step-numbers toggle hides
         all three, matching the export compositor's single showStepNumbers gate. -->
    {#if stepNumbersVisible}
      {#key stepKey}
        <g
          class="beat-number-group"
          in:fade={{
            duration: motionDuration(STEP_NUMBER_PHASE_DURATION),
            delay: motionDuration(STEP_NUMBER_PHASE_DURATION),
            easing: cubicOut,
          }}
          out:fade={{
            duration: motionDuration(STEP_NUMBER_PHASE_DURATION),
            easing: cubicOut,
          }}
        >
          <StepNumber
            stepNumber={isAtStartPlacement
              ? 0
              : isAtEndPlacement
                ? -2
                : displayedStepNumber}
            {darkMode}
          />
        </g>
      {/key}
    {/if}
  </svg>
</div>

<style>
  .glyph-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }

  .glyph-svg {
    width: 100%;
    height: 100%;
  }

  /* Override TKAGlyph's internal opacity transitions - we control fade at group level */
  /* Only disable opacity transition, allow filter transition for dark mode */
  .glyph-group :global(.tka-glyph) {
    opacity: 1 !important;
    transition: filter var(--duration-fast) ease-out !important;
  }

  .glyph-group :global(.turns-column) {
    opacity: 1 !important;
    transition: filter var(--duration-fast) ease-out !important;
  }

  /* Beat pulse on the step number: the group remounts on every step (keyed on
     stepKey), so this mount animation replays at every seam — in time with the
     golden step ring (same 400ms as guideStepRingIn). */
  .beat-number-group {
    transform-box: fill-box;
    transform-origin: center;
    animation: step-number-pulse 400ms ease-out;
  }
  @keyframes step-number-pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(0.91);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Dark-mode glyph recoloring is handled INSIDE TKAGlyph by swapping the
     letter's <image> source to a white-recolored SVG data URL (driven by its
     darkMode prop) — no filter. A CSS `filter: invert()` here is both
     unnecessary and harmful: iOS Safari drops CSS filters on SVG content (it
     left the glyph black on iPhone), so the CSS invert is removed. */

  /* Accessibility: reduced motion users get instant transitions */
  @media (prefers-reduced-motion: reduce) {
    .glyph-group,
    .elemental-glyph-transition,
    .prop-elemental-glyph-transition,
    .beat-number-group {
      transition: none !important;
      animation: none !important;
    }
  }
</style>

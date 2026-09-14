<!--
	CardHoverPreviewLayer.svelte

	Plays a gallery card's sequence in place, filling the card's thumbnail box,
	with the engine-aligned mandala guide drawn beneath the props.

	It renders inside the card rather than popping forward, so it can never
	cover a neighbour, never needs viewport clamping, and never changes the
	grid's geometry — the card looks the same size whether it's animating or
	not. The word header rides above the canvas because the static thumbnail
	underneath (which bakes the word in) is hidden while this is up.

	Mounted only while its card is the single active preview, so exactly one
	AnimationEngine exists at a time no matter how big the grid is.
-->
<script lang="ts">
  import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onDestroy, untrack } from "svelte";
  import { flyFade, popIn } from "$lib/shared/transitions/motion";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import WordHeader from "$lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
  import {
    tryGetLoopDisplayResolver,
    type LoopDisplay,
  } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
  import {
    performsStartSlot,
    resolveCycleBeatIndex,
    resolvePreviewCycleStep,
  } from "$lib/shared/timeline/loop-cycle";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import {
    DURATION,
    SLIDE,
    STAGGER,
  } from "$lib/shared/transitions/transitions";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  const {
    sequence,
    collectionPropType = null,
    instant = false,
    onReady,
    headerFrac = 0,
  }: {
    sequence: SequenceData;
    collectionPropType?: PropType | null;
    /** Height of the baked sheet's header band as a fraction of the card box
     * (from computeSheetRegionMap). The live header renders in exactly that
     * band, so toggling the preview never moves the word — it's the same
     * header in the same place, whichever mode the card is in. */
    headerFrac?: number;
    /** Collapse the layer's own dissolve to zero. The card sets this when a
     * view-transition morph is running the show — two animation systems
     * moving the same elements reads as a glitch, and a lingering |global
     * outro would leave duplicate view-transition-names in the new state,
     * which aborts the whole transition. */
    instant?: boolean;
    /** Fires once, when the first playable frame exists — the card's morph
     * awaits this before letting the view transition capture the new state,
     * so it never snapshots a half-hydrated preview. */
    onReady?: () => void;
  } = $props();

  const BPM = 60;
  const MS_PER_BEAT = 60000 / BPM;

  interface Playback {
    sequence: SequenceData;
    orchestrator: SequenceAnimationOrchestrator;
    animState: ReturnType<typeof createAnimationPanelState>;
    /** Whether this sequence's repeat performs the start pose, by the same
     *  rule the canonical playback controller applies at its own boundary.
     *  A seamlessly loopable sequence does not: its cadence stays exactly N
     *  beats per repeat, with no stillness inserted at the seam. */
    performsStartSlot: boolean;
  }

  // One per layer, not per playback: the canvas stays mounted while variations
  // swap underneath it, so handing it a fresh manager would reset the mandala.
  // Ephemeral so switching the mandala on here never writes through to the
  // animation panel's own saved visibility settings.
  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });

  let playback = $state<Playback | null>(null);
  let currentStep = $state(0);
  let boxWidth = $state(0);
  let boxHeight = $state(0);
  // The rail follows the free axis: a card wider than it is tall grows one to
  // the right as a vertical carousel, a taller one lays it below. Every card
  // gets a rail — a preview that sometimes carries the notation and sometimes
  // doesn't reads as a bug, not as a size adaptation.
  const railRight = $derived(boxWidth > boxHeight);
  let frameId: number | null = null;
  let startTime: number | null = null;
  /** Guards against a slow hydration landing after the pointer moved on. */
  let loadToken = 0;

  function teardown() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    startTime = null;
    currentStep = 0;
    dispose(playback);
    playback = null;
  }

  function dispose(target: Playback | null) {
    target?.orchestrator.dispose();
    target?.animState.dispose();
  }

  function tick(now: number) {
    if (startTime === null) startTime = now;
    currentStep = (now - startTime) / MS_PER_BEAT;
    frameId = requestAnimationFrame(tick);
  }

  async function start(target: SequenceData) {
    const token = ++loadToken;
    let hydrated: SequenceData | null;
    try {
      hydrated = await ensureMotionData(target);
    } catch {
      // Hydration failed — release any morph waiting on readiness so the
      // toggle's view transition degrades to its quick fade instead of
      // holding the 1500ms race open for a frame that will never come.
      onReady?.();
      return;
    }
    if (token !== loadToken) return;
    if (!hydrated?.steps?.length) return;

    const orchestrator = new SequenceAnimationOrchestrator(
      new AnimationStateManager(),
      () => ({
        ...getViewerAnimationPropConfig(),
        ...resolveViewingProps(getSettings(), hydrated, collectionPropType)
          .config,
      })
    );
    const animState = createAnimationPanelState();

    orchestrator.initializeWithDomainData(hydrated);
    animState.setSequenceData(hydrated);
    animState.setTotalSteps(hydrated.steps.length);

    // Swap, don't tear down and rebuild: cycling to another variation mid-play
    // would otherwise blank the card for a frame. The beat phase carries over,
    // so the new sequence picks up where the old one was.
    const outgoing = playback;
    playback = {
      sequence: hydrated,
      orchestrator,
      animState,
      performsStartSlot: performsStartSlot(hydrated),
    };
    dispose(outgoing);
    if (frameId === null) frameId = requestAnimationFrame(tick);
  }

  $effect(() => {
    const target = sequence;
    if (untrack(() => playback?.sequence.id) === target.id) return;
    void start(target);
  });

  /**
   * Free-running beats → a float step inside ONE repeat of this sequence.
   *
   * Playback time is untouched for a seamlessly loopable sequence: this is the
   * same `(elapsed % stepCount) + 1` cadence the preview has always run. A
   * freeform sequence performs the start hold at its seam, exactly as the
   * canonical controller does when it restarts such a sequence at 0.
   *
   * The rail's wrap is solved separately, by StepStrip's loop offset: the
   * carousel travels FORWARD through the boundary in every case (see the
   * `loop` prop below), instead of its index falling back to beat 1 — which
   * StepStrip reads as a backward scrub and hard-cuts (`no-anim`).
   */
  function cycleStep(active: Playback, elapsedBeats: number): number {
    return resolvePreviewCycleStep(
      elapsedBeats,
      active.sequence.steps?.length ?? 0,
      active.performsStartSlot
    );
  }

  // Drive prop states from the beat counter.
  $effect(() => {
    const position = currentStep;
    const active = playback;
    if (!active || !active.orchestrator.isInitialized()) return;

    // calculateState treats step < 1 as the start position and holds the pose
    // derived from beat 1's initial angles — the same contract the canonical
    // players use for beat 0.
    active.orchestrator.calculateState(cycleStep(active, position));
    const states = active.orchestrator.getCurrentPropStates();
    active.animState.setPropStates(states.left, states.right);
  });

  const frame = $derived.by(() => {
    const active = playback;
    if (!active) return null;
    const stepCount = active.sequence.steps?.length ?? 0;
    const step = cycleStep(active, currentStep);
    const index = resolveCycleBeatIndex(step, stepCount);
    // Start slot: show the pose the rail's Start cell shows. A sequence without
    // a stored start position keeps the previous fallback (beat 1's pictograph)
    // rather than blanking the stage.
    const stepData =
      index === null
        ? (active.sequence.startPosition ?? active.sequence.steps?.[0] ?? null)
        : (active.sequence.steps?.[index] ?? null);
    return { step, stepData };
  });

  let readyFired = false;
  $effect(() => {
    if (playback && frame && !readyFired) {
      readyFired = true;
      onReady?.();
    }
  });

  // A repeating word always displays in its smallest form — FΨ, never FΨFΨFΨFΨ.
  const displayWord = $derived.by(() => {
    const raw = playback?.sequence.word || playback?.sequence.name || "";
    return raw ? simplifyRepeatedWord(raw) : null;
  });

  // Mirrors AnimatorCanvas's own header computation (difficulty, LOOP badge,
  // active-letter underline) — the header moved out of the animator so it can
  // span the full card width, but it must show exactly what the animator's
  // would have.
  const headerDifficulty = $derived.by(() => {
    const steps = playback?.sequence.steps;
    return steps?.length ? calculateDifficultyLevel([...steps]) : null;
  });

  const EMPTY_LOOP_DISPLAY = {
    components: new Set(),
    rotationPeriod: undefined,
    inversionPeriod: undefined,
    reflectionAxis: undefined,
    overlayComponents: undefined,
    period: 1,
  } as unknown as LoopDisplay;

  const headerLoop = $derived.by(() => {
    const seq = playback?.sequence;
    if (!seq) return EMPTY_LOOP_DISPLAY;
    const resolver = tryGetLoopDisplayResolver();
    return resolver ? resolver(seq) : EMPTY_LOOP_DISPLAY;
  });

  const headerActiveStepNumber = $derived.by(() => {
    const stepCount = playback?.sequence.steps?.length ?? 0;
    if (!stepCount || !frame) return null;
    const n = Math.floor(frame.step);
    return n >= 1 && n <= stepCount ? n : null;
  });

  /**
   * The engine only builds the mandala overlay canvas on a *change* in the
   * mandala flag (playback-sync.ts:404). Switching it on after the canvas
   * reports ready guarantees that change actually fires.
   */
  function enableMandala() {
    visibility.setVisibility("mandala", true);
  }

  onDestroy(() => {
    loadToken++;
    teardown();
  });
</script>

<!-- |global on both transitions: the card unmounts this whole component to stop
     the preview, and a local transition would be skipped by that ancestor
     teardown — the animation would vanish instantly instead of settling back
     into the card. -->
{#if playback && frame}
  <div
    class="preview-layer"
    style:--sheet-header-frac={headerFrac}
    transition:popIn|global={{
      duration: instant ? 0 : DURATION.emphasis,
      start: 0.94,
    }}
    aria-hidden="true"
  >
    <!-- The header is NOT part of the swap. It renders full-width at the top,
         sized to exactly the baked sheet's header band, so toggling between
         card and preview leaves the word/badges in the same place — the same
         header, whichever mode the card is in. The animator's own header is
         hidden (hideHeader) so it can't render a second, narrower copy inside
         the square stage. -->
    <div class="header-band">
      <WordHeader
        word={displayWord}
        darkMode={true}
        activeStepNumber={headerActiveStepNumber}
        difficultyLevel={headerDifficulty}
        loopComponents={headerLoop.components.size > 0
          ? headerLoop.components
          : null}
        rotationPeriod={headerLoop.rotationPeriod}
        inversionPeriod={headerLoop.inversionPeriod}
        reflectionAxis={headerLoop.reflectionAxis}
        overlayComponents={headerLoop.overlayComponents}
      />
    </div>

    <div
      class="preview-body"
      class:rail-right={railRight}
      bind:clientWidth={boxWidth}
      bind:clientHeight={boxHeight}
    >
      <div class="stage">
        <AnimatorCanvas
          leftProp={playback.animState.leftPropState}
          rightProp={playback.animState.rightPropState}
          sequenceData={playback.sequence}
          gridVisible={true}
          gridMode={playback.sequence.gridMode ?? null}
          letter={frame.stepData?.letter ?? null}
          stepData={frame.stepData}
          currentStep={frame.step}
          isPlaying={true}
          word={displayWord}
          hideHeader={true}
          fillContainer={true}
          previewDarkMode={true}
          hideTkaGlyph={true}
          hideStepNumbers={true}
          hideProgressBar={true}
          disableContextMenu={true}
          visibilityManagerOverride={visibility}
          onInitialized={enableMandala}
        />
      </div>

      <!-- The rail arrives a beat after the animator so the two read as one
           thing settling into place rather than two panels appearing at once. -->
      <div
        class="rail"
        transition:flyFade|global={{
          duration: instant ? 0 : DURATION.emphasis,
          delay: instant ? 0 : STAGGER.relaxed,
          x: railRight ? SLIDE.md : 0,
          y: railRight ? 0 : SLIDE.md,
        }}
      >
        <!-- The rail keeps its Start cell (the card morph pairs against it) and
             loops, so the carousel always travels forward across the boundary
             instead of cutting back to beat 1. When the sequence performs the
             start hold the wrap is one ordinary stride; when it does not — a
             seamlessly loopable sequence, whose cadence must not gain a beat —
             the same forward slide carries the Start cell through the focus in
             one step, marking the seam without costing playback time. -->
        {#await import("$lib/shared/timeline/StepStrip.svelte") then mod}
          <mod.default
            sequence={playback.sequence}
            currentStep={frame.step}
            bpm={BPM}
            density={railRight ? "compact" : "standard"}
            fillHeight={true}
            anchor="center"
            orientation={railRight ? "vertical" : "horizontal"}
            includeStartPosition={true}
            loop={true}
            stepPulse={false}
          />
        {/await}
      </div>
    </div>
  </div>
{/if}

<style>
  .preview-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
    /* The card owns the click. Let taps fall through to it. */
    pointer-events: none;
    /* Deliberately NOT --theme-panel-bg: that token is translucent, and the
       static thumbnail ghosting through at 25% doubles the word and muddies
       the mandala. The preview runs previewDarkMode, so this is its floor. */
    background: #08080f;

    display: flex;
    flex-direction: column;
  }

  /* Pinned to the baked sheet's header geometry: same top edge, same full
     width, same height fraction — so the word never moves across the toggle.
     A floor keeps it usable on very tall cards where the baked band is thin. */
  .header-band {
    flex: 0 0 auto;
    height: max(calc(var(--sheet-header-frac, 0.1) * 100%), 28px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    view-transition-name: card-morph-header;
  }

  .preview-body {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;

    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .preview-body.rail-right {
    flex-direction: row;
  }

  /* The animation is square — a fixed-size rail either starves it or wastes the
     leftover. So the stage claims its square off the SHORT axis and the rail
     takes everything left over on the long one. Whichever way the card leans,
     both halves are as big as the box allows. */
  .stage {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
    position: relative;
    aspect-ratio: 1;
  }

  .preview-body:not(.rail-right) .stage {
    width: 100%;
  }

  .preview-body.rail-right .stage {
    height: 100%;
  }

  /* ── Morph pairing ──────────────────────────────────────────────────
     These names match the sprite-crops SheetMorphOverlay paints over the
     static thumbnail during the play/stop view transition: the card's grid
     region grows into the stage (the mandala "expands forward"), the baked
     word header becomes the animator's, and the start cell plus the first
     step cells fly into the rail. Only one preview layer exists app-wide and
     the overlay mounts only on the toggling card, so the static names stay
     unique document-wide.

     The looping rail renders repeated copies of a cell (that is what makes the
     wrap seamless) and a document may carry each view-transition-name only
     once — so these pair against the focus's own repeat, which StepStrip marks
     data-cell-instance="primary". */
  .stage {
    view-transition-name: card-morph-stage;
  }

  .rail
    :global(.step-cell[data-cell-instance="primary"][data-step-number="0"]) {
    view-transition-name: card-morph-cell-0;
  }
  .rail
    :global(.step-cell[data-cell-instance="primary"][data-step-number="1"]) {
    view-transition-name: card-morph-cell-1;
  }
  .rail
    :global(.step-cell[data-cell-instance="primary"][data-step-number="2"]) {
    view-transition-name: card-morph-cell-2;
  }
  .rail
    :global(.step-cell[data-cell-instance="primary"][data-step-number="3"]) {
    view-transition-name: card-morph-cell-3;
  }
  .rail
    :global(.step-cell[data-cell-instance="primary"][data-step-number="4"]) {
    view-transition-name: card-morph-cell-4;
  }

  .rail {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Floors keep a cell legible on a nearly-square card; ceilings stop a very
     long card from handing the rail more room than the animation. The floor
     must fit StepStrip's FOCUSED cell — 64px minimum cell × 1.32 hero scale
     + frame + headroom ≈ 114px — or the gold frame clips top and bottom.
     (The strip viewport is overflow:hidden; a shorter band crops it.) */
  .preview-body:not(.rail-right) .rail {
    min-height: 7.25rem;
    max-height: 45cqh;
  }

  /* A vertical rail is sized by the cells it can stack, which is a function of
     its HEIGHT — hand it more width than that and the surplus is dead margin
     the animation could have used. In row mode the stage is HEIGHT-limited, so
     chip clearance must NOT be body padding (it collapsed the square stage on
     short cards) — only the rail pads its bottom, clearing the variation pill
     in the corner beneath it. */
  .preview-body.rail-right .rail {
    min-width: 60px;
    max-width: 34cqh;
    align-self: stretch;
    /* StepStrip's virtual window deliberately runs cells past the rail box, so
       no box geometry (padding/margin) keeps them off the variation pill in
       the corner below. Fade them out instead: cells dissolve before reaching
       the chip zone, and no-repeat hides anything past either end. */
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black 10%,
      black calc(100% - var(--min-touch-target, 44px) - 20px),
      transparent calc(100% - var(--min-touch-target, 44px) + 8px)
    );
    mask-repeat: no-repeat;
  }
</style>

<!--
SegmentedSequenceProgressBar.svelte

Duration-aware segmented progress indicator for animation sequences.
Each beat is a visual segment proportional to its duration.
Interactive: click/drag to scrub through the sequence.

Design variants supported:
- minimal: Flat segments with subtle borders
- raised: 3D appearance with shadows
- rounded: Pill-shaped segments with gaps
- neon: Glowing segments with bright colors
- gradient: Smooth gradient fills
- labeled: Shows beat numbers/letters
-->
<script lang="ts">
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { safeSlide } from "#lib/shared/utils/transitions.js";
  import { cubicOut } from "svelte/easing";

  let {
    steps = [],
    currentStep = 0,
    visible = true,
    darkMode = false,
    onSeek = null,
    onScrubStart = null,
    onScrubEnd = null,
    variant = "minimal",
    showLabels = false,
  }: {
    /** Array of step data (for durations and labels) */
    steps?: readonly StepData[];
    /** Current position in sequence (float, e.g., 2.5 = beat 3, 50% through) */
    currentStep?: number;
    /** Whether the progress bar should be visible */
    visible?: boolean;
    /** Dark mode override */
    darkMode?: boolean;
    /** Callback when user clicks/drags to seek */
    onSeek?: ((targetStep: number) => void) | null;
    /** Fires when the user grabs the scrubber (pointerdown on the bar) */
    onScrubStart?: (() => void) | null;
    /** Fires when the user releases the scrubber (pointerup/cancel) */
    onScrubEnd?: (() => void) | null;
    /** Visual style variant */
    variant?: "minimal" | "raised" | "rounded" | "neon" | "gradient" | "labeled" | "gradient-labeled";
    /** Show beat numbers above segments */
    showLabels?: boolean;
  } = $props();

  /**
   * Segment data with calculated widths
   */
  interface Segment {
    index: number;
    duration: number;
    widthPercent: number;
    cumulativeStart: number; // Where this segment starts in total duration
    label: string;
  }

  /**
   * Calculate segment data from steps
   */
  const segments = $derived.by((): Segment[] => {
    if (steps.length === 0) return [];

    const totalDuration = steps.reduce((sum, step) => sum + (step.duration ?? 1), 0);
    let cumulativeStart = 0;

    return steps.map((step, index) => {
      const duration = step.duration ?? 1;
      const widthPercent = (duration / totalDuration) * 100;
      const segment: Segment = {
        index,
        duration,
        widthPercent,
        cumulativeStart,
        label: step.letter?.toString() ?? `${index + 1}`,
      };
      cumulativeStart += duration;
      return segment;
    });
  });

  /**
   * Current segment index (which beat we're on)
   */
  const currentSegmentIndex = $derived(
    currentStep < 1 ? -1 : Math.floor(currentStep - 1)
  );

  /**
   * Total duration across all steps (for progress calculation)
   */
  const totalDuration = $derived(
    steps.reduce((sum, step) => sum + (step.duration ?? 1), 0)
  );

  /**
   * Overall progress as percentage (0-100) across entire bar
   * This moves at CONSTANT VISUAL SPEED by tracking cumulative duration
   *
   * IMPORTANT: currentStep is 1-based (1.0 = beat 1 starting, 2.0 = beat 2 starting)
   * - currentStep = 0: at start position, before any animation (0% progress)
   * - currentStep = 1.0: beat 1 just starting (0% progress)
   * - currentStep = 1.5: beat 1 halfway through
   * - currentStep = 2.0: beat 2 just starting
   *
   * Progress is calculated based on cumulative duration, not step count,
   * so the fill moves at constant visual speed across duration-aware segments.
   */
  const overallProgressPercent = $derived.by(() => {
    if (steps.length === 0 || totalDuration === 0) return 0;

    // Convert 1-based beat to 0-based
    // currentStep 0.0-0.99 = start position hold (no progress yet)
    const zeroBasedProgress = currentStep < 1 ? 0 : currentStep - 1;

    // Determine which step we're in and how far through it
    const currentStepIndex = Math.floor(zeroBasedProgress);
    const progressWithinStep = zeroBasedProgress - currentStepIndex;

    // Sum durations of all completed steps
    let completedDuration = 0;
    for (let i = 0; i < Math.min(currentStepIndex, steps.length); i++) {
      completedDuration += steps[i]?.duration ?? 1;
    }

    // Add partial duration of current step
    if (currentStepIndex < steps.length) {
      const currentStepDuration = steps[currentStepIndex]?.duration ?? 1;
      completedDuration += currentStepDuration * progressWithinStep;
    }

    // Clamp and convert to percentage
    const clampedDuration = Math.max(0, Math.min(totalDuration, completedDuration));
    return (clampedDuration / totalDuration) * 100;
  });

  /**
   * Calculate which beat was clicked based on mouse position
   */
  function calculateTargetStep(event: PointerEvent, container: HTMLElement): number {
    const rect = container.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickPercent = clickX / rect.width;

    // Find which segment was clicked
    let cumulativePercent = 0;
    for (const segment of segments) {
      const segmentEndPercent = cumulativePercent + segment.widthPercent / 100;
      if (clickPercent <= segmentEndPercent) {
        // Calculate position within this segment
        const progressInSegment =
          (clickPercent - cumulativePercent) / (segment.widthPercent / 100);
        // Return 1-based beat number (beat 1 = index 0)
        return segment.index + 1 + progressInSegment;
      }
      cumulativePercent = segmentEndPercent;
    }

    // Clicked past the end - return last beat
    return steps.length;
  }

  let containerRef: HTMLElement | undefined = $state();
  let isDragging = $state(false);

  function handlePointerDown(event: PointerEvent) {
    if (!containerRef || !onSeek) return;

    isDragging = true;
    containerRef.setPointerCapture(event.pointerId);
    onScrubStart?.();

    const targetStep = calculateTargetStep(event, containerRef);
    onSeek(targetStep);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging || !containerRef || !onSeek) return;

    const targetStep = calculateTargetStep(event, containerRef);
    onSeek(targetStep);
  }

  function handlePointerUp(event: PointerEvent) {
    if (!containerRef) return;

    if (isDragging) onScrubEnd?.();
    isDragging = false;
    containerRef.releasePointerCapture(event.pointerId);
  }

  /**
   * Keyboard navigation
   */
  function handleKeyDown(event: KeyboardEvent) {
    if (!onSeek) return;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        onSeek(Math.max(0, currentStep - 0.5));
        break;
      case "ArrowRight":
        event.preventDefault();
        onSeek(Math.min(steps.length, currentStep + 0.5));
        break;
      case "Home":
        event.preventDefault();
        onSeek(0);
        break;
      case "End":
        event.preventDefault();
        onSeek(steps.length);
        break;
    }
  }

  /**
   * ARIA label for screen readers
   * currentStep is 1-based: 1.5 means beat 1, halfway through
   */
  const ariaLabel = $derived.by(() => {
    if (steps.length === 0) return "Sequence progress: no sequence loaded";
    // currentStep is 1-based, so Math.floor gives the current beat number
    const currentBeat = currentStep <= 0 ? 0 : Math.floor(currentStep);
    // Use the same 0-based progress calculation as overallProgressPercent
    const progress = Math.round(overallProgressPercent);
    return `Sequence progress: beat ${currentBeat} of ${steps.length}, ${progress}% complete`;
  });
</script>

{#if visible && steps.length > 0}
  <div
    class="segmented-progress-container"
    class:dark-mode={darkMode}
    class:interactive={onSeek !== null}
    class:dragging={isDragging}
    data-variant={variant}
    role="slider"
    aria-label={ariaLabel}
    aria-valuenow={Math.round(overallProgressPercent)}
    aria-valuemin={0}
    aria-valuemax={100}
    tabindex={onSeek ? 0 : -1}
    bind:this={containerRef}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onkeydown={handleKeyDown}
    transition:safeSlide={{ duration: 300, easing: cubicOut }}
  >
    {#if showLabels}
      <div class="labels-row">
        {#each segments as segment}
          <div
            class="label"
            class:active={segment.index === currentSegmentIndex}
            style="width: {segment.widthPercent}%"
          >
            {segment.label}
          </div>
        {/each}
      </div>
    {/if}

    <div class="segments-track">
      <!-- Segment dividers (always visible, proportional widths show duration) -->
      <div class="segments-background">
        {#each segments as segment}
          <div class="segment segment-divider" style="width: {segment.widthPercent}%"></div>
        {/each}
      </div>

      <!-- Continuous progress fill (moves at constant visual speed) -->
      <div class="progress-fill" style="width: {overallProgressPercent}%"></div>
    </div>
  </div>
{/if}

<style>
  /* Container */
  .segmented-progress-container {
    width: 100%;
    padding: clamp(6px, 3cqw, 12px) 0;
    box-sizing: border-box;
    background: var(--theme-panel-bg, rgba(240, 240, 240, 0.98));
    transition: background 150ms ease-out;
  }

  .segmented-progress-container.dark-mode {
    background: var(--theme-panel-bg, rgba(15, 15, 20, 0.98));
  }

  .segmented-progress-container.interactive {
    cursor: pointer;
  }

  .segmented-progress-container.dragging {
    cursor: grabbing;
  }

  .segmented-progress-container:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Labels row */
  .labels-row {
    display: flex;
    width: 100%;
    margin-bottom: 4px;
    font-size: clamp(9px, 2cqw, 11px);
    font-weight: 600;
  }

  .label {
    text-align: center;
    color: var(--theme-text-dim, rgba(0, 0, 0, 0.4));
    transition: color 0.2s ease;
  }

  .dark-mode .label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .label.active {
    color: var(--theme-text, rgba(0, 0, 0, 0.8));
  }

  .dark-mode .label.active {
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  /* Segments track container */
  .segments-track {
    position: relative;
    width: 100%;
    height: 8px;
    background: var(--theme-stroke, rgba(0, 0, 0, 0.08));
  }

  .dark-mode .segments-track {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  /* Segment dividers - tick marks that show duration boundaries */
  .segments-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    gap: 0;
    pointer-events: none;
    z-index: 2; /* Above progress fill */
  }

  .segment {
    height: 100%;
  }

  .segment-divider {
    border-right: 2px solid rgba(0, 0, 0, 0.35);
  }

  .segment-divider:last-child {
    border-right: none;
  }

  .dark-mode .segment-divider {
    border-right: 2px solid rgba(255, 255, 255, 0.45);
  }

  /* Continuous progress fill (moves smoothly left to right) */
  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--theme-accent-light, var(--theme-accent)) 50%, var(--theme-accent) 100%);
    transition: background 150ms ease-out;
    z-index: 1; /* Below white dividers, above track */
  }

  .dark-mode .progress-fill {
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--theme-accent-light, var(--theme-accent)) 50%, var(--theme-accent) 100%);
  }

  /* ========================================
     VARIANT: MINIMAL (default)
     ======================================== */
  /* Borders are now default - no variant-specific overrides needed */

  /* ========================================
     VARIANT: RAISED (3D with shadows)
     ======================================== */
  [data-variant="raised"] .segments-track {
    height: 8px;
  }

  [data-variant="raised"] .segment {
    border-right: 1px solid var(--theme-stroke, rgba(0, 0, 0, 0.2));
  }

  .dark-mode[data-variant="raised"] .segment {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
  }

  /* ========================================
     VARIANT: ROUNDED (pill-shaped with gaps)
     ======================================== */
  [data-variant="rounded"] .segments-track {
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
  }

  [data-variant="rounded"] .segments-background {
    gap: 3px;
  }

  [data-variant="rounded"] .progress-fill {
    border-radius: 999px;
  }

  /* ========================================
     VARIANT: NEON (glowing progress)
     ======================================== */
  [data-variant="neon"] .segments-track {
    height: 5px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-radius: 2px;
  }

  .dark-mode[data-variant="neon"] .segments-track {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  [data-variant="neon"] .segments-background {
    gap: 2px;
  }

  [data-variant="neon"] .progress-fill {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--theme-accent) 80%, transparent),
      0 0 12px color-mix(in srgb, var(--theme-accent) 40%, transparent);
    animation: neonPulse 1s ease-in-out infinite;
  }

  .dark-mode[data-variant="neon"] .progress-fill {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--theme-accent) 80%, transparent),
      0 0 16px color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  @keyframes neonPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.85;
    }
  }

  /* ========================================
     VARIANT: GRADIENT (colorful gradient fill)
     ======================================== */
  [data-variant="gradient"] .progress-fill {
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--prop-blue, var(--theme-accent)) 50%, var(--theme-accent) 100%);
  }

  .dark-mode[data-variant="gradient"] .progress-fill {
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--theme-accent-light, var(--theme-accent)) 50%, var(--theme-accent) 100%);
  }

  /* ========================================
     VARIANT: LABELED (with beat markers and clear dividers)
     ======================================== */
  [data-variant="labeled"] .segments-track {
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  [data-variant="labeled"] .segment {
    border-right: 2px solid var(--theme-stroke-strong, rgba(0, 0, 0, 0.5));
    position: relative;
  }

  .dark-mode[data-variant="labeled"] .segment {
    border-right: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
  }

  /* Make segment dividers visible even over progress fill */
  [data-variant="labeled"] .segments-background::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: inherit;
    pointer-events: none;
    z-index: 2;
  }

  /* ========================================
     VARIANT: GRADIENT-LABELED (gradient + labels + dividers)
     ======================================== */
  [data-variant="gradient-labeled"] .segments-track {
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  [data-variant="gradient-labeled"] .segment {
    border-right: 2px solid var(--theme-stroke-strong, rgba(0, 0, 0, 0.5));
    position: relative;
  }

  .dark-mode[data-variant="gradient-labeled"] .segment {
    border-right: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
  }

  [data-variant="gradient-labeled"] .progress-fill {
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--prop-blue, var(--theme-accent)) 50%, var(--theme-accent) 100%);
  }

  .dark-mode[data-variant="gradient-labeled"] .progress-fill {
    background: linear-gradient(90deg, var(--theme-accent) 0%, var(--theme-accent-light, var(--theme-accent)) 50%, var(--theme-accent) 100%);
  }

  /* Make segment dividers visible over gradient */
  [data-variant="gradient-labeled"] .segments-background::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: inherit;
    pointer-events: none;
    z-index: 2;
  }

  /* Accessibility: respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .segment,
    .progress-fill,
    .label,
    .segmented-progress-container {
      transition: none;
      animation: none;
    }
  }
</style>

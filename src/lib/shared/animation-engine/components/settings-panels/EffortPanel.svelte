<script module lang="ts">
  import {
    EFFORTS,
    type EffortId,
  } from "$lib/shared/effort/domain/effort-types";
  import { sampleEffortCurve } from "$lib/shared/effort/domain/effort-easing-unified";

  // Each effort's timing curve: time through the beat across, how far the
  // move has got up. Steep is fast, flat is slow. All eight share one
  // vertical scale, so Elastic's overshoot and Anticipation's wind-up read
  // against the same start and end lines as the curves that stay between
  // them. Drawn once from the same easing the animation runs.
  const CURVE_WIDTH = 100;
  const CURVE_HEIGHT = 60;
  const curveSamples = EFFORTS.map((effort) =>
    sampleEffortCurve(effort.id, 64)
  );
  const sampledValues = curveSamples.flat().map((sample) => sample.value);
  const lowest = Math.min(0, ...sampledValues);
  const highest = Math.max(1, ...sampledValues);
  const margin = (highest - lowest) * 0.08;
  const curveY = (value: number) =>
    ((highest + margin - value) / (highest - lowest + 2 * margin)) *
    CURVE_HEIGHT;
  const START_Y = curveY(0);
  const END_Y = curveY(1);
  const CURVE_PATHS = new Map(
    EFFORTS.map((effort, index) => [
      effort.id,
      curveSamples[index]
        .map(
          (sample, step) =>
            `${step ? "L" : "M"}${(sample.t * CURVE_WIDTH).toFixed(1)} ${curveY(sample.value).toFixed(1)}`
        )
        .join(" "),
    ])
  );
</script>

<script lang="ts">
  import { onDestroy } from "svelte";
  import { getAnimationVisibilityManager } from "../../state/animation-visibility-state.svelte";
  import { getAnimationVisibilityContext } from "../../state/animation-visibility-context";

  let {
    columns = 4,
    showSubtitles = false,
    fill = false,
    onSettingChange,
  }: {
    columns?: 2 | 4;
    showSubtitles?: boolean;
    /** The host hands the grid a definite height (the motion-path studio's
     *  card, sized to its canvas). The rows share it and each tile spends
     *  the room past its label on its timing curve, so the page is pictures
     *  like Display's and Props' instead of eight labels over an empty card. */
    fill?: boolean;
    onSettingChange?: (previousValue: string, value: string) => void;
  } = $props();

  const vm = getAnimationVisibilityContext() ?? getAnimationVisibilityManager();

  let effortPreset = $state(vm.getEffortPreset());

  function handleVisibilityChange(): void {
    effortPreset = vm.getEffortPreset();
  }

  function selectEffort(id: EffortId): void {
    const previous = effortPreset;
    vm.setEffortPreset(id);
    onSettingChange?.(previous, id);
  }

  vm.registerObserver(handleVisibilityChange);
  onDestroy(() => vm.unregisterObserver(handleVisibilityChange));
</script>

<div class="effort-grid" class:fill style:--effort-cols={columns}>
  {#each EFFORTS as effort}
    <button
      class="effort-btn"
      class:active={effortPreset === effort.id}
      class:with-sub={showSubtitles}
      type="button"
      aria-pressed={effortPreset === effort.id}
      onclick={() => selectEffort(effort.id)}
      style:--effort-color={effort.color}
    >
      {#if fill}
        <svg
          class="effort-curve"
          viewBox="0 0 {CURVE_WIDTH} {CURVE_HEIGHT}"
          aria-hidden="true"
        >
          <line
            class="curve-guide"
            x1="0"
            x2={CURVE_WIDTH}
            y1={START_Y}
            y2={START_Y}
          />
          <line
            class="curve-guide"
            x1="0"
            x2={CURVE_WIDTH}
            y1={END_Y}
            y2={END_Y}
          />
          <path class="curve-line" d={CURVE_PATHS.get(effort.id)} />
        </svg>
      {/if}
      <span class="effort-label">{effort.label}</span>
      {#if showSubtitles && effort.subtitle}
        <span class="effort-sub">{effort.subtitle}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .effort-grid {
    display: grid;
    grid-template-columns: repeat(var(--effort-cols, 4), 1fr);
    gap: 6px;
  }

  .effort-btn {
    min-height: 56px;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }

  .effort-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .effort-btn.active {
    background: color-mix(in srgb, var(--effort-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--effort-color) 50%, transparent);
    color: var(--theme-text, white);
  }

  .effort-btn.with-sub {
    padding: 14px 8px;
    gap: 4px;
  }

  .effort-label {
    font-weight: inherit;
  }

  .effort-sub {
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1;
  }

  .effort-btn.active .effort-sub {
    color: rgba(255, 255, 255, 0.75);
  }

  /* The rows share the height the host gives. A tile's label keeps its own
     height and the curve takes the rest; a box too short for curves still
     keeps every label whole and scrolls. */
  .effort-grid.fill {
    flex: 1 1 0;
    min-height: 0;
    grid-auto-rows: 1fr;
  }

  .effort-grid.fill .effort-btn {
    justify-content: flex-end;
    gap: 6px;
  }

  .effort-curve {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    overflow: visible;
  }

  .curve-guide {
    stroke: currentColor;
    stroke-width: 1;
    opacity: 0.16;
    vector-effect: non-scaling-stroke;
  }

  .curve-line {
    fill: none;
    stroke: var(--effort-color);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.5;
    vector-effect: non-scaling-stroke;
    transition: opacity var(--duration-fast, 100ms) ease;
  }

  .effort-btn:hover .curve-line {
    opacity: 0.8;
  }

  .effort-btn.active .curve-line {
    stroke-width: 2.5;
    opacity: 1;
  }

  .effort-btn:focus-visible {
    outline: 2px solid var(--effort-color, #94a3b8);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .effort-btn,
    .curve-line {
      transition: none;
    }
  }
</style>

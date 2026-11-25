<script module lang="ts">
  import {
    EFFORTS,
    type EffortId,
  } from "#lib/shared/effort/domain/effort-types.js";
  import {
    localizedEffortLabel,
    localizedEffortSubtitle,
  } from "#lib/shared/effort/domain/effort-label.js";
  import { sampleEffortCurve } from "#lib/shared/effort/domain/effort-easing-unified.js";

  // Each effort's timing curve: time through the beat across, how far the
  // move has got up. Steep is fast, flat is slow. All eight share one
  // vertical scale, so Elastic's overshoot and Anticipation's wind-up read
  // against the same start and end lines as the curves that stay between
  // them. Drawn once from the same easing the animation runs.
  const CURVE_WIDTH = 100;
  const CURVE_HEIGHT = 60;
  const curveSamples = EFFORTS.map((effort) => ({
    id: effort.id,
    samples: sampleEffortCurve(effort.id, 64),
  }));
  const sampledValues = curveSamples.flatMap(({ samples }) =>
    samples.map((sample) => sample.value)
  );
  const lowest = Math.min(0, ...sampledValues);
  const highest = Math.max(1, ...sampledValues);
  const margin = (highest - lowest) * 0.08;
  const curveY = (value: number) =>
    ((highest + margin - value) / (highest - lowest + 2 * margin)) *
    CURVE_HEIGHT;
  const START_Y = curveY(0);
  const END_Y = curveY(1);
  const CURVE_PATHS = new Map(
    curveSamples.map(({ id, samples }) => [
      id,
      samples
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
  import { getAnimationVisibilityManager } from "../../state/animation-visibility-state.svelte.js";
  import type { AnimationVisibilityStateManager } from "../../state/animation-visibility-state.svelte.js";
  import { getAnimationVisibilityContext } from "../../state/animation-visibility-context";

  let {
    columns = 4,
    showSubtitles = false,
    fill = false,
    fit = false,
    room = false,
    dock = false,
    share = false,
    onSettingChange,
    visibilityManagerOverride,
  }: {
    columns?: 2 | 4;
    showSubtitles?: boolean;
    /** Use responsive curve cards in a settings page. Docks keep compact tiles. */
    fill?: boolean;
    /** Fit a bounded inspector; retain readable controls if its drawer scrolls. */
    fit?: boolean;
    /** The host's box is all there is: the tiles share it and nothing scrolls. */
    room?: boolean;
    /** A phone's bottom dock: four across two rows that share the body's
     *  height, each row capped at 120px, and nothing scrolls. */
    dock?: boolean;
    /** The page is this panel's alone (the Shape Engine's Customize
     *  workspace, pages as tabs): the eight tiles share the whole box, two
     *  across four rows (four across two in a wide box), names at reading
     *  size and every word of a description shown. */
    share?: boolean;
    onSettingChange?: (previousValue: string, value: string) => void;
    visibilityManagerOverride?: AnimationVisibilityStateManager;
  } = $props();

  const vm =
    visibilityManagerOverride ??
    getAnimationVisibilityContext() ??
    getAnimationVisibilityManager();

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

<div
  class="effort-panel"
  class:fill
  class:fit
  class:room
  class:dock
  class:share
>
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
        <svg
          class="effort-curve"
          viewBox="0 0 {CURVE_WIDTH} {CURVE_HEIGHT}"
          preserveAspectRatio="xMidYMid meet"
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
        <span class="effort-label">{localizedEffortLabel(effort.id)}</span>
        {#if showSubtitles && effort.subtitle}
          <span class="effort-sub">{localizedEffortSubtitle(effort.id)}</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .effort-panel.fit {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .fit .effort-grid {
    flex: 1;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(88px, 1fr);
    max-height: 328px;
    align-content: start;
    gap: 8px;
  }
  .fit .effort-btn {
    font-size: var(--font-size-min, 14px);
  }
  .fit .effort-curve {
    flex: 1 1 0;
    height: 0;
    aspect-ratio: auto;
    max-height: 120px;
    min-height: 28px;
  }
  @container effort-panel (width < 440px) {
    .fit .effort-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      max-height: 664px;
    }
  }
  @container effort-panel (width < 216px) {
    .fit .effort-grid {
      grid-template-columns: minmax(0, 1fr);
      max-height: 1336px;
    }
  }
  .effort-panel {
    container: effort-panel / inline-size;
    min-width: 0;
  }

  /* Eight tiles in the box's own shape: four across two rows when it is wide,
     two across four when it is tall. The curve takes what the name leaves, and
     the description appears only once a tile has room to spare for it. */
  .effort-panel.room {
    container: effort-panel / size;
    flex: 1 1 0;
    min-height: 0;
    height: 100%;
  }
  .room .effort-grid {
    height: 100%;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .room .effort-btn,
  .room .effort-btn.with-sub {
    min-height: 0;
    padding: 4px;
    gap: 2px;
    overflow: hidden;
  }
  .room .effort-curve {
    flex: 1 1 0;
    height: 0;
    min-height: 0;
  }
  .room .effort-label {
    flex: none;
  }
  .room .effort-sub {
    display: none;
    flex: none;
    text-align: center;
  }
  @container effort-panel (orientation: portrait) {
    .room .effort-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(4, minmax(0, 1fr));
    }
  }
  @container effort-panel (min-width: 34rem) and (min-height: 22rem) {
    .room .effort-sub {
      display: block;
    }
  }

  /* Shared: the rows divide the box, the curve takes what the words leave. */
  .effort-panel.share {
    container: effort-panel / size;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .share .effort-grid {
    flex: 1 1 0;
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .share .effort-btn,
  .share .effort-btn.with-sub {
    min-height: 0;
    padding: 10px;
    gap: 4px;
    font-size: var(--font-size-min, 14px);
  }
  .share .effort-curve {
    flex: 1 1 0;
    height: 0;
    min-height: 0;
  }
  .share .effort-label,
  .share .effort-sub {
    flex: none;
    max-width: 100%;
    text-align: center;
  }
  .share .effort-sub {
    line-height: 1.3;
  }
  @container effort-panel (orientation: landscape) {
    .share .effort-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
  }

  /* Phone dock, about 336 x 200-295px. Two rows of four share the height
     (about 98px at a 215px body, 113px at 245, capped at 120 and centred
     above that), so the curve gets everything the name leaves. A tile is
     66-74px inside; "Anticipation" at 12px needs 68px, so a name runs through
     the tile's own 2px padding before it breaks onto a second line. The portrait
     flip of `.room` is left out: the dock is always wider than tall. */
  .effort-panel.dock {
    container: effort-panel / size;
    display: flex;
    flex: 1 1 0;
    min-height: 0;
  }
  .dock .effort-grid {
    flex: 1 1 0;
    min-height: 0;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 120px));
    align-content: center;
    gap: 4px;
  }
  /* A dock beside the player is as tall as it is (a tablet), not the strip
     under it: two wide tiles a row share that height. */
  @container effort-panel (min-height: 22rem) {
    .dock .effort-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-rows: minmax(0, 1fr);
    }
  }
  .dock .effort-btn {
    min-height: 0;
    padding: 4px 2px;
    gap: 2px;
    overflow: hidden;
    font-size: var(--font-size-compact, 12px);
  }
  .dock .effort-curve {
    flex: 1 1 0;
    height: 0;
    min-height: 0;
  }
  .dock .effort-label {
    flex: none;
    max-width: calc(100% + 4px);
    margin-inline: -2px;
    line-height: 1.1;
    text-align: center;
    hyphens: auto;
    overflow-wrap: anywhere;
  }
  /* At this size the 50% border read as one more outline among eight; the
     chosen tile takes its full colour so it stands apart at a glance. */
  .dock .effort-btn.active {
    border-color: var(--effort-color);
  }

  .effort-grid {
    display: grid;
    grid-template-columns: repeat(var(--effort-cols, 4), 1fr);
    gap: 6px;
  }

  .effort-btn {
    min-height: 80px;
    min-width: 0;
    padding: 8px 4px;
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
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      outline var(--duration-fast) var(--ease-standard);
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
    min-height: 96px;
    padding: 10px 6px;
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

  /* Plot proportions depend on width, never on spare panel height. */
  .effort-grid.fill {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
  }

  .effort-grid.fill .effort-btn {
    justify-content: center;
    padding: 12px;
    gap: 6px;
  }

  .effort-curve {
    flex: 0 0 auto;
    height: 28px;
    width: 100%;
    overflow: visible;
  }

  .effort-grid.fill .effort-curve {
    flex: 0 0 auto;
    height: auto;
    aspect-ratio: 5 / 3;
    max-height: 120px;
  }

  .effort-grid.fill .effort-sub {
    line-height: 1.35;
  }

  @container effort-panel (max-width: 26rem) {
    .effort-grid.fill {
      grid-template-columns: minmax(0, 1fr);
    }

    .effort-grid.fill .effort-btn {
      display: grid;
      grid-template-columns: minmax(60px, 2fr) minmax(0, 3fr);
      column-gap: 16px;
      row-gap: 2px;
      min-height: 80px;
      text-align: left;
    }

    .effort-grid.fill .effort-curve {
      grid-column: 1;
      grid-row: 1 / 3;
      max-height: 80px;
    }

    .effort-grid.fill .effort-label {
      grid-column: 2;
      grid-row: 1 / 3;
    }

    .effort-grid.fill .with-sub .effort-label {
      grid-row: 1;
      align-self: end;
    }

    .effort-grid.fill .effort-sub {
      grid-column: 2;
      grid-row: 2;
      align-self: start;
    }
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
    transition: opacity var(--duration-fast) var(--ease-standard);
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

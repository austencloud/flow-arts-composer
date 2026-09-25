<!--
GenerationStylePanel.svelte - shared 3-axis generation style control

Used by Generate and Fuse so both tools expose one style vocabulary and policy.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type {
    GenerationDashChoice,
    GenerationMotionTypeFilter,
    GenerationStyleAxis,
    GenerationStylePolicy,
  } from "$lib/shared/create/domain/generation-style";

  let {
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    baseline,
    haptic,
    onPropsChange,
    onHandsChange,
    onDashesChange,
  }: {
    constraintPreset: GenerationStyleAxis;
    handPathMode: GenerationStyleAxis;
    motionTypeFilter: GenerationMotionTypeFilter;
    /**
     * The untouched value of each axis, marked in the row so the baseline is
     * visible. Without it, Props defaulting to Smooth while Hands and Dashes
     * default to Mixed is invisible, and a summary reading "Props: Mixed" with
     * all three showing Mixed looks arbitrary.
     */
    baseline?: GenerationStylePolicy;
    haptic: HapticFeedback | null;
    onPropsChange: (v: GenerationStyleAxis) => void;
    onHandsChange: (v: GenerationStyleAxis) => void;
    onDashesChange: (v: GenerationDashChoice) => void;
  } = $props();

  const propsOptions = [
    { value: "smooth", label: "Smooth" },
    { value: "mixed", label: "Mixed" },
    { value: "choppy", label: "Choppy" },
  ] as const;

  const handsOptions = [
    { value: "smooth", label: "Smooth" },
    { value: "mixed", label: "Mixed" },
    { value: "choppy", label: "Choppy" },
  ] as const;

  const dashOptions = [
    { value: "no-dash", label: "Low" },
    { value: "mixed", label: "Mixed" },
    { value: "prefer-dash", label: "High" },
  ] as const;

  // What the selected value actually asks the builder for. Choppy pushes for a
  // reversal on every step, which is a narrow target — worth saying so, because
  // "the generator keeps giving me the same thing" is what it looks like from
  // the outside. Mirrors createConstraintSet in constraint-presets.ts.
  const REVERSAL_HINTS: Record<GenerationStyleAxis, string> = {
    smooth: "Reversals kept to a minimum.",
    mixed: "Reversals allowed where they fit.",
    choppy:
      "A reversal on every step — a narrow target, so results repeat more.",
  };

  const DASH_HINTS: Record<GenerationDashChoice, string> = {
    "no-dash": "Dashes avoided.",
    mixed: "Dashes allowed where they fit.",
    "prefer-dash": "Dashes favored.",
  };

  let currentDashValue = $derived.by(() => {
    if (motionTypeFilter === "no-dash") return "no-dash";
    if (motionTypeFilter === "prefer-dash") return "prefer-dash";
    return "mixed";
  });

  // Which option is the untouched one, per axis. null when no baseline was
  // given, which leaves the row rendering exactly as it did before.
  const defaultProps = $derived(baseline?.constraintPreset ?? null);
  const defaultHands = $derived(baseline?.handPathMode ?? null);
  const defaultDashes = $derived.by(() => {
    if (!baseline) return null;
    const f = baseline.motionTypeFilter;
    return f === "no-dash" || f === "prefer-dash" ? f : "mixed";
  });

  function handleProps(v: GenerationStyleAxis) {
    haptic?.trigger("selection");
    onPropsChange(v);
  }

  function handleHands(v: GenerationStyleAxis) {
    haptic?.trigger("selection");
    onHandsChange(v);
  }

  function handleDashes(v: GenerationDashChoice) {
    haptic?.trigger("selection");
    onDashesChange(v);
  }
</script>

<div class="style-panel">
  <div class="style-axis-group">
    <div class="style-axis">
      <span class="style-axis-label">{t("create_ui_props")}</span>
      <div class="style-axis-options">
        {#each propsOptions as opt}
          <button
            class="option-btn"
            class:selected={constraintPreset === opt.value}
            onclick={() => handleProps(opt.value)}
          >
            <span class="option-label">{opt.label}</span>
            {#if defaultProps === opt.value}<span class="option-default"
                >default</span
              >{/if}
          </button>
        {/each}
      </div>
    </div>
    <!-- Every variant is stacked in one grid cell so the hint box is always as
         tall as its longest line — switching options can't shove the axes
         below it around. -->
    <span class="style-hint">
      {#each propsOptions as opt}
        <span class="hint-layer" class:live={constraintPreset === opt.value}
          >{REVERSAL_HINTS[opt.value]}</span
        >
      {/each}
    </span>
  </div>

  <div class="style-axis-group">
    <div class="style-axis">
      <span class="style-axis-label">{t("create_ui_hands")}</span>
      <div class="style-axis-options">
        {#each handsOptions as opt}
          <button
            class="option-btn"
            class:selected={handPathMode === opt.value}
            onclick={() => handleHands(opt.value)}
          >
            <span class="option-label">{opt.label}</span>
            {#if defaultHands === opt.value}<span class="option-default"
                >default</span
              >{/if}
          </button>
        {/each}
      </div>
    </div>
    <span class="style-hint">
      {#each handsOptions as opt}
        <span class="hint-layer" class:live={handPathMode === opt.value}
          >{REVERSAL_HINTS[opt.value]}</span
        >
      {/each}
    </span>
  </div>

  <div class="style-axis-group">
    <div class="style-axis">
      <span class="style-axis-label">{t("create_ui_dashes")}</span>
      <div class="style-axis-options">
        {#each dashOptions as opt}
          <button
            class="option-btn"
            class:selected={currentDashValue === opt.value}
            onclick={() => handleDashes(opt.value)}
          >
            <span class="option-label">{opt.label}</span>
            {#if defaultDashes === opt.value}<span class="option-default"
                >default</span
              >{/if}
          </button>
        {/each}
      </div>
    </div>
    <span class="style-hint">
      {#each dashOptions as opt}
        <span class="hint-layer" class:live={currentDashValue === opt.value}
          >{DASH_HINTS[opt.value]}</span
        >
      {/each}
    </span>
  </div>
</div>

<style>
  .style-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    flex: 1;
    justify-content: center;
  }

  .style-axis-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .style-axis {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Ghost-sizer stack: all variants share one cell, so the box is sized to the
     tallest and only the live one is painted. */
  .style-hint {
    display: grid;
    padding-left: 64px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.5);
  }

  .hint-layer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .hint-layer.live {
    visibility: visible;
  }

  .style-axis-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 52px;
    flex-shrink: 0;
  }

  .style-axis-options {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  /* Two stacked lines: the value, and the "default" marker on whichever option
     is the untouched one. The marker's row is reserved on every button so
     nothing moves between the marked and unmarked options. */
  .option-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-height: 44px;
    background: rgba(0, 0, 0, 0.25);
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-weight: 600;
    font-size: var(--font-size-compact, 12px);
    padding: 4px 6px;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .option-btn:active {
    transform: scale(0.96);
  }

  .option-label {
    line-height: 1.2;
  }

  .option-default {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.45);
  }

  .option-btn.selected .option-default {
    color: rgba(255, 255, 255, 0.7);
  }

  .option-btn.selected {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.25));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    .option-btn {
      transition: none;
    }
  }
</style>

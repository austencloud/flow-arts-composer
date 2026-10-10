<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * StepProgress - Multi-step indicator showing pending/active/completed states.
   */

  interface StepDef {
    label: string;
    icon?: string;
  }

  interface Props {
    /** Step definitions. */
    steps: StepDef[];
    /** 1-based current step. 0 = none started. steps.length + 1 = all complete. */
    currentStep: number;
    /** Layout direction. Default "vertical". */
    orientation?: "horizontal" | "vertical";
    /** Accent color for active step. */
    color?: string;
  }

  let { steps, currentStep, orientation = "vertical", color }: Props = $props();

  function stepState(index: number): "completed" | "active" | "pending" {
    const stepNum = index + 1;
    if (stepNum < currentStep) return "completed";
    if (stepNum === currentStep) return "active";
    return "pending";
  }
</script>

<div
  class="step-progress"
  class:horizontal={orientation === "horizontal"}
  style:--step-color={color}
  role="status"
  aria-label={t("shared_controls_step_progress", {
    current: Math.min(currentStep, steps.length),
    total: steps.length,
  })}
>
  {#each steps as step, i}
    {@const state = stepState(i)}

    {#if i > 0}
      <div
        class="connector"
        class:completed={state === "completed" ||
          stepState(i - 1) === "completed"}
      ></div>
    {/if}

    <div
      class="step"
      class:completed={state === "completed"}
      class:active={state === "active"}
      class:pending={state === "pending"}
    >
      <div class="dot">
        {#if state === "completed"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 6L5 8.5L9.5 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        {:else if state === "active"}
          <div class="pulse-ring"></div>
        {:else}
          <span class="step-number">{i + 1}</span>
        {/if}
      </div>
      <span class="step-label">{step.label}</span>
    </div>
  {/each}
</div>

<style>
  .step-progress {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .step-progress.horizontal {
    flex-direction: row;
    align-items: center;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .horizontal .step {
    flex-direction: column;
    gap: 6px;
  }

  .dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    transition:
      background var(--duration-fast, 150ms) ease-out,
      border-color var(--duration-fast, 150ms) ease-out;
  }

  .completed .dot {
    background: var(--semantic-success, #22c55e);
    color: #fff;
  }

  .active .dot {
    background: var(--step-color, var(--theme-accent, #6366f1));
    color: #fff;
    position: relative;
  }

  .pending .dot {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* --- Pulse ring inside active dot --- */

  .pulse-ring {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fff;
    animation: step-pulse 1.5s ease-in-out infinite;
  }

  @keyframes step-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(0.7);
    }
  }

  .step-number {
    font-variant-numeric: tabular-nums;
  }

  .step-label {
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .completed .step-label {
    color: var(--semantic-success, #22c55e);
  }

  .active .step-label {
    color: var(--theme-text, #fff);
  }

  .pending .step-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .connector {
    width: 2px;
    height: 12px;
    margin-left: 11px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    transition: background var(--duration-fast, 150ms) ease-out;
  }

  .connector.completed {
    background: var(--semantic-success, #22c55e);
  }

  .horizontal .connector {
    width: 24px;
    height: 2px;
    margin-left: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring {
      animation: none;
    }

    .dot {
      transition: none;
    }

    .connector {
      transition: none;
    }
  }
</style>

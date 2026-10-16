<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ExperienceProgressIndicator from "./ExperienceProgressIndicator.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    createDestinationFade,
    createIntrinsicSizeMotion,
    type IntrinsicSizeMotion,
  } from "#lib/shared/transitions/motion.js";
  import { untrack } from "svelte";

  let {
    label,
    currentStep,
    totalSteps,
    onAction,
    onPrevious,
    previousLabel = t("learn_ui_previous"),
    previousDisabled = false,
    actionIcon = "arrow",
    curriculumLabel = undefined,
    actionDisabled = false,
    actionRef = $bindable(null),
    showProgress = true,
    progressAppearance = "dots",
  }: {
    label: string;
    currentStep: number;
    totalSteps: number;
    onAction: () => void;
    onPrevious?: () => void;
    previousLabel?: string;
    previousDisabled?: boolean;
    actionIcon?: "arrow" | "check";
    curriculumLabel?: string;
    actionDisabled?: boolean;
    actionRef?: HTMLButtonElement | null;
    showProgress?: boolean;
    progressAppearance?: "dots" | "steps";
  } = $props();

  // A new label ("Next" becoming "Continue to Hand Placements") eases the
  // button to its new width while the words fade in, instead of snapping.
  let labelElement = $state<HTMLElement | null>(null);
  let widthMotion: IntrinsicSizeMotion | null = null;
  let labelFade: ReturnType<typeof createDestinationFade> | null = null;
  let widthBefore: number | null = null;

  $effect(() => {
    const button = actionRef;
    if (!button) return;
    const motion = createIntrinsicSizeMotion(button, {
      dimension: "width",
      release: true,
    });
    widthMotion = motion;
    return () => {
      motion.cancel();
      if (widthMotion === motion) widthMotion = null;
    };
  });

  $effect(() => {
    const element = labelElement;
    if (!element) return;
    const fade = createDestinationFade(element);
    labelFade = fade;
    return () => {
      fade.destroy();
      if (labelFade === fade) labelFade = null;
    };
  });

  // Before the DOM takes the new label: the width on screen, mid-ease included.
  $effect.pre(() => {
    void label;
    untrack(() => {
      widthBefore = actionRef?.offsetWidth ?? null;
    });
  });

  $effect(() => {
    void label;
    untrack(() => {
      const button = actionRef;
      const from = widthBefore;
      widthBefore = null;
      if (!button || from === null || !widthMotion) return;
      widthMotion.cancel();
      const target = button.offsetWidth;
      if (Math.abs(target - from) < 0.5) return;
      const animation = widthMotion.resize(from, target);
      labelFade?.play();
      if (!animation) return;
      // The words keep one line while the box is narrower than they are.
      button.dataset.resizing = "";
      const settle = () => delete button.dataset.resizing;
      animation.addEventListener("finish", settle, { once: true });
      animation.addEventListener("cancel", settle, { once: true });
    });
  });
</script>

<div class="lesson-stage-controls" class:navigation={onPrevious !== undefined}>
  {#if onPrevious}
    <PanelButton
      variant="secondary"
      onclick={onPrevious}
      disabled={previousDisabled}
    >
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      <span>{previousLabel}</span>
    </PanelButton>
    <div class="progress-stack">
      <ExperienceProgressIndicator
        {currentStep}
        {totalSteps}
        appearance={progressAppearance}
      />
      {#if curriculumLabel}
        <span class="curriculum-progress">{curriculumLabel}</span>
      {/if}
    </div>
    <PanelButton
      variant="primary"
      onclick={onAction}
      disabled={actionDisabled}
      bind:ref={actionRef}
    >
      <span bind:this={labelElement}>{label}</span>
      {#if actionIcon === "check"}
        <i class="fa-solid fa-check" aria-hidden="true"></i>
      {:else}
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      {/if}
    </PanelButton>
  {:else}
    <button
      class="primary-action"
      onclick={onAction}
      disabled={actionDisabled}
      bind:this={actionRef}
      ><span bind:this={labelElement}>{label}</span></button
    >
    {#if showProgress}<ExperienceProgressIndicator
        {currentStep}
        {totalSteps}
        appearance={progressAppearance}
      />{/if}
  {/if}
</div>

<style>
  .lesson-stage-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
  }

  .lesson-stage-controls.navigation {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    width: 100%;
  }

  .progress-stack {
    display: grid;
    justify-items: center;
    gap: 0.2rem;
  }

  .curriculum-progress {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .navigation > :global(:first-child) {
    justify-self: start;
  }

  .navigation > :global(:last-child) {
    justify-self: end;
  }

  .primary-action {
    min-width: min(100%, 15rem);
    min-height: var(--min-touch-target, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 2rem;
    border: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-text);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .primary-action:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--theme-accent) 80%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    box-shadow: 0 8px 24px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .primary-action:active {
    transform: scale(0.98);
  }

  .primary-action:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }

  .lesson-stage-controls :global([data-resizing]) {
    overflow: clip;
    white-space: nowrap;
  }

  .primary-action:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .primary-action {
      transition: none;
    }
  }

  @container (max-width: 560px) {
    .lesson-stage-controls.navigation {
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .navigation .progress-stack {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-self: center;
    }

    .navigation :global(.panel-btn) {
      width: 100%;
    }
  }

  @media (min-width: 2400px) and (min-height: 1300px) {
    .navigation :global(.panel-btn) {
      min-height: 3.5rem;
      padding-inline: 1.4rem;
      font-size: 1.1rem;
    }

    .primary-action {
      min-width: 18rem;
      min-height: 56px;
      padding: 0.9rem 2.5rem;
      font-size: 1.2rem;
    }
  }
</style>

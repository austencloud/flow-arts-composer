<!--
  HorizontalTransportRow.svelte

  Transport controls row for horizontal layout mode.
  Contains step buttons (half/full step) and central play/pause button.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";

  let {
    isPlaying,
    onPlaybackToggle,
    onStepHalfBack,
    onStepHalfFwd,
    onStepFullBack,
    onRestartToStart,
    onStepFullFwd,
  }: {
    isPlaying: boolean;
    onPlaybackToggle: () => void;
    /** Half-step scrub. Omit both to ship a three-button transport — back,
     *  play, forward — for contexts where a step is the smallest unit anyone
     *  wants to move by. */
    onStepHalfBack?: () => void;
    onStepHalfFwd?: () => void;
    /** Step backward by one full step (compose context) */
    onStepFullBack?: () => void;
    /** Restart from the beginning (viewer context) - replaces step-back button when provided */
    onRestartToStart?: () => void;
    onStepFullFwd: () => void;
  } = $props();

  // Reduced-motion gate for the play/pause glyph crossfade.
  let reduceMotion = $state(false);
  onMount(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const sync = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  });

  /*
   * Double chevrons only mean "the BIGGER step" when there is a smaller one
   * beside them. On a three-button transport they are the only steppers, so a
   * single chevron is what "one step" looks like.
   */
  const stepGlyph = $derived(
    onStepHalfBack || onStepHalfFwd ? "fa-angles" : "fa-chevron"
  );
</script>

<div class="horizontal-transport-row">
  {#if onStepHalfBack}
    <button
      class="step-btn step-secondary"
      onclick={onStepHalfBack}
      aria-label={t("viewer_ui_previous_half_step")}
      data-ghost="safe"
      data-ghost-kind="step-nav"
      data-ghost-label={t("viewer_ui_previous_half_step")}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
  {/if}
  {#if onRestartToStart}
    <button
      class="step-btn step-primary"
      onclick={onRestartToStart}
      aria-label={t("viewer_ui_restart")}
      data-ghost="safe"
      data-ghost-kind="step-nav"
      data-ghost-label={t("viewer_ui_restart_short")}
    >
      <i class="fas fa-backward-fast" aria-hidden="true"></i>
    </button>
  {:else if onStepFullBack}
    <button
      class="step-btn step-primary"
      onclick={onStepFullBack}
      aria-label={t("viewer_ui_previous_step")}
      data-ghost="safe"
      data-ghost-kind="step-nav"
      data-ghost-label={t("viewer_ui_previous_step")}
    >
      <i class="fas {stepGlyph}-left" aria-hidden="true"></i>
    </button>
  {/if}

  <button
    class="play-btn"
    onclick={onPlaybackToggle}
    aria-label={isPlaying ? t("viewer_ui_pause") : t("viewer_ui_play")}
  >
    <span class="play-icon-stack">
      {#key isPlaying}
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          in:fade|local={{ duration: reduceMotion ? 0 : 160 }}
          out:fade|local={{ duration: reduceMotion ? 0 : 160 }}
        >
          {#if isPlaying}
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          {:else}
            <path d="M8 5v14l11-7z" />
          {/if}
        </svg>
      {/key}
    </span>
  </button>

  <button
    class="step-btn step-primary"
    onclick={onStepFullFwd}
    aria-label={t("viewer_ui_next_step")}
    data-ghost="safe"
    data-ghost-kind="step-nav"
    data-ghost-label={t("viewer_ui_next_step")}
  >
    <i class="fas {stepGlyph}-right" aria-hidden="true"></i>
  </button>
  {#if onStepHalfFwd}
    <button
      class="step-btn step-secondary"
      onclick={onStepHalfFwd}
      aria-label={t("viewer_ui_next_half_step")}
      data-ghost="safe"
      data-ghost-kind="step-nav"
      data-ghost-label={t("viewer_ui_next_half_step")}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  {/if}
</div>

<style>
  .horizontal-transport-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 14px;
    flex-shrink: 0;
  }

  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .step-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    transform: scale(1.05);
  }

  .step-btn:active {
    transform: scale(0.96);
  }

  /* Play/pause glyph crossfade — both SVGs stack and fade so it morphs. */
  .play-icon-stack {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .play-icon-stack svg {
    position: absolute;
    inset: 0;
    width: 28px;
    height: 28px;
  }

  .play-btn {
    width: 64px;
    height: 64px;
    min-width: 64px;
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #3b82f6) 0%,
      color-mix(in srgb, var(--theme-accent, #3b82f6) 80%, black) 100%
    );
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      transform var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .play-btn svg {
    width: 28px;
    height: 28px;
  }

  .play-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .play-btn:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .step-btn,
    .play-btn {
      transition: none;
    }
  }
</style>

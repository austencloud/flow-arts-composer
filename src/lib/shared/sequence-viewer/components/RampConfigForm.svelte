<!--
  RampConfigForm.svelte

  The practice tempo-ramp config rows (Start tempo / Loops per speed-up X /
  BPM per speed-up Y / Goal toggle + Goal tempo) plus a plain-language hint.
  Extracted from the old PracticeConfigPopover so it can render inline in the
  practice setup screen (and anywhere else a ramp form is needed) instead of
  being trapped inside a popover. Writes through onUpdate.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";
  import {
    PLAYBACK_MIN_BPM,
    PLAYBACK_MAX_BPM,
  } from "#lib/shared/animation-engine/domain/constants/timing.js";

  interface Props {
    config: Partial<TempoPracticeConfig>;
    onUpdate: (patch: Partial<TempoPracticeConfig>) => void;
  }

  let { config, onUpdate }: Props = $props();

  // Display values fall back to the orchestrator defaults.
  let startBpm = $derived(config.startBpm ?? 15);
  let increment = $derived(config.increment ?? 1);
  let roundsPerLevel = $derived(config.roundsPerLevel ?? 1);
  let targetBpm = $derived(config.targetBpm ?? 60);
  let targetEnabled = $derived(config.targetEnabled ?? false);
  let maxBpm = $derived(config.maxBpm ?? PLAYBACK_MAX_BPM);

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function setStartBpm(next: number) {
    onUpdate({ startBpm: clamp(next, PLAYBACK_MIN_BPM, 120) });
  }
  function setIncrement(next: number) {
    onUpdate({ increment: clamp(next, 1, 30) });
  }
  function setRounds(next: number) {
    onUpdate({ roundsPerLevel: clamp(next, 1, 20) });
  }
  function setTargetBpm(next: number) {
    onUpdate({ targetBpm: clamp(next, startBpm + 5, maxBpm) });
  }
  function toggleTarget() {
    onUpdate({ targetEnabled: !targetEnabled });
  }

  // Plain-language summary of the current ramp.
  let everyPhrase = $derived(
    roundsPerLevel === 1 ? "every loop" : `every ${roundsPerLevel} loops`
  );
  let hint = $derived(
    targetEnabled
      ? `Climbs +${increment} BPM ${everyPhrase} up to ${clamp(targetBpm, startBpm + 5, maxBpm)} BPM, then stops.`
      : `Climbs +${increment} BPM ${everyPhrase} up to ${maxBpm} BPM.`
  );
</script>

<div class="config-body">
  {@render stepper(
    t("viewer_detail_start_tempo"),
    startBpm,
    "BPM",
    () => setStartBpm(startBpm - 5),
    () => setStartBpm(startBpm + 5)
  )}
  {@render stepper(
    t("viewer_detail_loops_per_speed_up"),
    roundsPerLevel,
    "",
    () => setRounds(roundsPerLevel - 1),
    () => setRounds(roundsPerLevel + 1)
  )}
  {@render stepper(
    "BPM per speed-up",
    increment,
    "",
    () => setIncrement(increment - 1),
    () => setIncrement(increment + 1)
  )}

  <div class="config-row">
    <span class="config-label">{t("viewer_ui_stop_at_a_goal")}</span>
    <button
      type="button"
      class="goal-toggle"
      class:on={targetEnabled}
      onclick={toggleTarget}
      aria-pressed={targetEnabled}
      aria-label={targetEnabled ? t("viewer_detail_goal_on") : t("viewer_detail_goal_off")}
    >
      <span class="goal-knob"></span>
    </button>
  </div>

  {#if targetEnabled}
    {@render stepper(
      t("viewer_detail_goal_tempo"),
      clamp(targetBpm, startBpm + 5, maxBpm),
      "BPM",
      () => setTargetBpm(targetBpm - 5),
      () => setTargetBpm(targetBpm + 5)
    )}
  {/if}

  <p class="config-hint">{hint}</p>
</div>

{#snippet stepper(
  label: string,
  value: number,
  unit: string,
  onMinus: () => void,
  onPlus: () => void
)}
  <div class="config-row">
    <span class="config-label">{label}</span>
    <div class="stepper">
      <button
        type="button"
        class="step-btn"
        onclick={onMinus}
        aria-label={`Decrease ${label}`}
      >
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>
      <span class="step-value"
        >{value}{#if unit}<span class="step-unit">{unit}</span>{/if}</span
      >
      <button
        type="button"
        class="step-btn"
        onclick={onPlus}
        aria-label={`Increase ${label}`}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  </div>
{/snippet}

<style>
  .config-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .config-label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 9px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 0.7rem;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .step-btn:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
    }
  }

  .step-btn:active {
    transform: scale(0.92);
  }

  .step-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .step-value {
    min-width: 56px;
    text-align: center;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    color: var(--theme-text, white);
    font-variant-numeric: tabular-nums;
  }

  .step-unit {
    font-size: var(--font-size-compact, 11px);
    font-weight: 600;
    opacity: 0.55;
    margin-left: 3px;
  }

  /* Goal on/off — a switch (button + sliding knob), never a checkbox. */
  .goal-toggle {
    position: relative;
    width: 46px;
    height: 28px;
    flex-shrink: 0;
    padding: 0;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }
  .goal-toggle .goal-knob {
    position: absolute;
    top: 50%;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    transform: translate(0, -50%);
    transition:
      transform var(--duration-fast, 150ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      background var(--duration-fast, 150ms) ease;
  }
  .goal-toggle.on {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 55%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 70%,
      transparent
    );
  }
  .goal-toggle.on .goal-knob {
    transform: translate(18px, -50%);
    background: #fff;
  }
  .goal-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .goal-toggle,
    .goal-toggle .goal-knob {
      transition: none;
    }
  }

  .config-hint {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
</style>
